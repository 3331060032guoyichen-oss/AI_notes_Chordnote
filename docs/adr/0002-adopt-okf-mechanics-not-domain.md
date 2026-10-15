# 采用 OKF 的机制，不采用它的领域

需要一份「接入的 agent 共用」的工作手册骨架，以及「导出为 markdown」的目标格式；Google Cloud 的 Open Knowledge Format（OKF v0.2，Apache-2.0）同时提供了这两样。

**决定**：借它的**机制**——`type` / `generated` / `verified` / `status` / `sources` 字段，`index.md` 渐进披露、`log.md` 时间线、markdown 链接成图——做 agent 手册的骨架与导出格式；概念类型用 Chordnote 自己的。**不采纳**它的**领域**（数据目录、指标、血缘、Attested Computation 那一整套）。

**为什么**：OKF 把「谁生成」（`generated.by`）与「谁确认」（`verified[].by`）拆成两个字段、并据此推出三档信任等级——这与 ADR-0001 的确认关卡是同构的，采用它等于给产品原则找一份外部标准背书。但它的全部样例面向数据目录，照搬领域会做出一个四不像。

**后果**：导出的 bundle 应保持 OKF **conformant**（每个 `.md` 有可解析 frontmatter、`type` 非空、保留文件名符合 §8/§9），但**不得**宣称「完整实现 OKF」——规范很宽松（只有 `type` 必填），做到 conformant 的成本很低。
