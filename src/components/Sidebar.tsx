import { Check, ChevronRight, Import, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import logo from "../assets/logo-mark.png";
import type { HistoryEntry } from "../lib/storage";
import { IconButton, cx, methodShort, methodText, modKey, statusText } from "./ui";

type SidebarProps = {
  open: boolean;
  history: HistoryEntry[];
  filter: string;
  collections: ReactNode;
  onFilter: (filter: string) => void;
  onToggle: () => void;
  onNew: () => void;
  onNewCollection: () => void;
  onImport: () => void;
  environments: { id: string; name: string }[];
  activeEnvironment: string | null;
  openEnvironment: string | null;
  envsOpen: boolean;
  onEnvsOpen: (open: boolean) => void;
  onOpenEnvironment: (id: string) => void;
  onNewEnvironment: () => void;
  onUseEnvironment: (id: string | null) => void;
  onDeleteEnvironment: (id: string) => void;
  onRenameEnvironment: (id: string, name: string) => void;
  settingsActive: boolean;
  onOpenSettings: () => void;
  onOpen: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

function dayLabel(at: number): string {
  const date = new Date(at);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (at >= startOfToday) return "Today";
  if (at >= startOfToday - 86_400_000) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "");
}

export function Logo({ size = 18 }: { size?: number }) {
  return <img src={logo} alt="" width={Math.round(size * 0.72)} height={size} draggable={false} className="shrink-0 object-contain" style={{ height: size }} />;
}

function SidebarMark({ onToggle }: { onToggle: () => void }) {
  const label = `Show sidebar (${modKey}B)`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onToggle}
      className="group/logo flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
    >
      <span className="relative flex h-[18px] w-[18px] items-center justify-center">
        <span className="group-hover/logo:invisible">
          <Logo size={18} />
        </span>
        <PanelLeftOpen size={15} aria-hidden="true" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover/logo:opacity-100" />
      </span>
    </button>
  );
}

function EnvName({ value, onDone }: { value: string; onDone: (name: string | null) => void }) {
  const [draft, setDraft] = useState(value);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      aria-label="Environment name"
      value={draft}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(draft.trim() || null)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(draft.trim() || null);
        else if (event.key === "Escape") finish(null);
      }}
      onClick={(event) => event.stopPropagation()}
      className="h-5 min-w-0 flex-1 rounded border border-ring bg-panel px-1 text-[12.5px] text-fg outline-none focus-visible:outline-none"
    />
  );
}

function EnvironmentRow({
  name,
  selected,
  active,
  renaming,
  onOpen,
  onRename,
  onStartRename,
  onStopRename,
  onUse,
  onDelete,
}: {
  name: string;
  selected: boolean;
  active: boolean;
  renaming: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onStartRename: () => void;
  onStopRename: () => void;
  onUse: () => void;
  onDelete: () => void;
}) {
  const pendingClick = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (pendingClick.current) window.clearTimeout(pendingClick.current);
    };
  }, []);

  return (
    <div className={cx("group flex h-[26px] items-center rounded-md pr-1", selected ? "bg-accent-soft" : "hover:bg-hover")}>
      <button
        type="button"
        aria-label={active ? `${name} is active` : `Use ${name}`}
        title={active ? "Active environment" : "Set active"}
        onClick={onUse}
        className="flex h-full w-6 shrink-0 cursor-pointer items-center justify-center text-faint"
      >
        {active ? <Check size={12} className="text-accent" aria-hidden="true" /> : <span className="h-1.5 w-1.5 rounded-full bg-transparent group-hover:bg-line-strong" />}
      </button>
      {renaming ? (
        <EnvName
          value={name}
          onDone={(next) => {
            onStopRename();
            if (next && next !== name) onRename(next);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            if (pendingClick.current) window.clearTimeout(pendingClick.current);
            pendingClick.current = window.setTimeout(() => {
              pendingClick.current = null;
              onOpen();
            }, 220);
          }}
          onDoubleClick={(event) => {
            event.preventDefault();
            if (pendingClick.current) window.clearTimeout(pendingClick.current);
            pendingClick.current = null;
            onStartRename();
          }}
          className={cx("h-full min-w-0 flex-1 cursor-pointer truncate pr-1 text-left text-[12.5px]", selected ? "text-fg" : "text-muted group-hover:text-fg")}
        >
          {name}
        </button>
      )}
      <button
        type="button"
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        onClick={onDelete}
        className="invisible flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-faint hover:bg-hover hover:text-danger group-hover:visible focus-visible:visible"
      >
        <Trash2 size={12} aria-hidden="true" />
      </button>
    </div>
  );
}

