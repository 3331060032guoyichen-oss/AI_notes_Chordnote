import { SETTINGS_SECTIONS, type SettingsSection } from "./sections";

type SettingsNavProps = {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

/** Settings 空间的二级导航：六个入口，并标出哪些只是只读或未实现。 */
export function SettingsNav({ section, onSelect }: SettingsNavProps) {
  return (
    <div className="tree-section tree-tools-section">
      {SETTINGS_SECTIONS.map((item) => (
        <button
          key={item.id}
          className={`tree-tool-item space-nav-item${section === item.id ? " is-active" : ""}`}
          type="button"
          data-sound="select"
          onClick={() => onSelect(item.id)}
        >
          <span className="space-nav-label">
            <span>{item.label}</span>
            <small>{item.hint}</small>
          </span>
          {item.state === "planned" ? <em className="space-nav-tag">未实现</em> : null}
          {item.state === "readonly" ? <em className="space-nav-tag">只读</em> : null}
        </button>
      ))}
    </div>
  );
}
