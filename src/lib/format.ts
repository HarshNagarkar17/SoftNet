export type TokenKind = "key" | "string" | "number" | "boolean" | "null" | "punct" | "text";

export type Token = { kind: TokenKind; text: string };

export type Line = {
  depth: number;
  tokens: Token[];
  /** Index of the line that closes this one, for foldable openers. */
  end?: number;
  /** Number of direct children, for foldable openers. */
  count?: number;
  bracket?: "{" | "[";
};

export function plainLines(text: string): Line[] {
  return text.split(/\r?\n/).map((line) => ({
    depth: 0,
    tokens: [{ kind: "text", text: line }],
  }));
}

function isWhitespace(code: number): boolean {
  return code === 32 || code === 10 || code === 13 || code === 9;
}

/**
 * Formats JSON by walking the source text rather than JSON.parse, so large
 * integers and key order are shown exactly as the server sent them.
 * Returns null when the text is not valid JSON.
 */
export function formatJson(source: string): Line[] | null {
  const text = source.trim();
  if (text === "" || (text[0] !== "{" && text[0] !== "[" && text[0] !== '"')) {
    if (!/^(-?\d|true|false|null)/.test(text)) return null;
  }
  try {
    JSON.parse(text);
  } catch {
    return null;
  }

  const lines: Line[] = [];
  const stack: { line: number; count: number }[] = [];
  let current: Token[] = [];
  let depth = 0;
  let i = 0;
  const length = text.length;

  const flush = () => {
    if (current.length > 0) {
      lines.push({ depth, tokens: current });
      current = [];
    }
  };

  const nextSignificant = (from: number): number => {
    let j = from;
    while (j < length && isWhitespace(text.charCodeAt(j))) j += 1;
    return j;
  };

  while (i < length) {
    const char = text[i];
    const code = text.charCodeAt(i);
    if (isWhitespace(code)) {
      i += 1;
      continue;
    }

    if (char === "{" || char === "[") {
      const close = char === "{" ? "}" : "]";
      const after = nextSignificant(i + 1);
      if (text[after] === close) {
        current.push({ kind: "punct", text: char + close });
        i = after + 1;
        continue;
      }
      current.push({ kind: "punct", text: char });
      lines.push({ depth, tokens: current, bracket: char });
      stack.push({ line: lines.length - 1, count: 1 });
      current = [];
      depth += 1;
      i += 1;
      continue;
    }

    if (char === "}" || char === "]") {
      flush();
      depth -= 1;
      const tokens: Token[] = [{ kind: "punct", text: char }];
      lines.push({ depth, tokens });
      const open = stack.pop();
      if (open) {
        lines[open.line].end = lines.length - 1;
        lines[open.line].count = open.count;
      }
      const after = nextSignificant(i + 1);
      if (text[after] === ",") {
        tokens.push({ kind: "punct", text: "," });
        if (stack.length > 0) stack[stack.length - 1].count += 1;
        i = after + 1;
      } else {
        i += 1;
      }
      continue;
    }

    if (char === ",") {
      current.push({ kind: "punct", text: "," });
      flush();
      if (stack.length > 0) stack[stack.length - 1].count += 1;
      i += 1;
      continue;
    }

    if (char === ":") {
      current.push({ kind: "punct", text: ": " });
      i += 1;
      continue;
    }

    if (char === '"') {
      let j = i + 1;
      while (j < length) {
        const c = text.charCodeAt(j);
        if (c === 92) {
          j += 2;
          continue;
        }
        if (c === 34) break;
        j += 1;
      }
      const value = text.slice(i, j + 1);
      const after = nextSignificant(j + 1);
      current.push({ kind: text[after] === ":" ? "key" : "string", text: value });
      i = j + 1;
      continue;
    }

    let j = i;
    while (j < length) {
      const c = text[j];
      if (c === "," || c === "}" || c === "]" || isWhitespace(text.charCodeAt(j))) break;
      j += 1;
    }
    const word = text.slice(i, j);
    const kind: TokenKind =
      word === "true" || word === "false" ? "boolean" : word === "null" ? "null" : "number";
    current.push({ kind, text: word });
    i = j;
  }
  flush();
  return lines;
}

function skipSpace(text: string, index: number): number {
  while (index < text.length && " \t\r\n".includes(text[index])) index += 1;
  return index;
}

function span(text: string, start: number, end: number): { start: number; end: number } {
  const from = Math.max(0, Math.min(start, text.length - 1));
  return { start: from, end: Math.max(from + 1, Math.min(text.length, end)) };
}

