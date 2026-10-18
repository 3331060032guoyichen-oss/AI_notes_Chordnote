/**
 * 本机写请求守卫。
 *
 * 设置接口能改写服务端凭据，是最值得挡住跨站请求的一处。浏览器对
 * `application/json` 的跨源请求会先发预检，而本应用不返回任何 CORS 头；
 * 再加上 Origin 只允许本机，两道合起来挡住"随便一个网页偷偷 POST 到 localhost:3000"。
 */
export function isLocalJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return false;
  }

  const origin = request.headers.get("origin");

  // 非浏览器客户端（curl、脚本）没有 Origin；桌面服务另有 shutdown token，
  // 全部 API 的 Host / Origin 守卫在 middleware.ts 统一执行。
  if (!origin) return true;

  try {
    const { hostname, port, protocol } = new URL(origin);

    if (process.env.CHORDNOTE_DESKTOP === "1") {
      return protocol === "http:" && hostname === "127.0.0.1" && port === "3210";
    }

    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
