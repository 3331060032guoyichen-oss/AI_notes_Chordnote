import type { ReactNode } from "react";

import { AppStardust } from "../landing-stardust";

type AppShellProps = {
  sidebarOpen: boolean;
  railHidden: boolean;
  /** 当前空间没有检查器时，隐藏右栏并把网格收成两列。 */
  showInspector: boolean;
  sidebar: ReactNode;
  main: ReactNode;
  inspector: ReactNode;
  mobileTopbar: ReactNode;
  mobileBottomNav: ReactNode;
  overlays?: ReactNode;
};

/**
 * 应用外壳：只负责网格与响应式骨架，不持有任何业务状态。
 *
 * 列宽与断点沿用原来的 `--sidebar-width / --rail-col` 令牌，
 * 因此 Knowledge 空间的视觉与改造前一致。
 */
export function AppShell({
  sidebarOpen,
  railHidden,
  showInspector,
  sidebar,
  main,
  inspector,
  mobileTopbar,
  mobileBottomNav,
  overlays,
}: AppShellProps) {
  const className = [
    "app-shell",
    sidebarOpen ? "" : "sidebar-collapsed",
    showInspector ? (railHidden ? "rail-collapsed" : "") : "no-inspector",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className={className}>
      <AppStardust />
      {mobileTopbar}
      {sidebar}
      {main}
      {showInspector ? inspector : null}
      {mobileBottomNav}
      {overlays}
    </main>
  );
}
