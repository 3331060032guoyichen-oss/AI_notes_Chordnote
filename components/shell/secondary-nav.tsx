import type { ReactNode } from "react";

import type { Space } from "./spaces";

/** 二级导航容器。Settings 与 Home 的内容不同，但外层目录样式一致。 */
export function SecondaryNav({ space, children }: { space: Space; children?: ReactNode }) {
  if (space === "home") return null;

  return (
    <nav className="file-tree" aria-label={`${space} 导航`}>
      {children}
    </nav>
  );
}