function readString(text: string, index: number): { end: number } | { error: { start: number; end: number } } {
  let cursor = index + 1;
  while (cursor < text.length) {
    if (text[cursor] === "\\") {
      if (cursor + 1 >= text.length) return { error: span(text, index, text.length) };
      cursor += 2;
      continue;
    }
    if (text[cursor] === '"') return { end: cursor + 1 };
    if (text[cursor] === "\n") return { error: span(text, index, cursor) };
    cursor += 1;
  }
  return { error: span(text, index, text.length) };
}

function readValue(text: string, index: number): { end: number } | { error: { start: number; end: number } } {
  const start = skipSpace(text, index);
  if (start >= text.length) return { error: span(text, text.length - 1, text.length) };
  const char = text[start];
  if (char === '"') return readString(text, start);
  if (char === "{") return readObject(text, start);
  if (char === "[") return readArray(text, start);
  if (char === "-" || (char >= "0" && char <= "9")) {
    let cursor = start + 1;
    while (cursor < text.length && /[0-9eE+.\-]/.test(text[cursor])) cursor += 1;
    if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text.slice(start, cursor))) {
      return { error: span(text, start, cursor) };
    }
    return { end: cursor };
  }
  if (text.startsWith("true", start)) return { end: start + 4 };
  if (text.startsWith("false", start)) return { end: start + 5 };
  if (text.startsWith("null", start)) return { end: start + 4 };
  let cursor = start + 1;
  while (cursor < text.length && !` \t\r\n,}]`.includes(text[cursor])) cursor += 1;
  return { error: span(text, start, cursor) };
}

function readObject(text: string, index: number): { end: number } | { error: { start: number; end: number } } {
  let cursor = skipSpace(text, index + 1);
  if (text[cursor] === "}") return { end: cursor + 1 };
  while (cursor < text.length) {
    if (text[cursor] !== '"') return { error: span(text, cursor, cursor + 1) };
    const key = readString(text, cursor);
    if ("error" in key) return key;
    const afterKey = skipSpace(text, key.end);
    if (text[afterKey] !== ":") return { error: span(text, cursor, key.end) };
    const value = readValue(text, afterKey + 1);
    if ("error" in value) return value;
    cursor = skipSpace(text, value.end);
    if (text[cursor] === ",") {
      cursor = skipSpace(text, cursor + 1);
      if (text[cursor] === "}") return { error: span(text, cursor, cursor + 1) };
      continue;
    }
    if (text[cursor] === "}") return { end: cursor + 1 };
    return { error: span(text, cursor, cursor + 1) };
  }
  return { error: span(text, index, index + 1) };
}

function readArray(text: string, index: number): { end: number } | { error: { start: number; end: number } } {
  let cursor = skipSpace(text, index + 1);
  if (text[cursor] === "]") return { end: cursor + 1 };
  while (cursor < text.length) {
    const value = readValue(text, cursor);
    if ("error" in value) return value;
    cursor = skipSpace(text, value.end);
    if (text[cursor] === ",") {
      cursor = skipSpace(text, cursor + 1);
      if (text[cursor] === "]") return { error: span(text, cursor, cursor + 1) };
      continue;
    }
    if (text[cursor] === "]") return { end: cursor + 1 };
    return { error: span(text, cursor, cursor + 1) };
  }
  return { error: span(text, index, index + 1) };
}

/** Range to underline when JSON.parse rejects the text. Null when the text is empty or valid. */
export function jsonErrorSpan(source: string): { start: number; end: number } | null {
  if (!source.trim()) return null;
  try {
    JSON.parse(source);
    return null;
  } catch {
    const found = readValue(source, 0);
    if ("error" in found) return found.error;
    const rest = skipSpace(source, found.end);
    if (rest < source.length) return span(source, rest, rest + 1);
    return span(source, 0, source.length);
  }
}

export function lineText(line: Line): string {
  let out = "";
  for (const token of line.tokens) out += token.text;
  return out;
}

export function detectFormat(body: string, contentType: string): "json" | "html" | "xml" | "text" {
  const trimmed = body.trimStart();
  if (contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return "json";
  }
  if (contentType.includes("html") || /^<!doctype html|^<html/i.test(trimmed)) return "html";
  if (contentType.includes("xml") || trimmed.startsWith("<?xml")) return "xml";
  return "text";
}
