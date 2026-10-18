// Offline protocol fixture; never used as a product Agent.
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
const send = value => process.stdout.write(JSON.stringify({jsonrpc:"2.0",...value})+"\n");
let mcp;
process.stdin.on("end",()=>mcp?.kill());
for await (const line of createInterface({input:process.stdin})) {
  const request=JSON.parse(line);
  if (request.method === "initialize") send({id:request.id,result:{protocolVersion:1,agentCapabilities:{},agentInfo:{name:"mock-acp",version:"1"}}});
  if (request.method === "session/new") {
    const config=request.params.mcpServers[0];
    mcp=spawn(config.command,config.args,{env:{...process.env,...Object.fromEntries(config.env.map(e=>[e.name,e.value]))},stdio:["pipe","pipe","inherit"],windowsHide:true});
    send({id:request.id,result:{sessionId:"mock-session",configOptions:[{id:"model",name:"Model",category:"model",type:"select",currentValue:"mock-acp-model",options:[{name:"Mock",value:"mock-acp-model"}]}]}});
  }
  if (request.method === "session/prompt") {
    const result=await new Promise((ok,fail)=>{
      const lines=createInterface({input:mcp.stdout});
      lines.on("line",line=>{const msg=JSON.parse(line);if(msg.id===2){lines.close();if(msg.error)fail(Error('MCP failed'));else ok(msg.result)}});
      mcp.stdin.write(JSON.stringify({jsonrpc:"2.0",id:2,method:"tools/call",params:{name:"runtime_info",arguments:{}}})+"\n");
    });
    const metadata=JSON.parse(result.content[0].text);
    if(metadata.model!=="mock-acp-model" || process.env.CHORDNOTE_RUNTIME_KEY) throw Error("Metadata or credential boundary failed");
    send({method:"session/update",params:{sessionId:"mock-session",update:{sessionUpdate:"agent_message_chunk",content:{type:"text",text:"acp verified"}}}});
    send({id:request.id,result:{stopReason:"end_turn"}});
  }
}