function HistoryList({
  history,
  filter,
  onOpen,
  onRemove,
}: {
  history: HistoryEntry[];
  filter: string;
  onOpen: (entry: HistoryEntry) => void;
  onRemove: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = needle ? history.filter((entry) => `${entry.method} ${entry.url}`.toLowerCase().includes(needle)) : history;
    const out: { label: string; entries: HistoryEntry[] }[] = [];
    for (const entry of list) {
      const label = dayLabel(entry.at);
      const group = out[out.length - 1];
      if (group && group.label === label) group.entries.push(entry);
      else out.push({ label, entries: [entry] });
    }
    return out;
  }, [history, filter]);

  if (history.length === 0) {
    return <p className="px-3 py-3 text-xs leading-5 text-faint">Requests you send show up here, so you can reopen them later.</p>;
  }
  if (groups.length === 0) {
    return <p className="px-3 py-3 text-xs text-faint">Nothing in history matches “{filter}”.</p>;
  }
  return (
    <div className="px-1.5 pb-2">
      {groups.map((group) => (
        <section key={group.label} className="mb-1.5">
          <h3 className="px-2 pt-1.5 pb-1 text-[11px] text-faint">{group.label}</h3>
          <ul>
            {group.entries.map((entry) => (
              <li key={entry.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onOpen(entry)}
                  title={`${entry.method} ${entry.url}`}
                  className="flex h-[26px] w-full cursor-pointer items-center gap-1.5 rounded-md pr-6 pl-2 text-left transition-colors hover:bg-hover"
                >
                  <span className={cx("w-8 shrink-0 font-mono text-[9.5px] font-semibold", methodText[entry.method])}>
                    {methodShort[entry.method]}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{shortUrl(entry.url)}</span>
                  {entry.status ? (
                    <span className={cx("shrink-0 text-[10.5px] tabular-nums group-hover:invisible", statusText(entry.status))}>
                      {entry.status}
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10.5px] text-danger group-hover:invisible">Failed</span>
                  )}
                </button>
                <IconButton
                  size="sm"
                  label="Remove from history"
                  onClick={() => onRemove(entry.id)}
                  className="invisible absolute top-[3px] right-0.5 h-5 w-5 group-hover:visible focus-visible:visible"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const { open, history, filter, collections, environments, activeEnvironment, openEnvironment, envsOpen, settingsActive, onFilter, onToggle, onNew, onNewCollection, onImport, onEnvsOpen, onOpenEnvironment, onNewEnvironment, onUseEnvironment, onDeleteEnvironment, onRenameEnvironment, onOpenSettings } = props;
  const [confirming, setConfirming] = useState(false);
  const [collectionsOpen, setCollectionsOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [renamingEnv, setRenamingEnv] = useState<string | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  if (!open) {
    return (
      <nav aria-label="Sidebar" className="flex h-full w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-app py-2">
        <div className="mb-1">
          <SidebarMark onToggle={onToggle} />
        </div>
        <IconButton label={`New request (${modKey}T)`} onClick={onNew}>
          <Plus size={15} aria-hidden="true" />
        </IconButton>
        <div className="mt-auto">
          <IconButton label="Settings" onClick={onOpenSettings}>
            <Settings size={15} aria-hidden="true" />
          </IconButton>
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label="Sidebar" className="flex h-full w-[clamp(13.5rem,24vw,16rem)] shrink-0 flex-col border-r border-line bg-app">
      <div className="flex h-10 shrink-0 items-center justify-between pr-1.5 pl-3">
        <div className="flex min-w-0 items-center gap-2">
          <Logo size={18} />
          <span className="truncate text-[14px] font-semibold tracking-tight text-fg">SoftNet</span>
        </div>
        <IconButton size="sm" label={`Hide sidebar (${modKey}B)`} onClick={onToggle}>
          <PanelLeftClose size={14} aria-hidden="true" />
        </IconButton>
      </div>

      <div className="flex items-center gap-1 px-2 pb-1">
        <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-line bg-panel focus-within:border-ring">
          <Search size={12} className="ml-2 shrink-0 text-faint" aria-hidden="true" />
          <input
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") onFilter("");
            }}
            aria-label="Filter"
            placeholder="Filter"
            spellCheck={false}
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-xs text-fg outline-none placeholder:text-faint focus-visible:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={onImport}
          aria-label="Import collection"
          title="Import collection"
          className="group/import flex h-7 shrink-0 cursor-pointer items-center overflow-hidden rounded-md border border-line bg-panel px-1.5 text-muted hover:text-fg"
        >
          <Import size={13} aria-hidden="true" className="shrink-0" />
          <span className="max-w-0 overflow-hidden text-xs whitespace-nowrap opacity-0 transition-[max-width,opacity,padding] duration-150 group-hover/import:max-w-36 group-hover/import:pl-1.5 group-hover/import:opacity-100 group-focus-visible/import:max-w-36 group-focus-visible/import:pl-1.5 group-focus-visible/import:opacity-100">
            Import collection
          </span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center pr-1 pl-1.5">
          <button
            type="button"
            aria-expanded={collectionsOpen}
            onClick={() => setCollectionsOpen((value) => !value)}
            className="flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-[11px] font-medium tracking-wide text-muted uppercase hover:bg-hover hover:text-fg"
          >
            <ChevronRight size={12} aria-hidden="true" className={cx("shrink-0 text-faint transition-transform duration-100", collectionsOpen && "rotate-90")} />
            Collections
          </button>
          <IconButton size="sm" label="New collection" className="h-6 w-6" onClick={onNewCollection}>
            <Plus size={13} aria-hidden="true" />
          </IconButton>
        </div>
        {collectionsOpen ? <div className="min-h-0 flex-1 overflow-y-auto">{collections}</div> : null}
      </div>

      <div className="shrink-0 border-t border-line">
        <div className="flex h-8 items-center pr-1 pl-1.5">
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen((value) => !value)}
            className="flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-[11px] font-medium tracking-wide text-muted uppercase hover:bg-hover hover:text-fg"
          >
            <ChevronRight size={12} aria-hidden="true" className={cx("shrink-0 text-faint transition-transform duration-100", historyOpen && "rotate-90")} />
            History
          </button>
          {historyOpen ? (
            <button
              type="button"
              disabled={history.length === 0}
              onClick={() => {
                if (confirming) {
                  props.onClear();
                  setConfirming(false);
                } else setConfirming(true);
              }}
              className={cx(
                "h-6 shrink-0 cursor-pointer rounded-md px-1.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                confirming ? "bg-danger-soft text-danger" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              {confirming ? "Clear all?" : "Clear"}
            </button>
          ) : null}
        </div>
        {historyOpen ? (
          <div className="max-h-[min(11rem,32vh)] overflow-y-auto">
            <HistoryList history={history} filter={filter} onOpen={props.onOpen} onRemove={props.onRemove} />
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-line">
        <div className="flex h-8 items-center pr-1 pl-1.5">
          <button
            type="button"
            aria-expanded={envsOpen}
            onClick={() => onEnvsOpen(!envsOpen)}
            className="flex h-6 min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-1.5 text-left text-[11px] font-medium tracking-wide text-muted uppercase hover:bg-hover hover:text-fg"
          >
            <ChevronRight size={12} aria-hidden="true" className={cx("shrink-0 text-faint transition-transform duration-100", envsOpen && "rotate-90")} />
            Environments
          </button>
          <IconButton size="sm" label="New environment" className="h-6 w-6" onClick={onNewEnvironment}>
            <Plus size={13} aria-hidden="true" />
          </IconButton>
        </div>
        {envsOpen ? (
          <div className="max-h-[min(11rem,32vh)] overflow-y-auto px-1.5 pb-1.5">
            {environments.length === 0 ? <p className="px-2 py-1.5 text-xs text-faint">No environments yet.</p> : null}
            {environments.map((item) => (
              <EnvironmentRow
                key={item.id}
                name={item.name}
                selected={item.id === openEnvironment}
                active={item.id === activeEnvironment}
                renaming={renamingEnv === item.id}
                onOpen={() => onOpenEnvironment(item.id)}
                onStartRename={() => setRenamingEnv(item.id)}
                onStopRename={() => setRenamingEnv((current) => (current === item.id ? null : current))}
                onRename={(name) => onRenameEnvironment(item.id, name)}
                onUse={() => onUseEnvironment(item.id === activeEnvironment ? null : item.id)}
                onDelete={() => onDeleteEnvironment(item.id)}
              />
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        aria-current={settingsActive ? "page" : undefined}
        className={cx(
          "flex h-9 shrink-0 cursor-pointer items-center gap-2 border-t border-line px-3 text-left text-[12.5px]",
          settingsActive ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg",
        )}
      >
        <Settings size={14} aria-hidden="true" />
        Settings
      </button>
    </nav>
  );
}
