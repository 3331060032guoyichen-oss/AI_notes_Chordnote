// Loaded by dsh, never by the browser. No filesystem/database capability is exposed.
export const inject = ["tools", "systemPrompt", "llm"];
export async function apply(ctx) {
  const url = process.env.CHORDNOTE_BRIDGE;
  const headers = { authorization: `Bearer ${process.env.CHORDNOTE_RUN_TOKEN}`, "content-type": "application/json" };
  const configResponse = await fetch(`${url}/config`, { headers });
  if (!configResponse.ok) throw new Error("Chordnote policy initialization failed");
  const config = await configResponse.json();
  // Guard every model request, including subsequent tool rounds. Reserve output room.
  ctx.on("llm/stream", async function* (options, next) {
    const size = Buffer.byteLength(JSON.stringify({ messages: options.messages, tools: options.tools }));
    if (size > config.contextBudget - 4096) {
      await fetch(`${url}/budget-exceeded`, { method: "POST", headers });
      throw new Error("Chordnote context budget exceeded");
    }
    yield* next();
  });
  // Replay only completed host-owned turns; never execute historical tool calls.
  ctx.on("session/created", session => {
    for (const event of config.history ?? []) {
      if (event.type === "tool/call") session.append(event.type, event.data);
      else if (["user/message", "assistant/message", "tool/result"].includes(event.type)) {
        session.append(event.type, event.data, { surfaceOp: "append" });
      }
    }
  });
  const allowed = new Set(config.tools.map(t => t.function.name));
  ctx.tools.guard(exec => allowed.has(exec.name) ? undefined : "Denied by Chordnote policy");
  for (const { function: tool } of config.tools) {
    ctx.tools.register({
      name: tool.name, description: tool.description, parameters: tool.parameters,
      output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
      async execute(args, exec) {
        const response = await fetch(`${url}/tool`, {
          method: "POST", headers, signal: exec.signal,
          body: JSON.stringify({ name: tool.name, args }),
        });
        if (!response.ok) throw new Error("Chordnote tool request rejected");
        return (await response.json()).result;
      },
    });
  }
  ctx.systemPrompt.section({ name: "chordnote-schema", order: 10, text: config.schema, interpolate: false });
  ctx.systemPrompt.section({ name: "chordnote-runtime", order: 20, text: JSON.stringify(config.runtime), interpolate: false });
  const ready = await fetch(`${url}/ready`, { method: "POST", headers });
  if (!ready.ok) throw new Error("Chordnote policy handshake failed");
  ctx.provide("chordnotePolicy", true);
}
