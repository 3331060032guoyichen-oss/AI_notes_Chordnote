import type { ReactNode } from "react";

type InspectorHostProps = {
  /** 当前内容需要上下文检查器时才挂载右栏。 */
  visible: boolean;
  /** 宽屏下是否被收起；收起的 56px 图标条由 icons 提供。 */
  hidden: boolean;
  /** 窄屏抽屉是否打开。 */
  open: boolean;
  onClose: () => void;
  icons: ReactNode;
  children: ReactNode;
};

/** 右侧检查器：只负责外壳与开合，内容由调用方按空间决定。 */
export function InspectorHost({ visible, hidden, open, onClose, icons, children }: InspectorHostProps) {
  if (!visible) return null;

  return (
    <>
      <aside id="context-rail" className={`ai-rail${open ? " is-open" : ""}`} aria-label="上下文面板">
        {hidden ? null : (
          <button
            className="rail-drawer-close"
            type="button"
            data-sound="select"
            aria-label="收起上下文面板"
            onClick={onClose}
          >
            ×
          </button>
        )}
        {children}
      </aside>
      <nav className="rail-icons" aria-label="上下文图标条">
        {icons}
      </nav>
    </>
  );
}
