import {
    ChatPromptTemplate,
    MessagesPlaceholder,
  } from "@langchain/core/prompts";
import { StructuredTool } from "@langchain/core/tools";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import { Runnable } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

// Required d3.js for Chart tool
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { tool } from "@langchain/core/tools";
import * as d3 from "d3";
import { createCanvas } from "canvas";
import { z } from "zod";
import * as tslab from "tslab";


/**
 * Create an agent that can run a set of tools.
 */
async function createAgent({
    llm,
    tools,
    systemMessage,
    }: {
    llm: ChatOpenAI;
    tools: StructuredTool[];
    systemMessage: string;
    }): Promise<Runnable> {
    const toolNames = tools.map((tool) => tool.name).join(", ");
    const formattedTools = tools.map((t) => convertToOpenAITool(t));

    let prompt = ChatPromptTemplate.fromMessages([
        [
        "system",
        "You are a helpful AI assistant, collaborating with other assistants." +
        " Use the provided tools to progress towards answering the question." +
        " If you are unable to fully answer, that's OK, another assistant with different tools " +
        " will help where you left off. Execute what you can to make progress." +
        " If you or any of the other assistants have the final answer or deliverable," +
        " prefix your response with FINAL ANSWER so the team knows to stop." +
        " You have access to the following tools: {tool_names}.\n{system_message}",
        ],
        new MessagesPlaceholder("messages"),
    ]);
    prompt = await prompt.partial({
        system_message: systemMessage,
        tool_names: toolNames,
    });

    return prompt.pipe(llm.bind({ tools: formattedTools }));
}


/**
 * 
 * Define State
    We first define the state of the graph. This will just be a list of messages, along with a key to track the most recent sender
 */


    
// This defines the object that is passed between each node
// in the graph. We will create different nodes for each agent and tool
const AgentState = Annotation.Root({
      messages: Annotation<BaseMessage[]>({
        reducer: (x, y) => x.concat(y),
      }),
      sender: Annotation<string>({
        reducer: (x, y) => y ?? x ?? "user",
        default: () => "user",
      }),
})

// Define tools
// These tools will be used by our worker agents to answer our questions.

// We will create a chart tool (using d3.js), and the LangChain TavilySearchResults tool for web search functionality.


//Install canvas dependecies to see the graph
// brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman


// -------- CHART TOOL -----

const chartTool = tool(
    ({ data }) => {
      const width = 500;
      const height = 500;
      const margin = { top: 20, right: 30, bottom: 30, left: 40 };
  
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
  
      const x = d3
        .scaleBand()
        .domain(data.map((d) => d.label))
        .range([margin.left, width - margin.right])
        .padding(0.1);
  
      const y = d3
        .scaleLinear()
        .domain([0, d3.max(data, (d) => d.value) ?? 0])
        .nice()
        .range([height - margin.bottom, margin.top]);
  
      const colorPalette = [
        "#e6194B",
        "#3cb44b",
        "#ffe119",
        "#4363d8",
        "#f58231",
        "#911eb4",
        "#42d4f4",
        "#f032e6",
        "#bfef45",
        "#fabebe",
      ];
  
      data.forEach((d, idx) => {
        ctx.fillStyle = colorPalette[idx % colorPalette.length];
        ctx.fillRect(
          x(d.label) ?? 0,
          y(d.value),
          x.bandwidth(),
          height - margin.bottom - y(d.value),
        );
      });
  
      ctx.beginPath();
      ctx.strokeStyle = "black";
      ctx.moveTo(margin.left, height - margin.bottom);
      ctx.lineTo(width - margin.right, height - margin.bottom);
      ctx.stroke();
  
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      x.domain().forEach((d) => {
        const xCoord = (x(d) ?? 0) + x.bandwidth() / 2;
        ctx.fillText(d, xCoord, height - margin.bottom + 6);
      });
  
      ctx.beginPath();
      ctx.moveTo(margin.left, height - margin.top);
      ctx.lineTo(margin.left, height - margin.bottom);
      ctx.stroke();
  
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      const ticks = y.ticks();
      ticks.forEach((d) => {
        const yCoord = y(d); // height - margin.bottom - y(d);
        ctx.moveTo(margin.left, yCoord);
        ctx.lineTo(margin.left - 6, yCoord);
        ctx.stroke();
        ctx.fillText(d.toString(), margin.left - 8, yCoord);
      });
      tslab.display.png(canvas.toBuffer());
      return "Chart has been generated and displayed to the user!";
    },
    {
      name: "generate_bar_chart",
      description:
        "Generates a bar chart from an array of data points using D3.js and displays it for the user.",
      schema: z.object({
        data: z
          .object({
            label: z.string(),
            value: z.number(),
          })
          .array(),
      }),
    }
  )

  
// -------- TAVILY TOOL -----
const tavilyTool = new TavilySearchResults();


// Create graph
// Now that we've defined our tools and made some helper functions, will create the individual agents below and tell them how to talk to each other using LangGraph.

// Define Agent Nodes
// In LangGraph, nodes represent functions that perform the work. In our example, we will have "agent" nodes and a "callTool" node.

// The input for every node is the graph's state. In our case, the state will have a list of messages as input, as well as the name of the previous node.

// First, let's define the nodes for the agents.

import { HumanMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";

// Helper function to run a node for a given agent
async function runAgentNode(props: {
  state: typeof AgentState.State;
  agent: Runnable;
  name: string;
  config?: RunnableConfig;
}) {
  const { state, agent, name, config } = props;
  let result = await agent.invoke(state, config);
  // We convert the agent output into a format that is suitable
  // to append to the global state
  if (!result?.tool_calls || result.tool_calls.length === 0) {
    // If the agent is NOT calling a tool, we want it to
    // look like a human message.
    result = new HumanMessage({ ...result, name: name });
  }
  return {
    messages: [result],
    // Since we have a strict workflow, we can
    // track the sender so we know who to pass to next.
    sender: name,
  };
}

const llm = new ChatOpenAI({ modelName: "gpt-4o" });

// Research agent and node
// let researchAgent: any;

// createAgent({
//     llm,
//     tools: [tavilyTool],
//     systemMessage:
//       "You should provide accurate data for the chart generator to use.",
//   }).then(research_agent => {
//     researchAgent = research_agent
//   })


const researchAgent = await createAgent({
  llm,
  tools: [tavilyTool],
  systemMessage:
    "You should provide accurate data for the chart generator to use.",
});

async function researchNode(
    state: typeof AgentState.State,
    config?: RunnableConfig,
  ) {
    return runAgentNode({
      state: state,
      agent: researchAgent,
      name: "Researcher",
      config,
    });
  }

// Chart Generator


// let chartAgent: any;

// createAgent({
//     llm,
//     tools: [tavilyTool],
//     systemMessage: "Any charts you display will be visible by the user.",
//   }).then(chart_agent => {
//     chartAgent = chart_agent
//   })

const chartAgent = await createAgent({
  llm,
  tools: [chartTool],
  systemMessage: "Any charts you display will be visible by the user.",
});

async function chartNode(state: typeof AgentState.State) {
  return runAgentNode({
    state: state,
    agent: chartAgent,
    name: "ChartGenerator",
  });
}



// Example invocation
const researchResults = await researchNode({
    messages: [new HumanMessage("Research the US primaries in 2024")],
    sender: "User",
  });

console.log(researchResults)

// researchNode({
//     messages: [new HumanMessage("Research the US primaries in 2024")],
//     sender: "User",
//   }).then(researchResults => console.log(researchResults)
// )
  