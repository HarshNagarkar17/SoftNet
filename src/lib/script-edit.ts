export type ScriptSpan = { text: string; kind: "plain" | "comment" | "string" | "keyword" | "number" | "sn" | "punct" };

const KEYWORDS = new Set([
  "const",
  "let",
  "var",
  "function",
  "return",
  "if",
  "else",
  "for",
  "while",
  "new",
  "typeof",
  "true",
  "false",
  "null",
  "undefined",
  "this",
  "try",
  "catch",
  "throw",
  "await",
  "async",
]);

export function highlightScript(text: string): ScriptSpan[] {
  const spans: ScriptSpan[] = [];
  const push = (kind: ScriptSpan["kind"], slice: string) => {
    if (!slice) return;
    const last = spans[spans.length - 1];
    if (last && last.kind === kind) last.text += slice;
    else spans.push({ text: slice, kind });
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest.startsWith("//")) {
      const end = text.indexOf("\n", i);
      const stop = end === -1 ? text.length : end;
      push("comment", text.slice(i, stop));
      i = stop;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = text.indexOf("*/", i + 2);
      const stop = end === -1 ? text.length : end + 2;
      push("comment", text.slice(i, stop));
      i = stop;
      continue;
    }
    const quote = text[i];
    if (quote === '"' || quote === "'" || quote === "`") {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === quote) {
          j += 1;
          break;
        }
        if (quote !== "`" && text[j] === "\n") break;
        j += 1;
      }
      push("string", text.slice(i, j));
      i = j;
      continue;
    }
    if (/[0-9]/.test(text[i]) && (i === 0 || /[^$\w]/.test(text[i - 1]))) {
      const match = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (match) {
        push("number", match[0]);
        i += match[0].length;
        continue;
      }
    }
    if (/[A-Za-z_$]/.test(text[i])) {
      let j = i + 1;
      while (j < text.length && /[\w$]/.test(text[j])) j += 1;
      const word = text.slice(i, j);
      const kind = KEYWORDS.has(word) ? "keyword" : word === "sn" || word === "console" ? "sn" : "plain";
      push(kind, word);
      i = j;
      continue;
    }
    if ("{}()[].,;:+-*/%<>=!&|?".includes(text[i])) {
      push("punct", text[i]);
      i += 1;
      continue;
    }
    push("plain", text[i]);
    i += 1;
  }
  return spans;
}

export type ScriptCompletion = {
  label: string;
  insert: string;
  detail: string;
};

export const SCRIPT_COMPLETIONS: ScriptCompletion[] = [
  { label: "sn.environment.get", insert: 'sn.environment.get("")', detail: "Read an environment variable" },
  { label: "sn.environment.set", insert: 'sn.environment.set("", "")', detail: "Save an environment variable" },
  { label: "sn.environment.unset", insert: 'sn.environment.unset("")', detail: "Remove an environment variable" },
  { label: "sn.environment.has", insert: 'sn.environment.has("")', detail: "Check an environment variable" },
  { label: "sn.collectionVariables.get", insert: 'sn.collectionVariables.get("")', detail: "Read a collection variable" },
  { label: "sn.collectionVariables.set", insert: 'sn.collectionVariables.set("", "")', detail: "Save a collection variable" },
  { label: "sn.collectionVariables.unset", insert: 'sn.collectionVariables.unset("")', detail: "Remove a collection variable" },
  { label: "sn.variables.get", insert: 'sn.variables.get("")', detail: "Read a variable, local first" },
  { label: "sn.variables.set", insert: 'sn.variables.set("", "")', detail: "Set a variable for this send" },
  { label: "sn.variables.replaceIn", insert: 'sn.variables.replaceIn("")', detail: "Replace {{names}} in a string" },
  { label: "sn.request.headers.add", insert: 'sn.request.headers.add({ key: "", value: "" })', detail: "Add a request header" },
  { label: "sn.request.headers.upsert", insert: 'sn.request.headers.upsert({ key: "", value: "" })', detail: "Set or replace a request header" },
  { label: "sn.request.headers.remove", insert: 'sn.request.headers.remove("")', detail: "Remove a request header" },
  { label: "sn.request.headers.get", insert: 'sn.request.headers.get("")', detail: "Read a request header" },
  { label: "sn.request.body.update", insert: 'sn.request.body.update("")', detail: "Replace the request body" },
  { label: "sn.response.json", insert: "sn.response.json()", detail: "Parse the response body as JSON" },
  { label: "sn.response.text", insert: "sn.response.text()", detail: "Read the response body as text" },
  { label: "sn.response.headers.get", insert: 'sn.response.headers.get("")', detail: "Read a response header" },
  { label: "sn.response.to.have.status", insert: "sn.response.to.have.status(200)", detail: "Assert the status code" },
  { label: "sn.response.to.be.ok", insert: "sn.response.to.be.ok", detail: "Assert a 2xx status" },
  { label: "sn.test", insert: 'sn.test("", function () {\n  \n})', detail: "Run a named test" },
  { label: "sn.expect", insert: "sn.expect()", detail: "Assert a value" },
  { label: "console.log", insert: "console.log()", detail: "Write to the script console" },
  { label: "console.warn", insert: "console.warn()", detail: "Write a warning to the script console" },
  { label: "console.error", insert: "console.error()", detail: "Write an error to the script console" },
];

export function scriptToken(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = /(?:sn|console)(?:\.[\w$]*)*$/.exec(before);
  if (!match || match[0].length < 2) return null;
  return { start: caret - match[0].length, query: match[0] };
}

export function matchingCompletions(query: string): ScriptCompletion[] {
  const needle = query.toLowerCase();
  return SCRIPT_COMPLETIONS.filter((item) => item.label.toLowerCase().startsWith(needle)).slice(0, 12);
}

export function applyCompletion(text: string, start: number, caret: number, insert: string): { text: string; caret: number } {
  const next = `${text.slice(0, start)}${insert}${text.slice(caret)}`;
  const quote = insert.indexOf('""');
  const paren = insert.indexOf("()");
  const offset = quote !== -1 ? quote + 1 : paren !== -1 ? paren + 1 : insert.length;
  return { text: next, caret: start + offset };
}
