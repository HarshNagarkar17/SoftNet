import { memo, useLayoutEffect, useMemo, useRef } from "react";
import { editForKey } from "../lib/editor";
import { jsonErrorSpan } from "../lib/format";
import { highlightScript } from "../lib/script-edit";
import { useScriptSuggest } from "./ScriptSuggest";
import { useVariableSuggest } from "./VariableSuggest";

const TOKEN =
  /("(?:\\.|[^"\\\n])*"?)(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false)\b|\b(null)\b|([{}[\],:])/g;

const HIGHLIGHT_LIMIT = 200_000;

const MARK = "underline decoration-danger decoration-wavy decoration-2 underline-offset-[3px]";

function marked(text: string, from: number, className: string | null, mark: { start: number; end: number } | null, key: { n: number }) {
  const out: React.ReactNode[] = [];
  const push = (slice: string, extra: string | null) => {
    if (!slice) return;
    const cls = [className, extra].filter(Boolean).join(" ");
    out.push(cls ? <span key={key.n++} className={cls}>{slice}</span> : slice);
  };
  const end = from + text.length;
  if (!mark || end <= mark.start || from >= mark.end) {
    push(text, null);
    return out;
  }
  const left = Math.max(from, mark.start) - from;
  const right = Math.min(end, mark.end) - from;
  push(text.slice(0, left), null);
  push(text.slice(left, right), MARK);
  push(text.slice(right), null);
  return out;
}

function highlightJson(text: string, mark: { start: number; end: number } | null) {
  const out: React.ReactNode[] = [];
  const key = { n: 0 };
  let last = 0;
  const paint = (slice: string, from: number, className: string | null) => {
    out.push(...marked(slice, from, className, mark, key));
  };
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) paint(text.slice(last, index), last, null);
    const [whole, str, colon, num, bool, nul, punct] = match;
    if (str !== undefined) {
      paint(str, index, colon ? "text-j-key" : "text-j-string");
      if (colon) paint(colon, index + str.length, "text-j-punct");
    } else if (num !== undefined) {
      paint(num, index, "text-j-number");
    } else if (bool !== undefined) {
      paint(bool, index, "text-j-bool");
    } else if (nul !== undefined) {
      paint(nul, index, "text-j-null");
    } else if (punct !== undefined) {
      paint(punct, index, "text-j-punct");
    } else {
      paint(whole, index, null);
    }
    last = index + whole.length;
  }
  if (last < text.length) paint(text.slice(last), last, null);
  return out;
}

const SCRIPT_CLASS = {
  plain: "",
  comment: "text-faint italic",
  string: "text-j-string",
  keyword: "text-j-bool",
  number: "text-j-number",
  sn: "text-accent",
  punct: "text-j-punct",
} as const;

function highlightSource(text: string) {
  return highlightScript(text).map((span, index) =>
    span.kind === "plain" ? (
      span.text
    ) : (
      <span key={index} className={SCRIPT_CLASS[span.kind]}>
        {span.text}
      </span>
    ),
  );
}

const Highlighted = memo(function Highlighted({
  text,
  json,
  script,
  markStart,
  markEnd,
}: {
  text: string;
  json: boolean;
  script: boolean;
  markStart: number;
  markEnd: number;
}) {
  if (text.length > HIGHLIGHT_LIMIT) return <>{text}</>;
  if (script) return <>{highlightSource(text)}</>;
  if (!json) return <>{text}</>;
  const mark = markStart >= 0 ? { start: markStart, end: markEnd } : null;
  return <>{highlightJson(text, mark)}</>;
});

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  json?: boolean;
  script?: boolean;
  placeholder?: string;
};

export function CodeEditor({ value, onChange, label, json = false, script = false, placeholder }: CodeEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ start: number; end: number } | null>(null);
  const applyCaret = (text: string, caret: number) => {
    pending.current = { start: caret, end: caret };
    onChange(text);
  };
  const suggest = useVariableSuggest(applyCaret);
  const scripts = useScriptSuggest(script, applyCaret);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const next = pending.current;
    if (!area || !next) return;
    area.setSelectionRange(next.start, next.end);
    pending.current = null;
  }, [value]);
  const problem = json && value.length <= HIGHLIGHT_LIMIT ? jsonErrorSpan(value) : null;
  const lineCount = useMemo(() => {
    let count = 1;
    for (let i = 0; i < value.length; i += 1) if (value.charCodeAt(i) === 10) count += 1;
    return count;
  }, [value]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden font-mono text-[13px] leading-5">
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="w-11 shrink-0 overflow-hidden border-r border-line py-3 pr-2 text-right text-faint tabular-nums select-none"
      >
        {Array.from({ length: lineCount }, (_, index) => (
          <div key={index}>{index + 1}</div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <pre
          ref={preRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 m-0 overflow-hidden px-3 py-3 whitespace-pre text-fg"
        >
          <Highlighted text={value} json={json} script={script} markStart={problem?.start ?? -1} markEnd={problem?.end ?? -1} />
          {"\n"}
        </pre>
        <textarea
          ref={areaRef}
          aria-label={label}
          value={value}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value);
            suggest.look(event.target);
            if (event.target instanceof HTMLTextAreaElement) scripts.look(event.target);
          }}
          onScroll={(event) => {
            const { scrollTop, scrollLeft } = event.currentTarget;
            if (preRef.current) {
              preRef.current.scrollTop = scrollTop;
              preRef.current.scrollLeft = scrollLeft;
            }
            if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
          }}
          onKeyDown={(event) => {
            if (scripts.onKeyDown(event)) return;
            if (suggest.onKeyDown(event)) return;
            if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return;
            const area = event.currentTarget;
            if (event.key === "Tab" && !event.shiftKey) {
              event.preventDefault();
              const start = area.selectionStart;
              pending.current = { start: start + 2, end: start + 2 };
              onChange(`${value.slice(0, start)}  ${value.slice(area.selectionEnd)}`);
              return;
            }
            const edit = editForKey(value, area.selectionStart, area.selectionEnd, event.key);
            if (!edit) return;
            event.preventDefault();
            pending.current = { start: edit.start, end: edit.end };
            if (edit.value !== value) onChange(edit.value);
            else area.setSelectionRange(edit.start, edit.end);
          }}
          onClick={(event) => {
            suggest.look(event.currentTarget);
            scripts.look(event.currentTarget);
          }}
          onBlur={() =>
            window.setTimeout(() => {
              suggest.close();
              scripts.close();
            }, 0)
          }
          className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent px-3 py-3 whitespace-pre text-transparent caret-[var(--fg)] outline-none placeholder:font-sans placeholder:text-faint focus-visible:outline-none"
        />
        {suggest.menu}
        {scripts.menu}
      </div>
    </div>
  );
}
