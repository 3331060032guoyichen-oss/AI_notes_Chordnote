// A dsh model adapter delegates generation to a real ACP Agent's own tool loop.
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { LlmAdapter } from "@deepseek-ai/dsh-llm";
import { client, methods, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";

export const inject = ["llm", "chordnotePolicy"];
export async function apply(ctx) {
  const headers = { authorization:`Bearer ${process.env.CHORDNOTE_RUN_TOKEN}`, "content-type":"application/json" };
  const bridge = process.env.CHORDNOTE_BRIDGE;
  const adminHeaders={...headers,authorization:`Bearer ${process.env.CHORDNOTE_ADMIN_TOKEN}`};
  const config = await (await fetch(`${bridge}/config`, {headers})).json();
  class AcpAdapter extends LlmAdapter {
    async *stream(options) {
      if (!options.sessionId) throw new Error("ACP requires a user session");
      const env = {...process.env};
      for (const key of Object.keys(env)) if (key.startsWith("CHORDNOTE_")) delete env[key];
      const child = spawn(config.acp.command, config.acp.args, {cwd:process.cwd(),env,windowsHide:true,stdio:["pipe","pipe","ignore"]});
      const spawned = new Promise((ok,fail)=>{child.once("spawn",ok);child.once("error",fail);});
      await spawned;
      await fetch(`${bridge}/child`,{method:"POST",headers:adminHeaders,body:JSON.stringify({pid:child.pid})});
      let text = "";
      const stop = () => child.kill();
      options.signal?.addEventListener("abort",stop,{once:true});
      try {
        const stream = ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));
        await client({name:"chordnote-dsh"})
          .onRequest(methods.client.session.requestPermission, () => ({outcome:{outcome:"cancelled"}}))
          .onNotification(methods.client.session.update, ({params}) => {
            if (params.update.sessionUpdate === "agent_message_chunk" && params.update.content.type === "text") text += params.update.content.text;
          }).connectWith(stream, async connection => {
            const init = await connection.request(methods.agent.initialize,{protocolVersion:PROTOCOL_VERSION,clientCapabilities:{}});
            const session = await connection.request(methods.agent.session.new,{cwd:process.cwd(),mcpServers:[{
              name:"chordnote",command:process.execPath,args:[config.acp.mcpScript],
              env:[{name:"CHORDNOTE_BRIDGE",value:bridge},{name:"CHORDNOTE_RUN_TOKEN",value:process.env.CHORDNOTE_RUN_TOKEN}],
            }]});
            const modelOption = session.configOptions?.find(o=>o.category === "model");
            if (modelOption && options.model !== "agent-default") {
              await connection.request(methods.agent.session.setConfigOption,{sessionId:session.sessionId,configId:modelOption.id,value:options.model});
            } else if (options.model !== "agent-default") throw new Error("ACP Agent did not expose model selection");
            const actual = {provider:`acp:${init.agentInfo?.name ?? config.acp.label}`,model:options.model === "agent-default" ? modelOption?.currentValue ?? "Agent 默认（协议未报告型号）" : options.model};
            Object.assign(config.runtime, actual);
            await fetch(`${bridge}/runtime`,{method:"POST",headers:adminHeaders,body:JSON.stringify(actual)});
            const response = await connection.request(methods.agent.session.prompt,{sessionId:session.sessionId,prompt:[{type:"text",text:JSON.stringify({schema:config.schema,runtime:config.runtime,messages:options.messages,materialIsData:true})}]});
            if (response.stopReason !== "end_turn") throw new Error("ACP Agent did not complete");
          });
        yield {type:"block-start",index:0,blockType:"text"};
        yield {type:"text-delta",index:0,text};
        yield {type:"block-end",index:0,block:{type:"text",text}};
        yield {type:"finish",reason:{kind:"stop"}};
      } finally {
        options.signal?.removeEventListener("abort",stop);
        child.kill();
      }
    }
  }
  ctx.llm.registerAdapter(["chordnote"], new AcpAdapter());
}
