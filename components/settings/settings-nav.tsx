import { SETTINGS_SECTIONS, type SettingsSection } from "./sections";

const SETTINGS_GROUPS = ["AI 与 Agent", "界面偏好", "数据与连接"] as const;

type SettingsNavProps = {
  section: SettingsSection;
  onSelect: (section: SettingsSection) => void;
};

/** Settings 窗口的分类导航，并标出哪些只是只读或未实现。 */
export function SettingsNav({ section, onSelect }: SettingsNavProps) {
  return (
    <div className="settings-nav-groups">
      {SETTINGS_GROUPS.map((group) => (
        <section className="settings-nav-group" key={group} aria-label={group}>
          <h3>{group}</h3>
          {SETTINGS_SECTIONS.filter((item) => item.group === group).map((item) => (
            <button
              key={item.id}
              className={`tree-tool-item space-nav-item${section === item.id ? " is-active" : ""}`}
              type="button"
              data-sound="select"
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span className="space-nav-label">
                <span>{item.label}</span>
              </span>
              {item.state === "planned" ? <em className="space-nav-tag">暂未开放</em> : null}
              {item.state === "readonly" ? <em className="space-nav-tag">只读</em> : null}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
