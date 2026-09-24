import { Check, WandSparkles } from "lucide-react";
import { useMemo } from "react";
import type { BodyKind, KvRow } from "../lib/request";
import { CodeEditor } from "./CodeEditor";
import { KeyValueEditor } from "./KeyValueEditor";
import { Segmented } from "./ui";

const KINDS: { id: BodyKind; label: string }[] = [
  { id: "none", label: "None" },
  { id: "json", label: "JSON" },
  { id: "text", label: "Text" },
  { id: "form", label: "Form URL-encoded" },
];

type BodyEditorProps = {
  kind: BodyKind;
  text: string;
  formFields: KvRow[];
  onKind: (kind: BodyKind) => void;
  onText: (text: string) => void;
  onForm: (rows: KvRow[]) => void;
};

function jsonProblem(text: string): string | null {
  if (!text.trim()) return null;
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid JSON";
  }
}

export function BodyEditor({ kind, text, formFields, onKind, onText, onForm }: BodyEditorProps) {
  const problem = useMemo(() => (kind === "json" ? jsonProblem(text) : null), [kind, text]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-3 px-3">
        <Segmented label="Body type" value={kind} options={KINDS} onChange={onKind} />
        {kind === "json" && text.trim() ? (
          <div className="flex min-w-0 items-center gap-3">
            {problem ? (
              <span className="sr-only">{problem}</span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-s-ok">
                <Check size={13} aria-hidden="true" />
                Valid JSON
              </span>
            )}
            <button
              type="button"
              disabled={problem !== null}
              onClick={() => onText(JSON.stringify(JSON.parse(text), null, 2))}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              <WandSparkles size={13} aria-hidden="true" />
              Beautify
            </button>
          </div>
        ) : null}
      </div>
      {kind === "none" ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center">
          <p className="max-w-xs text-[13px] text-muted">
            This request has no body. Choose JSON, Text, or Form to send one.
          </p>
        </div>
      ) : null}
      {kind === "json" || kind === "text" ? (
        <div className="mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-raised">
          <CodeEditor
            label="Request body"
            value={text}
            onChange={onText}
            json={kind === "json"}
            placeholder={kind === "json" ? '{\n  "name": "Ada"\n}' : "Plain text body"}
          />
        </div>
      ) : null}
      {kind === "form" ? (
        <div className="-mt-2 min-h-0 flex-1 overflow-auto">
          <KeyValueEditor rows={formFields} onChange={onForm} label="Form fields" />
        </div>
      ) : null}
    </div>
  );
}
