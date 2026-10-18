import type { ReactNode } from "react";

import type { Space } from "./spaces";

/** Home 与 Knowledge 共用二级导航骨架，Settings 使用独立窗口。 */
export function SecondaryNav({ space, children }: { space: Space; children?: ReactNode }) {
  if (space === "graph" || space === "settings") return null;

  return (
    <nav className="file-tree" aria-label={`${space} 导航`}>
      {children}
    </nav>
  );
}
