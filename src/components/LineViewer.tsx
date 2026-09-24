import { ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { lineText, type Line, type Token } from "../lib/format";

const ROW = 20;
const OVERSCAN = 30;
const MAX_MATCHES = 20_000;

const tokenClass: Record<Token["kind"], string> = {
  key: "text-j-key",
  string: "text-j-string",
  number: "text-j-number",
  boolean: "text-j-bool",
  null: "text-j-null",
  punct: "text-j-punct",
  text: "text-fg",
};

export type Match = { line: number; start: number; end: number };

type LineViewerProps = {
  lines: Line[];
  query: string;
  current: number;
  onMatches: (count: number) => void;
};

function findMatches(lines: Line[], query: string): Match[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const matches: Match[] = [];
  for (let line = 0; line < lines.length; line += 1) {
    const text = lineText(lines[line]).toLowerCase();
    let from = text.indexOf(needle);
    while (from !== -1) {
      matches.push({ line, start: from, end: from + needle.length });
      if (matches.length >= MAX_MATCHES) return matches;
      from = text.indexOf(needle, from + needle.length);
    }
  }
  return matches;
}

function renderTokens(tokens: Token[], ranges: Match[], currentMatch: Match | undefined): ReactNode[] {
  const out: ReactNode[] = [];
  let offset = 0;
  let key = 0;
  for (const token of tokens) {
    const start = offset;
    const end = offset + token.text.length;
    offset = end;
    const inside = ranges.filter((range) => range.start < end && range.end > start);
    if (inside.length === 0) {
      out.push(
        <span key={key++} className={tokenClass[token.kind]}>
          {token.text}
        </span>,
      );
      continue;
    }
    const pieces: ReactNode[] = [];
    let cursor = start;
    for (const range of inside) {
      const from = Math.max(range.start, start);
      const to = Math.min(range.end, end);
      if (from > cursor) pieces.push(token.text.slice(cursor - start, from - start));
      pieces.push(
        <mark key={`m${key++}`} data-current={range === currentMatch ? "" : undefined}>
          {token.text.slice(from - start, to - start)}
        </mark>,
      );
      cursor = to;
    }
    if (cursor < end) pieces.push(token.text.slice(cursor - start));
    out.push(
      <span key={key++} className={tokenClass[token.kind]}>
        {pieces}
      </span>,
    );
  }
  return out;
}

export function LineViewer({ lines, query, current, onMatches }: LineViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    setCollapsed(new Set());
    scrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [lines]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.clientHeight));
    observer.observe(element);
    setHeight(element.clientHeight);
    return () => observer.disconnect();
  }, []);

  const matches = useMemo(() => findMatches(lines, query), [lines, query]);
  useEffect(() => onMatches(matches.length), [matches, onMatches]);

  const searching = query.length > 0;
  const visible = useMemo(() => {
    const out: number[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      out.push(index);
      const end = lines[index].end;
      if (!searching && end !== undefined && collapsed.has(index)) index = end;
    }
    return out;
  }, [lines, collapsed, searching]);

  const matchesByLine = useMemo(() => {
    const map = new Map<number, Match[]>();
    for (const match of matches) {
      const list = map.get(match.line);
      if (list) list.push(match);
      else map.set(match.line, [match]);
    }
    return map;
  }, [matches]);

  const currentMatch = matches.length > 0 ? matches[Math.min(current, matches.length - 1)] : undefined;

  useEffect(() => {
    if (!currentMatch || !scrollRef.current) return;
    const element = scrollRef.current;
    const top = currentMatch.line * ROW;
    if (top < element.scrollTop || top > element.scrollTop + element.clientHeight - ROW * 2) {
      element.scrollTop = Math.max(0, top - element.clientHeight / 3);
    }
  }, [currentMatch]);

  const widest = useMemo(() => {
    let max = 0;
    for (const line of lines) {
      let width = line.depth * 2;
      for (const token of line.tokens) width += token.text.length;
      if (width > max) max = width;
    }
    return max;
  }, [lines]);

  const gutterChars = String(lines.length).length;
  const first = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const last = Math.min(visible.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);
  const foldable = lines.some((line) => line.end !== undefined);

  function toggle(index: number) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      className="h-full overflow-auto font-mono text-[13px]"
      data-selectable
      tabIndex={0}
      aria-label="Response body"
    >
      <div
        style={{ height: visible.length * ROW, minWidth: `calc(${widest + gutterChars + 6}ch + 24px)` }}
        className="relative"
      >
        <div style={{ transform: `translateY(${first * ROW}px)` }} className="absolute inset-x-0 top-0">
          {visible.slice(first, last).map((index) => {
            const line = lines[index];
            const isCollapsed = !searching && collapsed.has(index) && line.end !== undefined;
            return (
              <div key={index} className="flex hover:bg-hover/60" style={{ height: ROW, lineHeight: `${ROW}px` }}>
                <span
                  className="sticky left-0 z-10 shrink-0 bg-panel pr-1 pl-3 text-right text-faint tabular-nums select-none"
                  style={{ width: `calc(${gutterChars}ch + 20px)` }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                {foldable ? (
                  <span className="sticky z-10 flex w-4 shrink-0 items-center justify-center bg-panel" style={{ left: `calc(${gutterChars}ch + 20px)` }}>
                    {line.end !== undefined && !searching ? (
                      <button
                        type="button"
                        onClick={() => toggle(index)}
                        aria-label={isCollapsed ? `Expand line ${index + 1}` : `Collapse line ${index + 1}`}
                        aria-expanded={!isCollapsed}
                        className="flex h-4 w-4 cursor-pointer items-center justify-center rounded text-faint hover:bg-hover hover:text-fg"
                      >
                        {isCollapsed ? <ChevronRight size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
                      </button>
                    ) : null}
                  </span>
                ) : null}
                <span className="pr-6 pl-2 whitespace-pre" style={{ paddingLeft: `calc(${line.depth * 2}ch + 8px)` }}>
                  {renderTokens(line.tokens, matchesByLine.get(index) ?? [], currentMatch)}
                  {isCollapsed ? (
                    <>
                      <button
                        type="button"
                        onClick={() => toggle(index)}
                        className="mx-1 cursor-pointer rounded bg-raised px-1.5 font-sans text-[11px] text-muted hover:text-fg"
                      >
                        {line.count} {line.bracket === "[" ? (line.count === 1 ? "item" : "items") : line.count === 1 ? "key" : "keys"}
                      </button>
                      {renderTokens(lines[line.end!].tokens, [], undefined)}
                    </>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
