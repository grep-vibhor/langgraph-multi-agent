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