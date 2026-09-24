import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { newId, type KvRow } from "../lib/request";
import type { Environments } from "../lib/variables";
import { KeyValueEditor } from "./KeyValueEditor";
import { IconButton, cx } from "./ui";

function DialogFrame({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/50 pt-[12vh]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vars-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        className={cx(
          "toast-in flex max-h-[70vh] flex-col rounded-xl border border-line bg-panel shadow-[0_24px_64px_rgb(0_0_0/0.45)]",
          wide ? "w-[680px]" : "w-[520px]",
        )}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-line px-4">
          <h2 id="vars-title" className="text-sm font-semibold text-fg">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="h-7 cursor-pointer rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-fg">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CollectionVariablesDialog({
  name,
  rows,
  onChange,
  onClose,
}: {
  name: string;
  rows: KvRow[];
  onChange: (rows: KvRow[]) => void;
  onClose: () => void;
}) {
  return (
    <DialogFrame title={`${name} variables`} onClose={onClose}>
      <p className="px-4 pt-3 text-xs text-muted">
        Use <span className="font-mono text-fg">{"{{name}}"}</span> in the URL, headers, auth, or body. An active environment overrides these.
      </p>
      <div className="min-h-0 flex-1 overflow-auto pb-2">
        <KeyValueEditor label="Collection variables" rows={rows} onChange={onChange} />
      </div>
    </DialogFrame>
  );
}

export function EnvironmentsDialog({
  value,
  onChange,
  onClose,
}: {
  value: Environments;
  onChange: (value: Environments) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState(value.activeId ?? value.items[0]?.id ?? null);
  const current = value.items.find((item) => item.id === selected) ?? null;

  function update(id: string, patch: Partial<(typeof value.items)[number]>) {
    onChange({ ...value, items: value.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  }

  return (
    <DialogFrame title="Environments" onClose={onClose} wide>
      <div className="grid min-h-72 flex-1 grid-cols-[200px_minmax(0,1fr)] overflow-hidden">
        <div className="flex min-h-0 flex-col border-r border-line">
          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {value.items.length === 0 ? (
              <p className="px-2 py-2 text-xs text-faint">No environments yet.</p>
            ) : (
              value.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item.id)}
                  className={cx(
                    "flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-[12.5px]",
                    item.id === selected ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg",
                  )}
                >
                  {item.id === value.activeId ? <Check size={12} className="shrink-0 text-accent" aria-hidden="true" /> : <span className="w-3" />}
                  <span className="truncate">{item.name}</span>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              const id = newId();
              onChange({ activeId: value.activeId, items: [...value.items, { id, name: "New environment", values: [] }] });
              setSelected(id);
            }}
            className="m-1.5 inline-flex h-7 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line text-xs text-fg hover:bg-hover"
          >
            <Plus size={13} aria-hidden="true" />
            New environment
          </button>
        </div>
        {current ? (
          <div className="flex min-h-0 min-w-0 flex-col">
            <EnvironmentName
              key={current.id}
              name={current.name}
              active={current.id === value.activeId}
              onName={(name) => update(current.id, { name })}
              onUse={() => onChange({ ...value, activeId: current.id === value.activeId ? null : current.id })}
              onDelete={() => {
                const items = value.items.filter((item) => item.id !== current.id);
                onChange({ activeId: value.activeId === current.id ? (items[0]?.id ?? null) : value.activeId, items });
                setSelected(items[0]?.id ?? null);
              }}
            />
            <div className="min-h-0 flex-1 overflow-auto">
              <KeyValueEditor label="Environment variables" rows={current.values} onChange={(values) => update(current.id, { values })} />
            </div>
          </div>
        ) : (
          <p className="px-4 py-6 text-[13px] text-muted">Create an environment to switch hosts, tokens, and other values without editing each request.</p>
        )}
      </div>
    </DialogFrame>
  );
}

function EnvironmentName({
  name,
  active,
  onName,
  onUse,
  onDelete,
}: {
  name: string;
  active: boolean;
  onName: (name: string) => void;
  onUse: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(name);
  return (
    <div className="flex items-center gap-2 border-b border-line px-3 py-2">
      <input
        aria-label="Environment name"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft.trim() && draft.trim() !== name) onName(draft.trim());
          else setDraft(name);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="h-7 min-w-0 flex-1 rounded-md border border-line bg-raised px-2 text-[12.5px] text-fg outline-none focus:border-ring focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={onUse}
        className={cx(
          "h-7 shrink-0 cursor-pointer rounded-md px-2.5 text-xs",
          active ? "bg-accent-soft text-fg" : "border border-line text-muted hover:text-fg",
        )}
      >
        {active ? "Active" : "Set active"}
      </button>
      <IconButton label="Delete environment" onClick={onDelete}>
        <Trash2 size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

export function EnvironmentPicker({
  value,
  onChange,
}: {
  value: Environments;
  onChange: (value: Environments) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = value.items.find((item) => item.id === value.activeId);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Environment"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-6 max-w-44 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted hover:bg-hover hover:text-fg"
      >
        <span className={cx("truncate", active && "text-fg")}>{active ? active.name : "No environment"}</span>
        <ChevronDown size={12} className="shrink-0 text-faint" aria-hidden="true" />
      </button>
      {open ? (
        <div role="listbox" aria-label="Environment" className="absolute top-full right-0 z-30 mt-1 w-56 rounded-lg border border-line bg-panel p-1 shadow-[0_8px_28px_rgb(0_0_0/0.28)]">
          <button
            type="button"
            role="option"
            aria-selected={value.activeId === null}
            onClick={() => {
              onChange({ ...value, activeId: null });
              setOpen(false);
            }}
            className={cx("flex h-7 w-full cursor-pointer items-center rounded-md px-2 text-left text-[12.5px]", value.activeId === null ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg")}
          >
            No environment
          </button>
          {value.items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === value.activeId}
              onClick={() => {
                onChange({ ...value, activeId: item.id });
                setOpen(false);
              }}
              className={cx("flex h-7 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-left text-[12.5px]", item.id === value.activeId ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg")}
            >
              {item.id === value.activeId ? <Check size={12} className="text-accent" aria-hidden="true" /> : <span className="w-3" />}
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
