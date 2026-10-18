import { IconBook, IconGraph, IconHarp, IconHome, IconPanelExpand } from "../ui/icons";
import { SPACE_META, type Space } from "./spaces";

type PrimaryNavProps = {
  activeSpace: Space;
  onSelect: (space: Space) => void;
  onExpandSidebar: () => void;
};

const SPACES: Array<{ id: Space; icon: React.ReactNode }> = [
  { id: "home", icon: <IconHome /> },
  { id: "knowledge", icon: <IconBook /> },
  { id: "graph", icon: <IconGraph /> },
  { id: "agent", icon: <IconHarp /> },
];

/**
 * 一级工作区导航。Settings 使用侧栏底部的独立入口，不在这里重复出现。
 *
 * 展开时是侧栏里的一列文字入口（复用原有的 `.primary-nav / .nav-item`）；
 * 收起时变成 56px 图标条（`.rail-nav`）。两套都渲染，显隐交给 CSS 断点，
 * 这样移动端抽屉里不会只剩图标。
 */
export function PrimaryNav({ activeSpace, onSelect, onExpandSidebar }: PrimaryNavProps) {
  return (
    <>
      <nav className="primary-nav" aria-label="一级导航">
        {SPACES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item${activeSpace === item.id ? " is-active" : ""}`}
            data-sound="select"
            aria-current={activeSpace === item.id ? "page" : undefined}
            onClick={() => onSelect(item.id)}
          >
            <span className="nav-label">
              {item.icon}
              {SPACE_META[item.id].label}
            </span>
          </button>
        ))}
      </nav>

      <nav className="rail-nav" aria-label="功能栏">
        <span className="rail-logo" aria-hidden="true">C</span>
        <button
          className="rail-icon-btn"
          type="button"
          data-sound="select"
          title="展开侧栏"
          aria-label="展开侧栏"
          aria-controls="workspace-nav"
          onClick={onExpandSidebar}
        >
          <IconPanelExpand />
        </button>
        <span className="rail-divider" aria-hidden="true" />
        {SPACES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rail-icon-btn${activeSpace === item.id ? " is-active" : ""}`}
            data-sound="select"
            title={SPACE_META[item.id].label}
            aria-label={SPACE_META[item.id].label}
            aria-current={activeSpace === item.id ? "page" : undefined}
            onClick={() => onSelect(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </nav>
    </>
  );
}
