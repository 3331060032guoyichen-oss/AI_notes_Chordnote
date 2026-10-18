// Stdio MCP transport exposes exactly the same authenticated host tool registry.
import { createInterface } from "node:readline";
const headers={authorization:`Bearer ${process.env.CHORDNOTE_RUN_TOKEN}`,"content-type":"application/json"};
const url=process.env.CHORDNOTE_BRIDGE;
const config=await (await fetch(`${url}/config`,{headers})).json();
for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})) {
  let request;
  try {
    request=JSON.parse(line);
    if (request.id === undefined) continue;
    let result;
    if (request.method === "initialize") result={protocolVersion:request.params?.protocolVersion ?? "2024-11-05",capabilities:{tools:{}},serverInfo:{name:"chordnote",version:"1"}};
    else if (request.method === "ping") result={};
    else if (request.method === "tools/list") result={tools:config.tools.map(({function:t})=>({name:t.name,description:t.description,inputSchema:t.parameters}))};
    else if (request.method === "tools/call") {
      const response=await fetch(`${url}/tool`,{method:"POST",headers,body:JSON.stringify({name:request.params.name,args:request.params.arguments??{}})});
      if (!response.ok) throw new Error("Tool request rejected");
      result={content:[{type:"text",text:(await response.json()).result}]};
    } else throw new Error("Unsupported method");
    process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:request.id,result})+"\n");
  } catch { if(request?.id !== undefined) process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:request.id,error:{code:-32603,message:"Chordnote tool request failed"}})+"\n"); }
}
