import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.CHORDNOTE_NEXT_DIST_DIR ?? ".next",
  devIndicators: false,
  // PGlite 自带 WASM 与 worker 文件，必须由 Node 在运行期从 node_modules 直接解析；
  // 交给打包器会把 .wasm 路径搅乱。
  serverExternalPackages: ["@electric-sql/pglite", "@deepseek-ai/dsh-sdk-client"],
  // dsh plug-ins are loaded from paths at runtime, so include only these local
  // files explicitly. Their package dependencies are already traced from the
  // server-side imports; globbing whole pnpm package trees stalls Windows
  // standalone builds and needlessly inflates the desktop runtime.
  outputFileTracingIncludes: { "/*": ["./lib/agent/*.mjs", "./lib/agent/Schema.md"] },
};

export default nextConfig;
