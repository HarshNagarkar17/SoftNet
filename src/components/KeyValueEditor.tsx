import { Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { newId, type KvRow } from "../lib/request";
import { cx } from "./ui";
import { SuggestInput } from "./VariableSuggest";

type KeyValueEditorProps = {
  rows: KvRow[];
  onChange: (rows: KvRow[]) => void;
  label: string;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
};

const cell =
  "h-7 w-full min-w-0 bg-transparent px-2 font-mono text-[12.5px] text-fg outline-none placeholder:font-sans placeholder:text-faint focus-visible:outline-none";

function toBulk(rows: KvRow[]): string {
  return rows
    .filter((row) => row.key || row.value)
    .map((row) => `${row.enabled ? "" : "// "}${row.key}: ${row.value}`)
    .join("\n");
}

function fromBulk(text: string, previous: KvRow[]): KvRow[] {
  const rows: KvRow[] = [];
  text.split("\n").forEach((line, index) => {
    if (!line.trim()) return;
    const disabled = line.trimStart().startsWith("//");
    const body = disabled ? line.trimStart().slice(2).trimStart() : line;
    const colon = body.indexOf(":");
    const key = (colon === -1 ? body : body.slice(0, colon)).trim();
    const value = colon === -1 ? "" : body.slice(colon + 1).trim();
    rows.push({ id: previous[index]?.id ?? newId(), key, value, enabled: !disabled });
  });
  return rows;
}

export function KeyValueEditor({
  rows,
  onChange,
  label,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: KeyValueEditorProps) {
  const ghostId = useRef(newId());
  const [bulk, setBulk] = useState<string | null>(null);
  const display = [...rows, { id: ghostId.current, key: "", value: "", enabled: true }];

  function update(id: string, patch: Partial<KvRow>) {
    if (id === ghostId.current) {
      onChange([...rows, { id, key: "", value: "", enabled: true, ...patch }]);
      ghostId.current = newId();
      return;
    }
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  const allOn = rows.length > 0 && rows.every((row) => row.enabled);

  return (
    <div className="px-3 py-2">
      <div className="mb-1.5 flex h-6 items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        <button
          type="button"
          onClick={() => {
            if (bulk === null) setBulk(toBulk(rows));
            else {
              onChange(fromBulk(bulk, rows));
              setBulk(null);
            }
          }}
          className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-muted hover:bg-hover hover:text-fg"
        >
          {bulk === null ? "Bulk edit" : "Key-value edit"}
        </button>
      </div>
      {bulk !== null ? (
        <textarea
          aria-label={`${label}, one per line as key: value`}
          value={bulk}
          onChange={(event) => setBulk(event.target.value)}
          onBlur={() => onChange(fromBulk(bulk, rows))}
          spellCheck={false}
          placeholder={"Content-Type: application/json\n// Disabled-Header: value"}
          className="h-48 w-full resize-y rounded-md border border-line bg-raised p-3 font-mono text-[13px] leading-5 text-fg outline-none placeholder:text-faint focus:border-ring focus-visible:outline-none"
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-line" role="table" aria-label={label}>
          <div
            role="row"
            className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1.5fr)_32px] border-b border-line bg-raised text-xs text-muted"
          >
            <div role="columnheader" className="flex items-center justify-center">
              <input
                type="checkbox"
                aria-label={`Use all ${label.toLowerCase()}`}
                checked={allOn}
                disabled={rows.length === 0}
                onChange={(event) =>
                  onChange(rows.map((row) => ({ ...row, enabled: event.target.checked })))
                }
                className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
              />
            </div>
            <div role="columnheader" className="border-l border-line px-2 py-1">
              Key
            </div>
            <div role="columnheader" className="border-l border-line px-2 py-1">
              Value
            </div>
            <div role="columnheader" className="sr-only">
              Remove
            </div>
          </div>
          {display.map((row, index) => {
            const ghost = row.id === ghostId.current;
            return (
              <div
                role="row"
                key={row.id}
                className={cx(
                  "group grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1.5fr)_32px] focus-within:bg-raised",
                  index < display.length - 1 && "border-b border-line",
                  !row.enabled && "opacity-55",
                )}
              >
                <div role="cell" className="flex items-center justify-center">
                  {ghost ? null : (
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      aria-label={`Use ${label.toLowerCase()} ${row.key || index + 1}`}
                      onChange={(event) => update(row.id, { enabled: event.target.checked })}
                      className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
                    />
                  )}
                </div>
                <div role="cell" className="border-l border-line">
                  <SuggestInput
                    aria-label={`${label} key ${index + 1}`}
                    value={row.key}
                    placeholder={ghost ? keyPlaceholder : ""}
                    onValue={(key) => update(row.id, { key })}
                    className={cell}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div role="cell" className="border-l border-line">
                  <SuggestInput
                    aria-label={`${label} value ${index + 1}`}
                    value={row.value}
                    placeholder={ghost ? valuePlaceholder : ""}
                    onValue={(value) => update(row.id, { value })}
                    className={cell}
                    spellCheck={false}
                    autoComplete="off"
                  />
                </div>
                <div role="cell" className="flex items-center justify-center">
                  {ghost ? null : (
                    <button
                      type="button"
                      aria-label={`Remove ${label.toLowerCase()} ${row.key || index + 1}`}
                      onClick={() => onChange(rows.filter((item) => item.id !== row.id))}
                      className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-faint opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-hover hover:text-danger focus-visible:opacity-100"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
