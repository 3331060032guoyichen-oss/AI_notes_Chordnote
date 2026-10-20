# Chordnote 存储层设计

状态：草案。与 [`VAULT_SCHEMA.md`](VAULT_SCHEMA.md) 配套；本文规定文件怎么被安全读写、外部编辑怎么被发现、索引怎么保持可重建。

---

## 1. Vault 定位

用户**不需要每次进入笔记都选路径**。路径是应用级配置，不是每次操作的参数。

解析顺序：

1. 环境变量 `CHORDNOTE_VAULT_DIR`（测试与开发用）
2. 应用设置里的 `vaultPath`（与现有模型配置同一个 `settings.json`，位于 Vault 之外）
3. 默认值：`<用户文档目录>/Chordnote`

- 首次启动时，默认路径不存在就创建目录结构并写入 `CLAUDE.md`、`.gitignore`。
- 设置里的路径只存绝对路径，不写进 Vault 自身（否则无法在移动 Vault 后找到）。
- 只有「切换 Vault / 导入已有文件夹」才弹选择：桌面版用 Tauri 目录对话框；网页版（本机 Node 服务）只提供路径输入 + 校验。
- 地址栏里的笔记操作永远不携带路径，服务端从设置解析。

**校验（切换时）**：

| 检查 | 拒绝条件 |
|---|---|
| 可写 | 目录不存在、不可写、只读盘 |
| 非应用数据目录 | 位于 `data/pglite` 或 `%LOCALAPPDATA%\Chordnote` 之内 |
| 非嵌套 | 祖先目录已有 `CLAUDE.md` + `raw/` + `wiki/`（说明是另一个 Vault） |
| 非仓库 | 位于 Chordnote 源码仓库内 |
| 已有内容 | 非空且不是 Chordnote Vault（缺 `CLAUDE.md`）→ 要求显式「作为新 Vault 初始化」，不静默接管 |

**运行时约束**：网络盘、OneDrive 同步目录可以打开，但可能不产生 Watcher 事件或锁文件。启动时检测并提示，靠周期扫描兜底。

---

## 2. 单写者

- PGlite 已是进程内单写者；文件层再加一把 Vault 锁：`.chordnote/lock` 以 `O_EXCL` 创建，内容 `{ pid, startedAt, appVersion }`。
- 启动时若锁存在：pid 仍活着 → 拒绝启动并提示；pid 不存在或 `startedAt` 超过 30 秒且进程已死 → 视为残留，覆盖。
- 正常退出、`/api/desktop/shutdown` 与崩溃恢复时清理锁。
- 进程内所有写入走**同一个队列模块**；外部编辑器不受此约束，因此还需要 §3 的 hash 校验。

---

## 3. 写入管线

所有文件写入只有一个入口：

```ts
writeVaultFile({ path, content, expectedSha256, mode: "create" | "update" })
```

步骤：

1. 规范化路径，`realpath` 后必须在 Vault 根内；拒绝 `..`、绝对路径、Windows 保留名、以点或空格结尾的段。
2. 进入该路径的串行队列（`Map<path, Promise>`），同一文件不并发写。
3. 读取磁盘当前字节，计算 SHA-256：
   - `mode: "create"` 且文件已存在 → `FILE_EXISTS`
   - `mode: "update"` 且文件不存在 → `EXTERNAL_DELETE`
   - `expectedSha256` 不匹配 → `EXTERNAL_MODIFICATION`，**不写入**
4. 写临时文件（同目录 `.name.<rand>.tmp`）→ `fsync` → `rename` 覆盖。
5. 成功后同步更新索引，并写 `audit_log`。
6. 任何一步失败都不得留下半写文件；临时文件在下次启动扫描时清理。

Windows 注意：

- 目标文件被其他程序占用时 `rename` 可能返回 `EPERM` / `EBUSY`；重试 3 次、间隔 50ms，仍失败则返回 `FILE_LOCKED`，让上层提示用户。
- 临时文件必须与目标同目录，跨盘 `rename` 不是原子操作。

