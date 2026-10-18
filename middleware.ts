import { NextResponse, type NextRequest } from "next/server";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const WRITE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

function hostnameFromHostHeader(value: string | null): string | null {
  if (!value) return null;

  try {
    return new URL(`http://${value}`).hostname;
  } catch {
    return null;
  }
}

function trustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const url = new URL(origin);

    if (process.env.CHORDNOTE_DESKTOP === "1") {
      return url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "3210";
    }

    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * API 只接受回环 Host，写请求还要求浏览器 Origin 为受信任的本机页面。
 * 这同时阻断了 DNS rebinding 的 Host，以及外站页面向 localhost 发起的写请求。
 * 非浏览器本机客户端没有 Origin；桌面专用关闭接口另有随机令牌。
 */
export function middleware(request: NextRequest) {
  const hostname = hostnameFromHostHeader(request.headers.get("host"));

  if (!hostname || !LOOPBACK_HOSTS.has(hostname)) {
    return NextResponse.json({ error: "LOCAL_HOST_REQUIRED" }, { status: 403 });
  }

  if (WRITE_METHODS.has(request.method) && !trustedOrigin(request)) {
    return NextResponse.json({ error: "LOCAL_ORIGIN_REQUIRED" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
