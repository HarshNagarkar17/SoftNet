import { Check, Keyboard, Monitor, Moon, Palette, SlidersHorizontal, Sun, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { Auth, KvRow } from "../lib/request";
import type { Theme } from "../lib/storage";
import { AuthEditor } from "./AuthEditor";
import { DocEditor } from "./DocEditor";
import { KeyValueEditor } from "./KeyValueEditor";
import { cx, modKey } from "./ui";

function NameField({
  name,
  onRename,
  label,
  large,
}: {
  name: string;
  onRename: (name: string) => void;
  label: string;
  large?: boolean;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        if (!event.currentTarget.isConnected) return;
        if (draft.trim() && draft.trim() !== name) onRename(draft.trim());
        else setDraft(name);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
      className={cx(
        "w-full text-fg outline-none focus-visible:outline-none",
        large
          ? "h-10 max-w-xl border-0 bg-transparent px-0 text-2xl font-semibold tracking-tight focus:border-b focus:border-ring"
          : "h-8 max-w-md rounded-md border border-line bg-raised px-2.5 text-sm font-medium focus:border-ring",
      )}
    />
  );
}

type CollectionSection = "overview" | "authorization" | "variables";

export function CollectionPage({
  name,
  description,
  auth,
  rows,
  onRename,
  onDescription,
  onAuth,
  onChange,
}: {
  name: string;
  description: string;
  auth: Auth;
  rows: KvRow[];
  onRename: (name: string) => void;
  onDescription: (description: string) => void;
  onAuth: (auth: Auth) => void;
  onChange: (rows: KvRow[]) => void;
}) {
  const [section, setSection] = useState<CollectionSection>("overview");
  const sections: { id: CollectionSection; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "authorization", label: "Authorization" },
    { id: "variables", label: "Variables" },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex h-10 shrink-0 items-end gap-1 border-b border-line px-5">
        {sections.map((item) => {
          const selected = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSection(item.id)}
              className={cx(
                "-mb-px cursor-pointer border-b-2 px-3 pb-2 text-[13px]",
                selected ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl px-8 py-8">
          {section === "overview" ? (
            <>
              <NameField key={name} name={name} label="Collection name" large onRename={onRename} />
              <p className="mt-2 text-xs text-faint">Collection</p>
              <DocEditor value={description} onChange={onDescription} />
            </>
          ) : null}
          {section === "authorization" ? (
            <>
              <h2 className="text-lg font-semibold text-fg">Authorization</h2>
              <p className="mt-1 max-w-lg text-[13px] leading-5 text-muted">
                Requests and folders underneath use this unless they choose a different type.
              </p>
              <div className="mt-5">
                <AuthEditor auth={auth} onChange={onAuth} />
              </div>
            </>
          ) : null}
          {section === "variables" ? (
            <>
              <h2 className="text-lg font-semibold text-fg">Variables</h2>
              <p className="mt-1 text-[13px] leading-5 text-muted">
                Use <span className="font-mono text-fg">{"{{name}}"}</span> in requests here. The active environment overrides a variable with the same name.
              </p>
              <div className="mt-4">
                <KeyValueEditor label="Collection variables" rows={rows} onChange={onChange} />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EnvironmentPage({
  name,
  rows,
  active,
  onRename,
  onChange,
  onUse,
  onDelete,
}: {
  name: string;
  rows: KvRow[];
  active: boolean;
  onRename: (name: string) => void;
  onChange: (rows: KvRow[]) => void;
  onUse: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto bg-panel">
      <div className="mx-auto max-w-3xl px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium tracking-wide text-faint uppercase">Environment</p>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-danger hover:bg-danger-soft"
          >
            <Trash2 size={13} aria-hidden="true" />
            Delete environment
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <NameField key={name} name={name} label="Environment name" onRename={onRename} />
          <button
            type="button"
            onClick={onUse}
            className={cx(
              "h-8 shrink-0 cursor-pointer rounded-md px-3 text-xs",
              active ? "bg-accent-soft text-fg" : "border border-line text-muted hover:text-fg",
            )}
          >
            {active ? "Active" : "Set active"}
          </button>
        </div>
        <p className="mt-4 text-[13px] text-muted">
          While this environment is active, its values replace collection variables with the same name.
        </p>
        <div className="mt-2">
          <KeyValueEditor label="Environment variables" rows={rows} onChange={onChange} />
        </div>
      </div>
    </div>
  );
}

const THEMES: { id: Theme; label: string; detail: string; icon: typeof Sun }[] = [
  { id: "system", label: "Match system", detail: "Follow the appearance of this computer.", icon: Monitor },
  { id: "light", label: "Light", detail: "Always use the light theme.", icon: Sun },
  { id: "dark", label: "Dark", detail: "Always use the dark theme.", icon: Moon },
];

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: [modKey, "Enter"], label: "Send the request" },
  { keys: [modKey, "T"], label: "New request" },
  { keys: [modKey, "S"], label: "Save the request" },
  { keys: [modKey, "L"], label: "Focus the URL" },
  { keys: [modKey, "B"], label: "Show or hide the sidebar" },
  { keys: [modKey, "F"], label: "Find in the response" },
  { keys: [modKey, "W"], label: "Close the tab" },
  { keys: [modKey, ","], label: "Open settings" },
];

const SECTIONS = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "themes", label: "Themes", icon: Palette },
  { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
] as const;

type SettingsSection = (typeof SECTIONS)[number]["id"];

export function SettingsDialog({
  theme,
  onTheme,
  autosave,
  onAutosave,
  onClose,
}: {
  theme: Theme;
  onTheme: (theme: Theme) => void;
  autosave: boolean;
  onAutosave: (autosave: boolean) => void;
  onClose: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");
  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex h-[min(36rem,86vh)] w-[min(52rem,94vw)] overflow-hidden rounded-xl border border-line bg-panel shadow-[0_24px_64px_rgb(0_0_0/0.35)]"
      >
        <nav aria-label="Settings sections" className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-line bg-app px-2 py-3">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const selected = section === id;
            return (
              <button
                key={id}
                type="button"
                aria-current={selected ? "page" : undefined}
                onClick={() => setSection(id)}
                className={cx(
                  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px]",
                  selected ? "bg-hover font-medium text-fg" : "text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <Icon size={14} className={selected ? "text-fg" : "text-faint"} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-5">
            <h2 id="settings-title" className="text-sm font-semibold text-fg">
              {current.label}
            </h2>
            <button
              type="button"
              aria-label="Close settings"
              onClick={onClose}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
            {section === "general" ? (
              <section>
                <h3 className="text-[13px] font-medium text-fg">Request</h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autosave}
                  onClick={() => onAutosave(!autosave)}
                  className="mt-3 flex w-full cursor-pointer items-center gap-3 rounded-lg border border-line px-3 py-3 text-left hover:bg-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-fg">Autosave</span>
                    <span className="mt-0.5 block text-xs leading-4 text-muted">
                      Saved requests write back to their collection as you edit them.
                    </span>
                  </span>
                  <span className={cx("h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors", autosave ? "bg-accent" : "bg-line-strong")}>
                    <span className={cx("block h-4 w-4 rounded-full bg-panel transition-transform", autosave && "translate-x-4")} />
                  </span>
                </button>
              </section>
            ) : null}
            {section === "themes" ? (
              <section>
                <h3 className="text-[13px] font-medium text-fg">Appearance</h3>
                <p className="mt-1 max-w-lg text-[13px] leading-5 text-muted">Choose how SoftNet looks on this computer.</p>
                <div role="radiogroup" aria-label="Theme" className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {THEMES.map(({ id, label, detail, icon: Icon }) => {
                    const selected = theme === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onTheme(id)}
                        className={cx(
                          "flex min-h-[104px] cursor-pointer flex-col items-start gap-3 rounded-lg border px-3 py-3 text-left",
                          selected ? "border-accent bg-accent-soft" : "border-line bg-raised hover:border-line-strong hover:bg-hover",
                        )}
                      >
                        <span className="flex w-full items-center justify-between">
                          <Icon size={16} className={selected ? "text-accent" : "text-muted"} aria-hidden="true" />
                          {selected ? <Check size={14} className="text-accent" aria-hidden="true" /> : <span className="h-3.5 w-3.5" />}
                        </span>
                        <span>
                          <span className="block text-[13px] font-medium text-fg">{label}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-muted">{detail}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {section === "shortcuts" ? (
              <section>
                <h3 className="text-[13px] font-medium text-fg">Keyboard</h3>
                <ul className="mt-3 overflow-hidden rounded-lg border border-line">
                  {SHORTCUTS.map((item, index) => (
                    <li key={item.label} className={cx("flex items-center justify-between gap-4 px-3 py-2.5", index > 0 && "border-t border-line")}>
                      <span className="text-[13px] text-fg">{item.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {item.keys.map((key) => (
                          <kbd key={key} className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line bg-raised px-1.5 font-sans text-[11px] text-muted">
                            {key}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function EmptyCanvas({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-panel px-6 text-center">
      <p className="text-sm text-fg">Nothing open</p>
      <button
        type="button"
        onClick={onNew}
        className="mt-3 h-7 cursor-pointer rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
      >
        New request
      </button>
      <p className="mt-3 max-w-xs text-xs leading-5 text-muted">
        Or open a collection, an environment, or Settings from the sidebar.
      </p>
    </div>
  );
}