**已知限制**：hash 校验与 `rename` 之间仍有窗口，不是真正的 compare-and-swap。文件系统没有跨平台 CAS。这个窗口内如果另一个编辑器写入，最后落盘者获胜。靠 Watcher 与周期对账把窗口的后果收敛为「索引重新扫描」，不产生静默数据损坏。

**用户可见行为**：Chordnote 编辑器保存时若文件已被 Obsidian 改过 → 返回 `EXTERNAL_MODIFICATION`，编辑器提示「文件已被外部修改」，提供「重新载入」与「用我的版本覆盖（二次确认）」。v1 不做自动合并。

---

## 4. Watcher

选型：**chokidar**（新增依赖，需登记 `docs/THIRD_PARTY.md`；4.x 的 `ignored` 只接受函数或正则，不支持 glob 字符串）。

配置：

| 项 | 值 |
|---|---|
| `ignoreInitial` | `true`（启动扫描单独做，避免重复） |
| `awaitWriteFinish` | `{ stabilityThreshold: 200, pollInterval: 50 }` |
| 忽略 | `.chordnote/`、`.obsidian/`、`.git/`、`node_modules/`、`*.tmp`、`~$*`（Office 锁文件）、`Thumbs.db`、`.DS_Store` |
| 范围 | `raw/**`、`wiki/**`、`CLAUDE.md` |
| 事件 | `add` / `change` / `unlink` / `unlinkDir` / `error` |

事件处理：

1. 每条路径 200ms 去抖，合并为一次索引任务。
2. **自写抑制**：写入成功后记录 `path → sha`；Watcher 事件到达时若当前文件 sha 与该记录一致，只更新 mtime，不重新解析。
3. 重命名识别：`unlink(A)` 与 `add(B)` 在 2 秒内出现且 sha 相同 → 判定为同一文件移动，更新 `path`，`id` 不变，**不改写任何引用方文件**。
4. 未配对的 `unlink` → 索引标记 `missing = true`，不立即删除记录；Lint 列出，文件回来后自动恢复。
5. `error` 事件 → 以 1s/5s/30s 退避重启 Watcher；连续失败则降级为纯周期扫描，并在 UI 提示。
6. 进程级单例（挂在 `process` 上，模式同 `lib/db/client.ts` 的 DB 句柄），避免 Next 开发模式多个 route bundle 各起一个 Watcher。

---

## 5. 扫描与对账

| 时机 | 动作 |
|---|---|
| 启动 | 先起 Watcher，再全量扫描；扫描结果与索引按 size + mtime 对比，不同才算 hash |
| 周期（5 分钟） | 同上，弥补漏事件；发现 Watcher 已停则重启 |
| 手动「重建索引」 | 清空派生表 → 全量扫描 → 全量 hash → 重建链接与来源索引 |
| 写前 | 单文件 hash 校验（§3） |

对账只读文件，不追求"修复"文件。文件与索引冲突时，**文件赢**。

---

## 6. 索引（PGlite，派生）

```text
vault_pages(path PK, id, type, title, source_path, source_kind,
            sha256, mtime, size, archived, missing, updated_at)
vault_aliases(alias_norm, path)                     -- 别名与规范化标题
vault_links(from_path, target_ref, kind, relation_type, heading)
vault_source_links(concept_path, source_path)        -- sources[] 反向索引
vault_tags(path, tag_norm)
```

- `vault_pages.id` 用部分唯一索引（`where id is not null`），重复 id 只允许存在于文件中并由 Lint 报告。
- 不存正文。检索先查标题/别名/标签/路径，命中后按需读文件片段；v1 不引入向量或全文库。
- 派生表允许整表清空重建；**重建命令不触碰应用状态表**。

---

## 7. 应用状态与知识索引的边界

留在 PGlite 且**不可从文件重建**的表：

`proposals`、`audit_log`、`idempotency_keys`、`agent_tokens`、`canvases`，以及旧 `note_revisions` 的只读历史。

