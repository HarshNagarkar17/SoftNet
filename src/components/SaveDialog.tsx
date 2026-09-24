import { Box, Folder, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { destinations, type Workspace } from "../lib/collections";
import { cx } from "./ui";

type SaveDialogProps = {
  workspace: Workspace;
  initialName: string;
  onCancel: () => void;
  onSave: (name: string, target: { parent: string } | { newCollection: string }) => void;
};

const input =
  "h-7 w-full rounded-md border border-line bg-raised px-2.5 text-[12.5px] text-fg outline-none placeholder:text-faint focus:border-ring focus-visible:outline-none";

export function SaveDialog({ workspace, initialName, onCancel, onSave }: SaveDialogProps) {
  const rows = useMemo(() => destinations(workspace), [workspace]);
  const [name, setName] = useState(initialName);
  const [target, setTarget] = useState<string | null>(rows[0]?.node.id ?? null);
  const [creating, setCreating] = useState(rows.length === 0);
  const [collection, setCollection] = useState(rows.length === 0 ? "My collection" : "");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.select();
  }, []);

  const valid = name.trim() !== "" && (creating ? collection.trim() !== "" : target !== null);

  function submit() {
    if (!valid) return;
    onSave(name.trim(), creating ? { newCollection: collection.trim() } : { parent: target! });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 pt-[14vh]"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-title"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className="toast-in w-[420px] rounded-xl border border-line bg-panel shadow-[0_24px_64px_rgb(0_0_0/0.35)]"
      >
        <div className="px-4 pt-4">
          <h2 id="save-title" className="text-sm font-semibold text-fg">
            Save request
          </h2>
          <label className="mt-3 block text-xs text-muted" htmlFor="save-name">
            Name
          </label>
          <input
            id="save-name"
            ref={nameRef}
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={cx(input, "mt-1")}
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted">Save to</span>
            {rows.length > 0 ? (
              <button
                type="button"
                onClick={() => setCreating((value) => !value)}
                className="inline-flex h-6 cursor-pointer items-center gap-1 rounded px-1.5 text-xs text-muted hover:bg-hover hover:text-fg"
              >
                {creating ? (
                  "Pick existing"
                ) : (
                  <>
                    <Plus size={12} aria-hidden="true" />
                    New collection
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
        <div className="px-4 pt-1.5 pb-4">
          {creating ? (
            <input
              aria-label="New collection name"
              autoFocus={rows.length > 0}
              value={collection}
              placeholder="Collection name"
              onChange={(event) => setCollection(event.target.value)}
              className={input}
            />
          ) : (
            <div role="radiogroup" aria-label="Destination" className="max-h-56 overflow-y-auto rounded-md border border-line p-1">
              {rows.map(({ node, depth }) => {
                const Icon = node.kind === "collection" ? Box : Folder;
                const selected = target === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTarget(node.id)}
                    onDoubleClick={() => {
                      setTarget(node.id);
                      if (name.trim()) onSave(name.trim(), { parent: node.id });
                    }}
                    style={{ paddingLeft: 8 + depth * 14 }}
                    className={cx(
                      "flex h-7 w-full cursor-pointer items-center gap-2 rounded-md pr-2 text-left text-[12.5px]",
                      selected ? "bg-accent-soft text-fg" : "text-muted hover:bg-hover hover:text-fg",
                    )}
                  >
                    <Icon size={13} className={selected ? "text-accent" : "text-faint"} aria-hidden="true" />
                    <span className="truncate">{node.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-7 cursor-pointer rounded-md px-3 text-[12.5px] text-muted hover:bg-hover hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid}
            className="h-7 cursor-pointer rounded-md bg-accent px-3 text-[12.5px] font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
