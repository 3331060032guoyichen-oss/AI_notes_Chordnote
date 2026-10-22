/**
 * Settings 分区标题。所有分区共用一套：eyebrow + h1 + 一句说明。
 *
 * 抽出来是为了让「归档」这种没有独立列表侧栏的分区也能和其它分区对齐——
 * 之前归档面板自渲染裸 `<h1>`，字号和内边距都退回浏览器默认，看起来像另一个应用。
 */
export function SectionHeader({ title, body }: { title: string; body: string }) {
  return (
    <header className="workspace-heading compact-heading">
      <div>
        <p className="eyebrow">Settings</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </header>
  );
}
