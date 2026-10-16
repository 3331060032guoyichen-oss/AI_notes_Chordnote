import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // PGlite 自带 WASM 与 worker 文件，必须由 Node 在运行期从 node_modules 直接解析；
  // 交给打包器会把 .wasm 路径搅乱。
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
