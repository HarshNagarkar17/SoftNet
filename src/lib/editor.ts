const PAIRS: Record<string, string> = {
  '"': '"',
  "'": "'",
  "(": ")",
  "[": "]",
  "{": "}",
};

const OPEN_FOR: Record<string, string> = {
  '"': '"',
  "'": "'",
  ")": "(",
  "]": "[",
  "}": "{",
};

export type Edit = { value: string; start: number; end: number };

function lineIndent(value: string, index: number): string {
  const lineStart = value.lastIndexOf("\n", index - 1) + 1;
  const line = value.slice(lineStart, index);
  return line.match(/^[ \t]*/)?.[0] ?? "";
}

export function editForKey(value: string, start: number, end: number, key: string): Edit | null {
  if (key === "Backspace" && start === end && start > 0) {
    const open = value[start - 1];
    const close = PAIRS[open];
    if (close && value[start] === close) {
      return { value: value.slice(0, start - 1) + value.slice(start + 1), start: start - 1, end: start - 1 };
    }
    return null;
  }

  if (key === "Enter" && start === end) {
    const before = value[start - 1];
    const after = value[start];
    const indent = lineIndent(value, start);
    const pair = (before === "{" && after === "}") || (before === "[" && after === "]");
    if (pair) {
      const inner = `${indent}  `;
      const insert = `\n${inner}\n${indent}`;
      const caret = start + 1 + inner.length;
      return { value: value.slice(0, start) + insert + value.slice(end), start: caret, end: caret };
    }
    if (indent) {
      const insert = `\n${indent}`;
      const caret = start + insert.length;
      return { value: value.slice(0, start) + insert + value.slice(end), start: caret, end: caret };
    }
    return null;
  }

  if (start === end && OPEN_FOR[key] && value[start] === key) {
    const open = OPEN_FOR[key];
    if (PAIRS[open] === key) {
      return { value, start: start + 1, end: start + 1 };
    }
  }

  const close = PAIRS[key];
  if (!close) return null;

  if (start !== end) {
    const selected = value.slice(start, end);
    return {
      value: value.slice(0, start) + key + selected + close + value.slice(end),
      start: start + 1,
      end: start + 1 + selected.length,
    };
  }

  return {
    value: value.slice(0, start) + key + close + value.slice(end),
    start: start + 1,
    end: start + 1,
  };
}
