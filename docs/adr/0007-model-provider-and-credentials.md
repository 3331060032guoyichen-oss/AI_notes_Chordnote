# 模型调用与供应商解耦：Provider 只管传输，配置与凭据归服务端

现有实现只有一个 `lib/deepseek.ts`：传输、提示词、JSON 校验和 DeepSeek 专属配置混在一起。设置面板里的模型选择与 API Key 只存在浏览器 localStorage，后端完全不知道它们。目标是支持 Ollama 与自定义兼容接口，同时保住"同一套 Agent 权限、Proposal 状态机与知识库规则"。

## 决定

1. **Provider 只做传输。** `lib/ai/provider.ts` 接收统一 `messages` / `tools`，返回 `content` / `toolCalls` / 统一错误码。提示词、草稿校验、Agent 工具授权与提议状态机留在上层（`lib/ai/tasks.ts`、`lib/agent/`）。不为任何供应商复制提示词。
2. **先只实现 OpenAI 兼容协议。** DeepSeek、Ollama 的 `/v1`、自定义兼容接口共用同一个适配器。暂不为 Ollama 写原生 `/api/chat`。
3. **服务端单一配置。** `data/settings.json`（已被 `.gitignore` 的 `data/*` 挡住）。不做每请求选模型；浏览器不能通过请求参数覆盖供应商、地址或凭据。
4. **优先级固定为**：`CHORDNOTE_*` 环境变量 > 旧 `DEEPSEEK_*`（仅在 provider=deepseek 时）> 配置文件 > 内置默认值。被环境变量锁住的字段在界面上禁用，接口拒绝修改。
5. **凭据只存服务端。** `apiKey` 不出现在任何响应、日志、导出知识包或前端代码里；GET 只回 `apiKeyConfigured`。更新语义：不传 = 保持，`null` = 清除，非空字符串 = 设置。空串按"保持"处理，避免误清。
6. **写接口只接受本机来源。** 设置写入与连接测试要求 `Content-Type: application/json`，且 `Origin` 只能是 localhost / 127.0.0.1；其他来源 403。设置变更写 `audit_log`（只记 `set` / `cleared` / `unchanged`）。
7. **连接测试必须是真的。** 四步分别报告：服务可访问、模型在列表里、普通对话成功、带工具的请求返回可解析的工具调用。测试只读已保存配置，不接受请求传入地址——否则它会变成让服务器访问任意地址的入口。
8. **离线测试不联网。** Provider 与配置测试用注入的 `fetch`，不需要真实密钥。命令为 `pnpm test:unit`。

## 供应商差异的处理

- **不发 `tool_choice`。** DeepSeek 默认就是 auto，Ollama 兼容层对它的支持没有保证。少一个字段，少一处分叉。
- **`response_format` 只发给支持的供应商。** DeepSeek 与多数兼容接口支持 `json_object`；Ollama 兼容层不保证，因此对它省略，改由提示词约束并在上层做结构校验。
- 若 `qwen3:4b` 通过 `/v1` 无法稳定返回工具调用，再评估新增原生 `/api/chat` 适配器。**在此之前不宣称本地模型的 Agent 能力已验证。**

## 凭据存储的实际限制

- 文件写入使用 `mode: 0o600` 并在 POSIX 上显式 `chmod`。**Windows 会忽略这个模式**——它只继承目录 ACL，不等于"仅当前用户可读"。本项目没有实现系统钥匙串或静态加密。
- 因此准确表述是："密钥不出本机、不进 Git、不进响应与日志"，**不是**"强加密存储"或"系统级隔离"。
- 若将来需要更强保证，选项是 Windows DPAPI / macOS Keychain（需原生依赖）或用户自管环境变量。

## 后果

- `lib/deepseek.ts` 被删除，调用方改为 `lib/ai/provider` + `lib/ai/tasks`；错误类型统一为 `ProviderError`，路由映射逻辑不变。
- 现有 `DEEPSEEK_*` 环境变量继续可用，老用户不必改配置。
- Ollama 真连与 `qwen3:4b` 的工具调用能力**只能在用户本机验证**；沙箱到不了 `localhost:11434`。
- 其他写接口（raw / knowledge / proposals）仍未加同样来源检查；本次只收紧涉及凭据的设置接口，其余作为已知风险记录。
