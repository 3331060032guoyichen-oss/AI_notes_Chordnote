/** Agent 一次运行的轨迹。前端按 `steps` 渲染时间轴，按 `counters` 渲染运行审计。 */

/**
 * 步骤类型。
 *
 * - `auto`     —— 自动执行（读材料、检索、通读），跑完就有结论；
 * - `gate`     —— 等待用户确认。方案已经生成，但是否落库由用户决定；
 * - `boundary` —— 权限边界。用来把"到这里为止了"讲清楚，不是失败。
 */
export type AgentStepKind = "auto" | "gate" | "boundary";

export type AgentStepStatus = "done" | "pending" | "blocked" | "failed";

export type AgentStep = {
  /** 从 1 开始的展示序号。 */
  index: number;
  /** 工具名，如 `search_notes`；边界步骤用 `boundary`。 */
  tool: string;
  /** 面向用户的步骤名，如「查找笔记」，来自工作手册。 */
  label: string;
  /**
   * 步骤名下面那句人话说明，如「在你的知识库中寻找相关知识页」。
   *
   * 由宿主按工具名从工作手册补齐（见 `createStepRecorder`），所以调用方不必逐个传。
   * `tool` 是机器名，只用于排查，不展示给用户。
   */
  hint: string | null;
  kind: AgentStepKind;
  status: AgentStepStatus;
  /** 面向用户的一句话结论。不是模型的思考过程。 */
  detail: string;
  /** `gate` 步骤：生成的提议 id，前端据此调 approve / apply。 */
  proposalId: string | null;
  /** `gate` 步骤：渲染确认卡需要的字段（两侧标题、理由、原文…）。 */
  payload: Record<string, unknown> | null;
};

export type AgentRunCounters = {
  /** 自动读取类调用次数。 */
  autoCalls: number;
  /** 本次运行产生的、还等你确认的提议数。 */
  pendingProposals: number;
  /**
   * 模型试图调用未授权工具的次数。
   *
   * 正常运行时恒为 0——未授权的工具**根本不会出现在模型的 tools 列表里**，
   * 所以它无从调用。这个计数是给"万一"留的观测位，不是预期会涨的数字。
   */
  blockedAttempts: number;
  /**
   * Agent 直接越权写入的条目数。
   *
   * **结构上恒为 0**：工具循环里没有任何写正式数据的路径，所有写意图都只能
   * 变成 status='pending' 的提议。这个字段留着是为了让它可被断言，而不是可被观察。
   */
  unauthorizedWrites: 0;
};

export type AgentRunTrace = {
  runtime?: { engine: string; version: string; provider: string; model: string; tools: string[]; permissions: Record<string, unknown> };
  id: string;
  manualVersion: string;
  /**
   * 本次授权范围内的工具清单，来自工作手册。
   *
   * 随轨迹一起下发，而不是让界面去 import `lib/agent/manual`——
   * 界面只该消费服务端的结论，不该把服务端模块打进客户端包。
   */
  authorization: Array<{ name: string; label: string; access: "auto" | "proposal" | "blocked" }>;
  contextType: "raw" | "knowledge" | "draft" | "none";
  contextId: string | null;
  /** 面包屑用：这次整理的材料叫什么。 */
  contextTitle: string | null;
  steps: AgentStep[];
  counters: AgentRunCounters;
  /** 模型收尾时那句话。可能为空。 */
  message: string;
};
