# langgraph-multi-agent
langgraph-multi-agent


## Usage
```bash
npm install 

export TAVILY_API_KEY=tvly-<>

export OPENAI_API_KEY=sk-.........
```


* Change Your query as:

```javascript
async function getFinalState(){
  const finalState = await app.invoke(
    { messages: [new HumanMessage("<YOUR QUERY>")] },
    { configurable: { thread_id: "42" } }
  );

  return finalState
  
}
```

* And run to see all intermediate tool calls and Agent in action

```bash
ts-node --esm index.ts
```



## Docs

* (GitHub)[https://github.com/langchain-ai/langgraphjs/blob/main/examples/multi_agent/multi_agent_collaboration.ipynb]

* (Tutorial)[https://www.youtube.com/watch?v=hvAPnpSfSGo&list=PLfaIDFEXuae16n2TWUkKq5PgJ0w6Pkwtg&index=9]