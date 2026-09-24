import { newId, type KvRow, type RequestModel } from "./request";
import { dynamicValue, isDynamicName } from "./suggest";

export type Environment = {
  id: string;
  name: string;
  values: KvRow[];
};

export type Environments = {
  activeId: string | null;
  items: Environment[];
};

const VAR = /\{\{\s*([^{}]+?)\s*\}\}/g;

export function emptyEnvironments(): Environments {
  return { activeId: null, items: [] };
}

export function normalizeVariables(value: unknown): KvRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Partial<KvRow> & { disabled?: boolean };
    return [
      {
        id: typeof item.id === "string" && item.id ? item.id : newId(),
        key: typeof item.key === "string" ? item.key : "",
        value: typeof item.value === "string" ? item.value : item.value == null ? "" : String(item.value),
        enabled: item.disabled === true ? false : item.enabled !== false,
      },
    ];
  });
}

export function parseEnvironments(raw: string | null): Environments {
  if (!raw) return emptyEnvironments();
  try {
    const data = JSON.parse(raw) as Partial<Environments>;
    const items = Array.isArray(data.items)
      ? data.items.flatMap((item) => {
          if (!item || typeof item !== "object" || typeof item.id !== "string") return [];
          return [{ id: item.id, name: typeof item.name === "string" && item.name ? item.name : "Environment", values: normalizeVariables(item.values) }];
        })
      : [];
    const activeId = items.some((item) => item.id === data.activeId) ? (data.activeId ?? null) : (items[0]?.id ?? null);
    return { activeId, items };
  } catch {
    return emptyEnvironments();
  }
}

export function variableMap(rows: KvRow[] | undefined): Map<string, string> {
  const values = new Map<string, string>();
  for (const row of rows ?? []) {
    if (row.enabled && row.key.trim()) values.set(row.key.trim(), row.value);
  }
  return values;
}

export function replaceVariableMap(rows: KvRow[], next: ReadonlyMap<string, string>): KvRow[] {
  const used = new Set<string>();
  const kept: KvRow[] = [];
  for (const row of rows) {
    const key = row.key.trim();
    if (!key || !row.enabled) {
      kept.push(row);
      continue;
    }
    if (!next.has(key) || used.has(key)) continue;
    used.add(key);
    kept.push(row.value === next.get(key) ? row : { ...row, value: next.get(key)! });
  }
  for (const [key, value] of next) {
    if (used.has(key)) continue;
    kept.push({ id: newId(), key, value, enabled: true });
  }
  return kept;
}

export function mergedValues(
  collection: ReadonlyMap<string, string>,
  environment: ReadonlyMap<string, string>,
  locals: ReadonlyMap<string, string>,
): Map<string, string> {
  const values = new Map<string, string>();
  for (const [key, value] of collection) values.set(key, value);
  for (const [key, value] of environment) values.set(key, value);
  for (const [key, value] of locals) values.set(key, value);
  return values;
}

export function scopeVariables(collection: KvRow[] | undefined, environment: KvRow[] | undefined): Map<string, string> {
  const values = new Map<string, string>();
  for (const row of collection ?? []) {
    if (row.enabled && row.key.trim()) values.set(row.key.trim(), row.value);
  }
  for (const row of environment ?? []) {
    if (row.enabled && row.key.trim()) values.set(row.key.trim(), row.value);
  }
  return values;
}

export function resolveText(text: string, values: ReadonlyMap<string, string>): string {
  return text.replace(VAR, (whole, name: string) => {
    const key = name.trim();
    if (values.has(key)) return values.get(key)!;
    return dynamicValue(key) ?? whole;
  });
}

export function missingVariables(text: string, values: ReadonlyMap<string, string>): string[] {
  const missing: string[] = [];
  for (const match of text.matchAll(VAR)) {
    const name = match[1].trim();
    if (!values.has(name) && !isDynamicName(name) && !missing.includes(name)) missing.push(name);
  }
  return missing;
}

export function applyVariables(request: RequestModel, values: ReadonlyMap<string, string>): RequestModel {
  const sub = (text: string) => resolveText(text, values);
  const rows = (list: KvRow[]) => list.map((row) => ({ ...row, key: sub(row.key), value: sub(row.value) }));
  return {
    ...request,
    url: sub(request.url),
    params: rows(request.params),
    headers: rows(request.headers),
    formFields: rows(request.formFields),
    bodyText: sub(request.bodyText),
    auth: {
      ...request.auth,
      token: sub(request.auth.token),
      username: sub(request.auth.username),
      password: sub(request.auth.password),
      keyName: sub(request.auth.keyName),
      keyValue: sub(request.auth.keyValue),
    },
  };
}
