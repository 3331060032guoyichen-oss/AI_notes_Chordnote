import type { AgentRunTrace } from "../../types/agent";
import { IconAgent } from "../ui/icons";

type AgentNavProps = {
  trace: AgentRunTrace | null;
  onOpenAgent: () => void;
};

/**
 * Agent 空间的二级导航。
 *
 * 本轮只显示当前会话的一次运行；历史任务没有落库，所以只放一条明确的空态，
 * 不伪造过去记录。
 */
export function AgentNav({ trace, onOpenAgent }: AgentNavProps) {
  return (
    <>
      <div className="tree-section">
        <div className="tree-section-header tree-section-static">
          <span>本次任务</span>
          <span className="tree-count">{trace ? 1 : 0}</span>
        </div>
        <div className="tree-items">
          {trace ? (
            <button className="tree-item is-selected" type="button" data-sound="select" onClick={onOpenAgent}>
              <span className="tree-item-icon"><IconAgent /></span>
              <span className="tree-item-label">{trace.contextTitle ?? "未命名材料"}</span>
            </button>
          ) : (
            <p className="tree-empty">还没有运行过整理</p>
          )}
        </div>
      </div>

      <div className="tree-section">
        <div className="tree-section-header tree-section-static">
          <span>任务历史</span>
          <span className="tree-count">0</span>
        </div>
        <div className="tree-items">
          <p className="tree-empty">历史任务未落库，本轮不提供。刷新页面后只保留当前会话。</p>
        </div>
      </div>
    </>
  );
}
