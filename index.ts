import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph } from "@langchain/langgraph";
import { MemorySaver, Annotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";


// Refer: https://www.youtube.com/watch?v=Un-88uJKdiU&list=PLfaIDFEXuae16n2TWUkKq5PgJ0w6Pkwtg&index=3

// Define the tools for the agent to use
const tools = [new TavilySearchResults({ maxResults: 1 })];


// Define the graph state
// See here for more info: https://langchain-ai.github.io/langgraphjs/how-tos/define-state/

/* 
The main type of graph in langgraph is the StatefulGraph. This graph is parameterized by a state object that it passes around to each node. Each node then returns operations to update that state. These operations can either SET specific attributes on the state (e.g. overwrite the existing values) or ADD to the existing attribute. 
* Whether to set or add is denoted by annotating the state object you construct the graph with. For this example, the state we will track will just be a list of messages. We want each node to just add messages to that list. Therefore, we will use a map with one key ( messages ) and annotate it so that the messages attribute is always added to.
*/

const StateAnnotation = Annotation.Root({
  // Define a 'messages' channel to store an array of BaseMessage objects
  messages: Annotation<BaseMessage[]>({
    // Reducer function: Combines the current state with new messages
    reducer: (currentState, updateValue) => currentState.concat(updateValue),
    // Default function: Initialize the channel with an empty array
    default: () => [],
  })
});


// Define the nodes
/**
 * Nodes can be funcitons of a Runnable like an agent itself
 */

// ----------- TOOL NODE -----------
const toolNode = new ToolNode(tools);

// ----------- SHOULD_CONTINUE NODE -----------

// Define the function that determines whether to continue or not
/**
 * 
 * Basically shouldContinue function will be used to determine which conditional edge to go down  
 */
// We can extract the state typing via `StateAnnotation.State`
function shouldContinue(state: typeof StateAnnotation.State) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;

  // If the LLM makes a tool call, then we route to the "tools" node
  if (lastMessage.tool_calls?.length) {
    return "tools";
  }
  // Otherwise, we stop (reply to the user)
  return "__end__";
}

//  ----------- MODEL NODE or AGENT NODE -----------
const model = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0,
}).bindTools(tools);

// Define the function that calls the model, and this function will be used to define model node
async function callModel(state: typeof StateAnnotation.State) {
  const messages = state.messages;
  const response = await model.invoke(messages);

  // We return a list, because this will get added to the existing list
  return { messages: [response] };
}



// Define a new graph
const graph = new StateGraph(StateAnnotation)
  .addNode("agent", callModel) // Name of the node is agent and it's the MODEL NODE
  .addNode("tools", toolNode)  // Name of the node is tools and it's the TOOL NODE
  .addEdge("__start__", "agent") // add Edge between builtin START node and agent Node
  .addConditionalEdges("agent", shouldContinue) // add Edge between MODEL node and SHOULD CONTINUE Node
  .addEdge("tools", "agent"); // add Edge between TOOL node and MODEL Node


// Initialize memory to persist state between graph runs
const checkpointer = new MemorySaver();

// Finally, we compile it!
// This compiles it into a LangChain Runnable.
// Note that we're (optionally) passing the memory when compiling the graph
const app = graph.compile({ checkpointer });

// Use the Runnable
async function getFinalState(){
  const finalState = await app.invoke(
    { messages: [new HumanMessage("What is LangGraph??")] },
    { configurable: { thread_id: "42" } }
  );

  return finalState
  
}

// Call the Runnable and get output from it
getFinalState().then(fs => {

  fs.messages.forEach((message: any) => {
    console.log(message.content)
    console.log("-------------")
  });
  // console.log(fs.messages[fs.messages.length - 1].content);
})

