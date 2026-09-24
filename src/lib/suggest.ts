export type VariableScope = "Collection" | "Environment" | "Dynamic";

export type VariableChoice = {
  name: string;
  value: string;
  scope: VariableScope;
};

export const DYNAMIC_VARIABLES: VariableChoice[] = [
  { name: "$guid", value: "A v4 style guid", scope: "Dynamic" },
  { name: "$timestamp", value: "The current Unix timestamp, in seconds", scope: "Dynamic" },
  { name: "$isoTimestamp", value: "The current UTC time in ISO 8601", scope: "Dynamic" },
  { name: "$randomInt", value: "A random integer from 0 to 1000", scope: "Dynamic" },
  { name: "$randomBoolean", value: "A random true or false", scope: "Dynamic" },
  { name: "$randomEmail", value: "A random email address", scope: "Dynamic" },
  { name: "$randomAlphaNumeric", value: "A random alphanumeric string", scope: "Dynamic" },
];

const DYNAMIC_NAMES = new Set(DYNAMIC_VARIABLES.map((item) => item.name));

export function isDynamicName(name: string): boolean {
  return DYNAMIC_NAMES.has(name);
}

export function dynamicValue(name: string): string | null {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  if (name === "$guid") return crypto.randomUUID();
  if (name === "$timestamp") return String(Math.floor(Date.now() / 1000));
  if (name === "$isoTimestamp") return new Date().toISOString();
  if (name === "$randomInt") return String(Math.floor(Math.random() * 1001));
  if (name === "$randomBoolean") return Math.random() < 0.5 ? "true" : "false";
  if (name === "$randomEmail") return `user${Math.floor(Math.random() * 10000)}@example.com`;
  if (name === "$randomAlphaNumeric") {
    let out = "";
    for (let i = 0; i < 10; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }
  return null;
}

export function openVariable(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  let start = before.lastIndexOf("{");
  if (start === -1) return null;
  if (start > 0 && before[start - 1] === "{") start -= 1;
  const marker = before[start + 1] === "{" ? 2 : 1;
  const query = before.slice(start + marker);
  if (query.includes("}") || query.includes("\n") || query.includes("{")) return null;
  return { start, query };
}

export function applyVariable(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const next = `${text.slice(0, start)}{{${name}}}${text.slice(caret)}`;
  const cursor = start + name.length + 4;
  return { text: next, caret: cursor };
}

export function matchingVariables(choices: VariableChoice[], query: string): VariableChoice[] {
  const needle = query.trim().toLowerCase();
  const list = needle ? choices.filter((choice) => choice.name.toLowerCase().includes(needle)) : choices;
  if (!needle) {
    const own = list.filter((choice) => choice.scope !== "Dynamic");
    const dynamic = list.filter((choice) => choice.scope === "Dynamic");
    return [...own, ...dynamic].slice(0, 16);
  }
  return list.slice(0, 16);
}
