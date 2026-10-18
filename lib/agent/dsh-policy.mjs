// Loaded by dsh, never by the browser. No filesystem/database capability is exposed.
export const inject = ["tools", "systemPrompt"];
export async function apply(ctx) {
  const url = process.env.CHORDNOTE_BRIDGE;
  const headers = { authorization: `Bearer ${process.env.CHORDNOTE_RUN_TOKEN}`, "content-type": "application/json" };
  const configResponse = await fetch(`${url}/config`, { headers });
  if (!configResponse.ok) throw new Error("Chordnote policy initialization failed");
  const config = await configResponse.json();
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
