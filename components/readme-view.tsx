import { AGENT_PERMISSIONS } from "../lib/agent/manual";

export function ReadmeView() {
  return <article className="readme-guide">
    <p className="readme-eyebrow">CHORDNOTE · 使用指南</p>
    <h1>从一条笔记，开始整理知识</h1>
    <p className="readme-intro">先记下原话，再让 Agent 整理。原始资料保留在 Raw，整理出的知识放进 Wiki，笔记之间通过链接建立联系。</p>

    <section><h2>第一次使用，做这三步</h2>
      <ol className="readme-steps">
        <li><h3>新建一条笔记</h3><p>展开左侧“未整理笔记”，点击“＋ 新建笔记”。第一行是标题，下面写正文；修改会自动保存，切换笔记后仍然保留。</p></li>
        <li><h3>交给 Agent 整理</h3><p>打开右侧 Agent，用 <code>@</code> 选择这条笔记，再输入下面这样的请求。首次使用 AI，请先在设置中配置并测试模型连接。</p><blockquote>请整理这条笔记，提炼要点，并查找它与已有知识的联系。</blockquote></li>
        <li><h3>查看整理结果</h3><p>默认“可提议”会打开整理稿。检查标题、内容和来源分类，点击“确认并收录”；其他更新和关联建议在右侧逐项确认。选择“完全允许”时，Agent 会直接执行本轮任务，并报告结果。</p><p>收录后，知识页进入 Wiki，原始资料按类别进入 Raw，并从“未整理笔记”中移出。</p></li>
      </ol>
    </section>

    <section><h2>左侧目录，分别放什么</h2>
      <dl className="readme-directory">
        <div><dt>未整理笔记</dt><dd>记录新想法、摘录和待整理资料；不需要先决定放在哪个分类。</dd></div>
        <div><dt>Raw · 原始资料</dt><dd>保留整理所依据的原文。articles 放文章与一般笔记，papers 放论文，books 放书籍，media 放媒体资料，data 放数据。Agent 不改写原文。</dd></div>
        <div><dt>Wiki · 知识库</dt><dd>整理后的概念、实体、来源摘要、综合分析与问题探索。index 属于知识内容索引，用于按类别查找和导航；知识列表与图谱提供当前索引。</dd></div>
        <div><dt>Schema · 工作规则</dt><dd>查看和编辑整理方式、笔记格式与用户偏好；保存后下一轮生效。实际执行权限由对话中的权限选择决定。</dd></div>
        <div><dt>Readme · 使用指南</dt><dd>随时回到这里查看操作方法。</dd></div>
      </dl>
    </section>

    <section><h2>选择适合当前任务的权限</h2>
      <div className="readme-table"><table><thead><tr><th>权限</th><th>Agent 会怎么做</th></tr></thead><tbody>
        {AGENT_PERMISSIONS.map(item => <tr key={item.id}><th scope="row">{item.label}</th><td>{item.id === "read" ? "检索、阅读和回答；不创建草稿或提议，也不修改内容。" : item.id === "propose" ? "提出整理稿、改写和关联建议，你确认后才应用。这是默认模式。" : "在本轮任务范围内直接收录、更新、建立关联、调整分类和归档；保留操作记录，Raw 原文保持原样。"}</td></tr>)}
      </tbody></table></div>
      <p>在 Agent 输入框下方的“＋”菜单选择权限。“新会话”开始一段独立对话；已有笔记和仍待确认的提议会保留。</p>
    </section>

    <section><h2>链接笔记，让内容相互连接</h2>
      <p>正文中输入 <code>[[</code>，从补全列表选择笔记。显示的是笔记名称，点击即可打开。</p>
      <ul><li><code>[[笔记名称]]</code>：链接到一篇笔记。</li><li><code>[[实际路径|显示名称]]</code>：自定义显示文字；Raw 与 Wiki 有同名笔记时，用完整路径区分目标。</li></ul>
      <p>Agent 回复中的笔记名称也可以点击。灰色虚线表示目标尚未匹配；笔记编辑器中的未解析链接，可以由你点击并显式新建原始记录。正式图谱关联需单独建立或应用关联建议。</p>
      <p>正文支持标题、列表、任务、加粗、标签与高亮。点击文字即可编辑，光标进入时会显示对应的 Markdown 标记。</p>
    </section>

    <section><h2>可以直接对 Agent 这样说</h2>
      <blockquote>对比 @笔记甲 和 @笔记乙，说明相同点与差异，并引用依据。</blockquote>
      <blockquote>检索已有笔记，回答这个问题；没有依据的部分请明确说明。</blockquote>
      <blockquote>检查这些笔记的断链和重复内容，先给我建议。</blockquote>
      <p>需要引用具体资料时，先用 <code>@</code> 选择笔记。Agent 出错时，先检查模型连接；已经保存的原始笔记仍然保留。</p>
    </section>

    <section><h2>白板、归档与恢复</h2>
      <ul><li><strong>白板：</strong>点击左侧白板图标。双击写便签，按 N 新建，按住 Shift 拖动绘画；可拖入或粘贴图片。选中卡片或图片后点击“删除”，会同时移除它的连线。</li><li><strong>笔记归档：</strong>通过笔记菜单归档，在 Settings → Archive 中恢复。白板项目使用直接删除，不进入笔记归档。</li><li><strong>界面空间：</strong>左侧 Logo 开合目录，右侧 Agent 开关开合对话栏。窗口较小时，打开笔记标签或点击关闭即可收起 Agent。</li></ul>
    </section>
  </article>;
}
