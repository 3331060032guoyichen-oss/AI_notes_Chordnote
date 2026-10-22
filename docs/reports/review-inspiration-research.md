# Chordnote 评审视频创意来源核验

核验日期 2026-10-22。以下用于准确交代借鉴与原创边界，不代表对本项目运行效果的验证。

## Karpathy LLM Wiki

[Karpathy 原始 idea file](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) 于 2026-04-04 创建。作者将其定位为个人知识库的一种模式，供用户与 Agent 协作具体实现，并非可直接安装的成品框架。原文已提出 Raw sources、Wiki、Schema 三层，以及 Ingest、Query、Lint 三类工作流；Schema 与用户协同演进也在原文中。

建议表述：借鉴 LLM 持续维护知识库的理念，团队针对大学生笔记场景设计具体分类规范、工作手册、界面与受控执行机制。不要把 Schema 三层模式本身称为团队原创，也不要把“自洽”说成已保证的结果。

原文强调维护与跨文档关联的潜力；它并非实验论文，不能据此宣称 Chordnote 在效率、正确率或学习成果方面已得到定量证明。

## Obsidian

[官方 Backlinks 文档](https://obsidian.md/help/plugins/backlinks) 解释已链接引用和未链接提及。[官方 Graph view 文档](https://obsidian.md/help/plugins/graph) 明确笔记为节点、内部链接为边，支持局部图谱、深度、过滤与力学参数。

建议表述：借鉴双向链接与图谱浏览，在本项目中实现具体的笔记关联与可视化。Agent 权限、审阅和沙箱应单独讲成本项目的执行设计，不宜称为 Obsidian 图谱的原生能力。

## Claudian 及同名衍生项目

[YishenTu/claudian 官方仓库](https://github.com/YishenTu/claudian) 明确其为把编码 Agent 嵌入 Obsidian 的插件；以 vault 作为工作目录，支持读取、修改、搜索及多步工作流，也支持会话管理、可复用命令与 Skills。当前 README 本身不足以证明某一具体长期记忆机制。

[wuyifan-code/Claudian-plus 仓库](https://github.com/wuyifan-code/Claudian-plus) 则明确描述独立的 memory.md 长期记忆、会话提炼与用户接受流程。这是另一个项目，不能直接把 Plus 的能力归给原 Claudian。拍摄前应确认团队实际参考的仓库 URL 和版本。

建议把“对话历史”“可持久化长期记忆”“知识库内容”“工作手册”分开说明。仅保留聊天记录不等于已实现长期记忆；知识库检索也不等于自动提炼用户偏好。

## Lenny Rachitsky 身份

[Lenny 本人官网](https://lennyrachitsky.com/) 自述写通讯、主持播客和天使投资；[通讯介绍](https://www.lennysnewsletter.com/about) 定位为产品、增长和职业建议。此次未找到支持“Lenny Rachitsky 是苹果设计师”的第一手来源，视频不宜这样表述。

如果参考的是其采访的前 Apple 设计师，应写出具体设计师姓名与采访标题；尚未确认时可说“参考瑞士国际主义平面设计，以及 Lenny’s Newsletter 中的产品与设计讨论”。具体设计 Skill 与视觉形象的原创过程，需要团队提供草稿、版本与 AI 使用记录证明。