- 这些表继续带 `actor_id` / `agent_id`，但 **user_id 从知识索引中移除**（单用户 Vault）。
- `idempotency_keys` 主键由 `(user_id, key)` 改为 `key`。
- `pnpm verify:db` 需要重写：删除"每个查询都带 user_id"的断言，改为断言派生表无 `user_id`、应用状态表有 `actor_id`、Vault 路径唯一。
- 迁移顺序：新建派生表 → 从文件扫描填充 → 迁移脚本把旧 `raw_notes` / `notes` 写成文件 → 删除旧的 `notes` / `links` / `tags` / `note_tags` / `note_ai_metadata` 表。`raw_notes` 在迁移验收后删除。

---

## 8. 归档与删除

- **归档** = frontmatter `archived: true` + `archived_at`。文件留在原位，Obsidian 里仍可见。Settings → Archive 从索引查询，恢复即删掉这两个字段。Raw 文件的归档由**用户操作**写入 frontmatter；AI 不得写 Raw 的 frontmatter。
- **删除** = 移动到 `.chordnote/trash/<YYYY-MM-DD HHmmss>/<原相对路径>`，并写 `audit_log`（原路径、sha、操作者）。Archive 里仍可见并可恢复；永久清除只在 Archive 中显式执行。
- 索引里的 `missing` 与归档、删除是三件事，不要合并：`missing` 表示「文件在磁盘上不见了但没人说删」，只由 Lint 呈现。

---

## 9. 失败模式

| 崩溃点 | 后果 | 恢复 |
|---|---|---|
| 临时文件写入后、rename 前 | 留下 `.tmp` | 启动扫描删除 |
| rename 后、索引更新前 | 文件是新的，索引是旧的 | 下次扫描按 mtime 修正 |
| 索引更新后、审计写入前 | 有变更无审计 | 可接受，记录缺失不阻塞；启动时写一条 `index.reconcile` 汇总 |
| 迁移中途失败 | 文件已写一部分，旧表仍在 | 迁移按路径幂等，重跑跳过已存在且 hash 相同的文件；旧表在验收前不删除 |
| Vault 锁残留 | 拒绝启动 | 检测 pid，确认死亡后覆盖 |

---

## 10. 验证清单

运行 `pnpm test:vault`。新增测试放在 `lib/vault/`，不依赖真实用户 Vault 与数据库。

| 阶段 3 验收 | 对应测试 |
|---|---|
| 1. 无 frontmatter 的 Raw 可读、扫描、编辑 | `vault.test.ts` · 1 |
| 2. Obsidian 新建/修改被 Watcher 发现 | `watcher.test.ts` · 2 |
| 3. 漏事件或重启后扫描恢复状态 | `vault.test.ts` · 3 |
| 4. 只读模式拒绝 Agent 全部写入 | `vault.test.ts` · 4 |
| 5. AI 可建 Raw、追加，不改已有字节 | `vault.test.ts` · 5 |
| 6. 唯一 hash 重命名更新 source_path 并留审计 | `vault.test.ts` · 6 |
| 7. 重复 hash / 重命名同时编辑不误配 | `vault.test.ts` · 7 |
| 8. Archive / Trash / Restore 状态与路径 | `vault.test.ts` · 8 |
| 9. 外部修改或写入失败不静默覆盖 | `vault.test.ts` · 9 |

其余保障：

1. 追加格式化：编号递增、无尾换行时补 `\n\n`、内容含 `## AI append-N` 时拒绝。
2. 解析顺序：id > alias > H1 > path；多命中返回未解析。
3. 索引重建幂等：删表重建后，页面、链接、来源索引与重建前一致。
4. 自写抑制：写文件后 Watcher 不再产生一次外部变化。
5. 路径穿越：`../`、绝对路径、Vault 外软链一律拒绝。

替换旧链路时**删除**被替代的旧实现（如 `lib/services/documents.ts` 的全量解析、`safeDocumentPath`），不并行维护两套；两套并存时以本模块为准。
