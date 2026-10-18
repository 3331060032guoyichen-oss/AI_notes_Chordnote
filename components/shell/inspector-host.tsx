import type { ReactNode } from "react";

type InspectorHostProps = {
  /** 当前内容需要上下文检查器时才挂载右栏。 */
  visible: boolean;
  /** 宽屏下是否被收起；收起的 56px 图标条由 icons 提供。 */
  hidden: boolean;
  children: ReactNode;
};

/** 右侧检查器：只负责外壳与开合，内容由调用方按空间决定。 */
export function InspectorHost({ visible, hidden, children }: InspectorHostProps) {
  if (!visible || hidden) return null;

  return (
    <>
      <aside id="context-rail" className="ai-rail" aria-label="Agent 对话面板">
        {children}
      </aside>
    </>
  );
}
