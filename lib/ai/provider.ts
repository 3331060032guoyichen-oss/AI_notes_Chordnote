/**
 * 模型 Provider 传输层。
 *
 * 这一层只做协议适配：收统一的 messages / tools，吐统一的 content / toolCalls / 错误码。
 * 提示词、业务校验、Agent 工具授权与 Proposal 状态机都在上层，不归供应商所有。
 *
 * 线格式采用 OpenAI 兼容的 `/chat/completions`。DeepSeek、Ollama 的 `/v1` 与自定义
 * 兼容接口共用同一份实现；不兼容的字段一律由适配层收口，不扩散到调用方。
 */

/** 传给模型的函数定义（OpenAI 兼容线格式）。 */
export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

/** 模型要求调用某个工具。`arguments` 是 JSON **字符串**，要自己解析。 */
export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * 多轮对话里的一条消息。
 *
 * 工具循环要按这个形状把 assistant 的 `tool_calls` 原样回传，否则上游会拒绝。
 */
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatResult = {
  /** 模型的自然语言回复。只调工具不讲话时是空串。 */
  content: string;
  /** 模型要求调用的工具。空数组表示本轮没有工具调用。 */
  toolCalls: ChatToolCall[];
};

export type ProviderErrorCode =
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "UPSTREAM_INVALID_JSON";

/** 所有 provider 共用的错误类型。路由只认这些 code，不认供应商。 */
export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  /** HTTP 状态码；网络层失败时为空。 */
  readonly status?: number;

  constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
  }
}

export type ProviderId = "deepseek" | "ollama" | "custom";

export type ChatProviderConfig = {
  provider: ProviderId;
  baseUrl: string;
  model: string;
  apiKey: string | null;
  timeoutMs: number;
  /** 测试接缝：注入假 fetch，不需要联网或真实密钥。生产不传。 */
  fetchImpl?: typeof fetch;
};

export type ChatInput = {
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  /** 要求 JSON 输出。仅对明确支持的供应商发 response_format，见下方注释。 */
  json?: boolean;
};

export interface ChatProvider {
  chat(input: ChatInput): Promise<ChatResult>;
  listModels(): Promise<string[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isToolCall(value: unknown): value is ChatToolCall {
  if (!isRecord(value)) return false;

  const fn = value.function;

  return (
    typeof value.id === "string" &&
    value.type === "function" &&
    isRecord(fn) &&
    typeof fn.name === "string" &&
    typeof fn.arguments === "string"
  );
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

function authHeaders(apiKey: string | null): Record<string, string> {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

/**
 * 发一次请求并把响应信封收口。
 *
 * 超时、网络失败、HTTP 错误、非 JSON 响应在这里统一成 ProviderError，
 * 上层路由不需要知道用的是哪个供应商。
 */
async function requestJson(
  config: ChatProviderConfig,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const fetchImpl = config.fetchImpl ?? fetch;

  try {
    let response: Response;

    try {
      response = await fetchImpl(joinUrl(config.baseUrl, path), {
        method: init.method,
        headers: {
          ...authHeaders(config.apiKey),
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: controller.signal,
      });
    } catch (error) {
      if (isRecord(error) && error.name === "AbortError") {
        throw new ProviderError("TIMEOUT", `Model provider timed out after ${config.timeoutMs}ms.`);
      }

      throw new ProviderError("UPSTREAM_ERROR", "Model provider is unreachable.");
    }

    if (!response.ok) {
      // 把上游错误正文截一段带上：模型名不存在这类问题只能从正文里看出来。
      let detail = "";

      try {
        detail = (await response.text()).slice(0, 200).trim();
      } catch {
        /* 读不到正文就只报状态码 */
      }

      throw new ProviderError(
        "UPSTREAM_ERROR",
        `Model provider returned HTTP ${response.status}${detail ? `: ${detail}` : ""}.`,
        response.status,
      );
    }

    try {
      return await response.json();
    } catch {
      throw new ProviderError("UPSTREAM_INVALID_JSON", "Model provider returned a non-JSON response.");
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 建一个 OpenAI 兼容的 provider。
 *
 * 只支持一个适配器是有意的：DeepSeek 与 Ollama 的 `/v1` 都能用这条线格式。
 * 若某个本地模型的工具调用必须走原生协议，再另写一个实现 `ChatProvider` 的文件。
 */
export function createChatProvider(config: ChatProviderConfig): ChatProvider {
  if (!config.baseUrl.trim() || !config.model.trim()) {
    throw new ProviderError("CONFIG_INVALID", "Model provider is not fully configured.");
  }

  if (config.provider === "deepseek" && !config.apiKey) {
    throw new ProviderError("CONFIG_MISSING", "DeepSeek API key is not configured.");
  }

  return {
    async chat(input) {
      const payload = await requestJson(config, "/chat/completions", {
        method: "POST",
        body: {
          model: config.model,
          temperature: 0.2,
          messages: input.messages,
          // 空工具列表会让部分后端直接报错；没有工具时干脆不发这个字段。
          ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
          // response_format 是供应商差异最大的一处：DeepSeek 与多数兼容接口支持，
          // Ollama 的兼容层不保证。JSON 要求改为只发支持的供应商。
          ...(input.json && config.provider !== "ollama"
            ? { response_format: { type: "json_object" } }
            : {}),
          // 刻意不发 tool_choice：DeepSeek 的默认值是 auto，而 Ollama 的兼容层
          // 对它的支持没有保证。少一个供应商专属字段，就少一处分叉。
        },
      });

      if (!isRecord(payload)) {
        throw new ProviderError("UPSTREAM_INVALID_JSON", "Model provider returned an invalid envelope.");
      }

      const choices = payload.choices;

      if (!Array.isArray(choices) || !isRecord(choices[0]) || !isRecord(choices[0].message)) {
        throw new ProviderError("UPSTREAM_INVALID_JSON", "Model provider returned no message.");
      }

      const message = choices[0].message;
      const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

      return {
        content: typeof message.content === "string" ? message.content.trim() : "",
        toolCalls: rawCalls.filter(isToolCall),
      };
    },

    async listModels() {
      const payload = await requestJson(config, "/models", { method: "GET" });

      if (!isRecord(payload) || !Array.isArray(payload.data)) {
        throw new ProviderError("UPSTREAM_INVALID_JSON", "Model provider returned an invalid model list.");
      }

      return payload.data
        .map((item) => (isRecord(item) && typeof item.id === "string" ? item.id : null))
        .filter((id): id is string => Boolean(id));
    },
  };
}
