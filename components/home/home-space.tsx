import { getPreview } from "../../lib/text-preview";
import type { Knowledge } from "../../types/knowledge";

type HomeSpaceProps = {
  rawCount: number;
  knowledgeCount: number;
  archivedCount: number;
  linkCount: number;
  pendingProposals: number;
  pendingProposalsMore: boolean;
  recentNotes: Knowledge[];
  onOpenKnowledge: (knowledge: Knowledge) => void;
  onGoKnowledge: () => void;
  onGoAgent: () => void;
  onGoSettings: () => void;
  onNewNote: () => void;
};

/** Home：只读活动摘要。不在这里新增任何写路径。 */
export function HomeSpace({
  rawCount,
  knowledgeCount,
  archivedCount,
  linkCount,
  pendingProposals,
  pendingProposalsMore,
  recentNotes,
  onOpenKnowledge,
  onGoKnowledge,
  onGoAgent,
  onGoSettings,
  onNewNote,
}: HomeSpaceProps) {
  return (
    <>
      <header className="workspace-heading">
        <div>
          <p className="eyebrow">Home</p>
          <h1>你的知识库，今天从哪开始？</h1>
          <p>这里只汇总已经存在的内容。写新内容仍然从 Knowledge 的原始记录开始。</p>
        </div>
        <button className="button-dark" type="button" data-sound="press" onClick={onNewNote}>留下一条原话</button>
      </header>

      <section className="content-section home-stats" aria-label="活动摘要">
        <div className="home-stat"><b>{rawCount}</b><span>原始记录</span></div>
        <div className="home-stat"><b>{knowledgeCount}</b><span>知识页</span></div>
        <div className="home-stat"><b>{linkCount}</b><span>已建立关联</span></div>
        <div className="home-stat"><b>{pendingProposals}{pendingProposalsMore ? "+" : ""}</b><span>待确认提议</span></div>
      </section>

      <section className="content-section">
        <div className="section-heading-inline">
          <h3>最近的知识页</h3>
          <button className="text-button" type="button" data-sound="select" onClick={onGoKnowledge}>打开 Knowledge</button>
        </div>
        {recentNotes.length > 0 ? (
          <div className="home-recent">
            {recentNotes.map((note) => (
              <button className="home-recent-row" type="button" key={note.id} data-sound="select" onClick={() => onOpenKnowledge(note)}>
                <span>{note.title}</span>
                <small>{getPreview(note.summary, 70)}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted-note">还没有知识页。先在 Knowledge 里留下一条原始记录，再交给整理助手。</p>
        )}
      </section>

      <section className="content-section">
        <div className="section-heading-inline"><h3>其他入口</h3></div>
        <div className="home-actions">
          <button className="button-secondary" type="button" data-sound="select" onClick={onGoAgent}>Agent · 本次整理</button>
          <button className="button-secondary" type="button" data-sound="select" onClick={onGoSettings}>Settings · 模型与数据</button>
          {archivedCount > 0 ? <span className="muted-note">另有 {archivedCount} 张已归档知识页，可在 Knowledge 的「已归档」里恢复。</span> : null}
        </div>
      </section>
    </>
  );
}
