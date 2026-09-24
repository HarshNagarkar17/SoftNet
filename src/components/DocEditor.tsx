import { Bold, Code2, Heading1, Italic, List } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

function inline(text: string): ReactNode[] {
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\n]+\))/g;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    const [whole, code, bold, italic, link] = match;
    if (code) {
      out.push(
        <code key={key++} className="rounded bg-raised px-1 py-0.5 font-mono text-[12px] text-fg">
          {code.slice(1, -1)}
        </code>,
      );
    } else if (bold) {
      out.push(
        <strong key={key++} className="font-semibold text-fg">
          {bold.slice(2, -2)}
        </strong>,
      );
    } else if (italic) {
      out.push(<em key={key++}>{italic.slice(1, -1)}</em>);
    } else if (link) {
      const label = link.slice(1, link.indexOf("]"));
      const href = link.slice(link.indexOf("(") + 1, -1);
      const safe = /^(https?:|mailto:)/i.test(href);
      out.push(
        safe ? (
          <a key={key++} href={href} className="text-accent underline decoration-accent/40 underline-offset-2" target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        ),
      );
    } else {
      out.push(whole);
    }
    last = index + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Preview({ source }: { source: string }) {
  const blocks: ReactNode[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  let key = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre key={key++} className="overflow-auto rounded-lg bg-raised px-3 py-2 font-mono text-[12.5px] leading-5 text-fg">
          {body.join("\n")}
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const className = level === 1 ? "text-xl font-semibold" : level === 2 ? "text-lg font-semibold" : "text-base font-semibold";
      blocks.push(
        <p key={key++} className={className}>
          {inline(heading[2])}
        </p>,
      );
      index += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1 pl-5">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !lines[index].startsWith("```") && !/^(#{1,3})\s+/.test(lines[index]) && !/^\s*[-*]\s+/.test(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(
      <p key={key++} className="text-[13px] leading-6 text-muted">
        {inline(paragraph.join(" "))}
      </p>,
    );
  }
  if (blocks.length === 0) {
    return <p className="text-[13px] text-faint">Nothing to preview yet.</p>;
  }
  return <div className="space-y-3 text-fg">{blocks}</div>;
}

function surround(value: string, start: number, end: number, before: string, after: string) {
  const selected = value.slice(start, end) || "text";
  const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
  const caret = start + before.length + selected.length + after.length;
  return { next, caret };
}

export function DocEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [mode, setMode] = useState<"write" | "preview">("write");
  const area = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<number | null>(null);

  function apply(before: string, after: string) {
    const el = area.current;
    if (!el) return;
    const { next, caret } = surround(value, el.selectionStart, el.selectionEnd, before, after);
    pending.current = caret;
    onChange(next);
    setMode("write");
    window.requestAnimationFrame(() => {
      const node = area.current;
      if (!node || pending.current == null) return;
      node.focus();
      node.setSelectionRange(pending.current, pending.current);
      pending.current = null;
    });
  }

  const tools = [
    { label: "Heading", icon: Heading1, before: "# ", after: "" },
    { label: "Bold", icon: Bold, before: "**", after: "**" },
    { label: "Italic", icon: Italic, before: "*", after: "*" },
    { label: "List", icon: List, before: "- ", after: "" },
    { label: "Code", icon: Code2, before: "`", after: "`" },
  ];

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-line">
      <div className="flex h-9 items-center justify-between gap-2 border-b border-line bg-raised px-2">
        <div className="flex min-w-0 items-center gap-0.5">
          {tools.map(({ label, icon: Icon, before, after }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              disabled={mode !== "write"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => apply(before, after)}
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-40"
            >
              <Icon size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
        <div role="tablist" aria-label="Documentation view" className="flex rounded-md bg-app p-0.5">
          {(["write", "preview"] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={mode === item}
              onClick={() => setMode(item)}
              className={cx(
                "h-6 cursor-pointer rounded px-2 text-xs capitalize",
                mode === item ? "bg-panel font-medium text-fg shadow-[0_0_0_1px_var(--line)]" : "text-muted hover:text-fg",
              )}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      {mode === "write" ? (
        <textarea
          ref={area}
          aria-label="Collection documentation"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={"# Notes\n\nDescribe what this collection is for.\n\n- Base URL\n- Auth"}
          spellCheck
          className="block min-h-56 w-full resize-y bg-transparent px-4 py-3 font-mono text-[13px] leading-6 text-fg outline-none placeholder:text-faint focus-visible:outline-none"
        />
      ) : (
        <div className="min-h-56 px-4 py-3">
          <Preview source={value} />
        </div>
      )}
    </div>
  );
}
