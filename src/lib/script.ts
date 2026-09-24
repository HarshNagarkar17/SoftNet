import { METHODS, newId, syncParamsFromUrl, type BodyKind, type HttpMethod, type KvRow, type RequestModel } from "./request";

export type ScriptLog = { level: "log" | "info" | "warn" | "error"; text: string; source: "Pre-request" | "Tests" };
export type ScriptAssertion = { name: string; passed: boolean; message: string | null };

export type ScriptReport = {
  logs: ScriptLog[];
  tests: ScriptAssertion[];
  testError: string | null;
};

export type ScriptResponse = {
  status: number;
  statusText: string;
  headers: { key: string; value: string }[];
  body: string;
  timeMs: number;
};

type HeaderRow = { key: string; value: string };

export type ScriptRun = {
  error: string | null;
  logs: ScriptLog[];
  tests: ScriptAssertion[];
  request: RequestModel;
  environment: Map<string, string>;
  collection: Map<string, string>;
  locals: Map<string, string>;
};

const METHODS_SET = new Set<string>(METHODS);

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "undefined";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return value.name ? `[function ${value.name}]` : "[function]";
  try {
    return JSON.stringify(value) ?? "null";
  } catch {
    return String(value);
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function failure(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return formatValue(error);
}

function expect(actual: unknown) {
  let negate = false;
  const check = (ok: boolean, message: string) => {
    if (negate ? ok : !ok) throw new Error(message);
  };
  const chain = {
    to: {
      equal(expected: unknown) {
        check(Object.is(actual, expected), `expected ${formatValue(expected)}, got ${formatValue(actual)}`);
      },
      eql(expected: unknown) {
        check(sameValue(actual, expected), `expected ${formatValue(expected)}, got ${formatValue(actual)}`);
      },
      include(part: unknown) {
        let ok = false;
        if (typeof actual === "string" && typeof part === "string") ok = actual.includes(part);
        else if (Array.isArray(actual)) ok = actual.some((item) => sameValue(item, part));
        else if (actual && typeof actual === "object" && part && typeof part === "object") {
          ok = Object.entries(part as Record<string, unknown>).every(([key, value]) =>
            sameValue((actual as Record<string, unknown>)[key], value),
          );
        }
        check(ok, `expected ${formatValue(actual)} to include ${formatValue(part)}`);
      },
      be: {
        get ok() {
          check(Boolean(actual), `expected ${formatValue(actual)} to be ok`);
          return true;
        },
        get true() {
          check(actual === true, `expected true, got ${formatValue(actual)}`);
          return true;
        },
        get false() {
          check(actual === false, `expected false, got ${formatValue(actual)}`);
          return true;
        },
        a(type: string) {
          const kind = type.toLowerCase();
          const actualKind = Array.isArray(actual) ? "array" : actual === null ? "null" : typeof actual;
          check(actualKind === kind, `expected a ${type}, got ${actualKind}`);
        },
        above(value: number) {
          check(typeof actual === "number" && actual > value, `expected ${formatValue(actual)} to be above ${value}`);
        },
        below(value: number) {
          check(typeof actual === "number" && actual < value, `expected ${formatValue(actual)} to be below ${value}`);
        },
      },
      have: {
        property(name: string) {
          const ok = actual !== null && typeof actual === "object" && Object.prototype.hasOwnProperty.call(actual, name);
          check(ok, `expected ${formatValue(actual)} to have property ${name}`);
        },
      },
    },
    get not() {
      negate = !negate;
      return chain;
    },
  };
  return chain;
}

function headerGet(headers: HeaderRow[], name: string): string | undefined {
  const target = name.toLowerCase();
  return headers.find((header) => header.key.toLowerCase() === target)?.value;
}

function requestApi(request: RequestModel) {
  const headers = {
    get: (name: string) => headerGet(request.headers.filter((row) => row.enabled), name),
    add(entry: { key?: string; value?: string }) {
      const key = String(entry?.key ?? "").trim();
      if (!key) throw new Error("sn.request.headers.add needs a key.");
      request.headers = [...request.headers, { id: cryptoId(), key, value: String(entry?.value ?? ""), enabled: true }];
    },
    upsert(entry: { key?: string; value?: string }) {
      const key = String(entry?.key ?? "").trim();
      if (!key) throw new Error("sn.request.headers.upsert needs a key.");
      const value = String(entry?.value ?? "");
      const index = request.headers.findIndex((row) => row.enabled && row.key.toLowerCase() === key.toLowerCase());
      if (index === -1) {
        request.headers = [...request.headers, { id: cryptoId(), key, value, enabled: true }];
        return;
      }
      const next = request.headers.slice();
      next[index] = { ...next[index], value };
      request.headers = next;
    },
    remove(name: string) {
      const target = String(name).toLowerCase();
      request.headers = request.headers.filter((row) => !(row.enabled && row.key.toLowerCase() === target));
    },
  };

  return {
    get method() {
      return request.method;
    },
    set method(value: string) {
      const method = String(value).toUpperCase();
      if (!METHODS_SET.has(method)) throw new Error(`${method} is not an HTTP method SoftNet can send.`);
      request.method = method as HttpMethod;
    },
    get url() {
      return request.url;
    },
    set url(value: string) {
      request.url = String(value);
      request.params = syncParamsFromUrl(request.url, request.params);
    },
    headers,
    body: {
      get raw() {
        return request.bodyKind === "none" ? "" : request.bodyText;
      },
      set raw(value: string) {
        setRawBody(request, String(value));
      },
      update(value: string) {
        setRawBody(request, String(value));
      },
    },
  };
}

function setRawBody(request: RequestModel, value: string) {
  request.bodyText = value;
  if (!value) {
    request.bodyKind = "none";
    return;
  }
  const kind: BodyKind = /^\s*[\[{]/.test(value) ? "json" : "text";
  request.bodyKind = kind;
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}`;
}

function responseApi(response: ScriptResponse) {
  return {
    code: response.status,
    status: response.statusText,
    responseTime: response.timeMs,
    text: () => response.body,
    json: () => JSON.parse(response.body) as unknown,
    headers: {
      get: (name: string) => headerGet(response.headers, name),
    },
    to: {
      have: {
        status(code: number) {
          if (response.status !== code) {
            throw new Error(`expected status ${code}, got ${response.status}`);
          }
        },
        header(name: string) {
          if (headerGet(response.headers, name) === undefined) {
            throw new Error(`expected header ${name}`);
          }
        },
        body(text?: string) {
          if (text === undefined) {
            if (!response.body) throw new Error("expected a response body");
            return;
          }
          if (response.body !== text) throw new Error(`expected body ${formatValue(text)}`);
        },
      },
      be: {
        get ok() {
          if (response.status < 200 || response.status >= 300) {
            throw new Error(`expected a 2xx status, got ${response.status}`);
          }
          return true;
        },
      },
    },
  };
}

function lookup(locals: Map<string, string>, environment: Map<string, string>, collection: Map<string, string>, key: string): string | undefined {
  if (locals.has(key)) return locals.get(key);
  if (environment.has(key)) return environment.get(key);
  if (collection.has(key)) return collection.get(key);
  return undefined;
}

export function runScript(input: {
  code: string;
  phase: "prerequest" | "test";
  request: RequestModel;
  environment: Map<string, string>;
  collection: Map<string, string>;
  locals: Map<string, string>;
  hasEnvironment: boolean;
  hasCollection: boolean;
  response?: ScriptResponse;
}): ScriptRun {
  const request = structuredClone(input.request);
  const environment = new Map(input.environment);
  const collection = new Map(input.collection);
  const locals = new Map(input.locals);
  const source = input.phase === "prerequest" ? "Pre-request" : "Tests";
  const logs: ScriptLog[] = [];
  const tests: ScriptAssertion[] = [];

  const store = (map: Map<string, string>, allowed: boolean, label: string) => ({
    get: (key: string) => map.get(String(key)),
    set(key: string, value: unknown) {
      if (!allowed) {
        throw new Error(
          label === "environment"
            ? "Select an environment before setting an environment variable."
            : "Save this request in a collection before setting a collection variable.",
        );
      }
      map.set(String(key), value === undefined || value === null ? "" : typeof value === "string" ? value : formatValue(value));
    },
    unset(key: string) {
      if (!allowed) {
        throw new Error(
          label === "environment"
            ? "Select an environment before changing an environment variable."
            : "Save this request in a collection before changing a collection variable.",
        );
      }
      map.delete(String(key));
    },
    has: (key: string) => map.has(String(key)),
  });

  const sn = {
    environment: store(environment, input.hasEnvironment, "environment"),
    collectionVariables: store(collection, input.hasCollection, "collection"),
    variables: {
      get: (key: string) => lookup(locals, environment, collection, String(key)),
      set(key: string, value: unknown) {
        locals.set(String(key), value === undefined || value === null ? "" : typeof value === "string" ? value : formatValue(value));
      },
      unset(key: string) {
        locals.delete(String(key));
      },
      has: (key: string) => lookup(locals, environment, collection, String(key)) !== undefined,
      replaceIn(text: string) {
        return String(text).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (whole, name: string) => {
          const value = lookup(locals, environment, collection, name.trim());
          return value === undefined ? whole : value;
        });
      },
    },
    request: requestApi(request),
    response: input.phase === "test" && input.response ? responseApi(input.response) : undefined,
    test(name: string, fn: () => void) {
      try {
        fn();
        tests.push({ name: String(name), passed: true, message: null });
      } catch (error) {
        tests.push({ name: String(name), passed: false, message: failure(error) });
      }
    },
    expect,
  };

  if (input.phase === "prerequest") {
    Object.defineProperty(sn, "response", {
      get() {
        throw new Error("sn.response is only available in the test script.");
      },
    });
  }

  const consoleApi = {
    log: (...args: unknown[]) => logs.push({ level: "log", source, text: args.map(formatValue).join(" ") }),
    info: (...args: unknown[]) => logs.push({ level: "info", source, text: args.map(formatValue).join(" ") }),
    warn: (...args: unknown[]) => logs.push({ level: "warn", source, text: args.map(formatValue).join(" ") }),
    error: (...args: unknown[]) => logs.push({ level: "error", source, text: args.map(formatValue).join(" ") }),
  };

  if (!input.code.trim()) {
    return { error: null, logs, tests, request, environment, collection, locals };
  }

  let error: string | null = null;
  try {
    const fn = new Function(
      "sn",
      "console",
      "window",
      "document",
      "localStorage",
      "sessionStorage",
      "fetch",
      "XMLHttpRequest",
      "require",
      "process",
      "global",
      "globalThis",
      `"use strict";\n${input.code}`,
    );
    fn(sn, consoleApi, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined);
  } catch (caught) {
    error = failure(caught);
  }

  return { error, logs, tests, request, environment, collection, locals };
}

export function variableMap(rows: { key: string; value: string; enabled: boolean }[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    if (row.enabled && row.key.trim()) map.set(row.key.trim(), row.value);
  }
  return map;
}

export function mergedVariables(
  collection: Map<string, string>,
  environment: Map<string, string>,
  locals: Map<string, string>,
): Map<string, string> {
  const values = new Map<string, string>();
  for (const [key, value] of collection) values.set(key, value);
  for (const [key, value] of environment) values.set(key, value);
  for (const [key, value] of locals) values.set(key, value);
  return values;
}

export function sameVariableMap(left: Map<string, string>, right: Map<string, string>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

export function applyVariableMap(rows: KvRow[], next: Map<string, string>): KvRow[] {
  const seen = new Set<string>();
  const kept: KvRow[] = [];
  for (const row of rows) {
    const key = row.key.trim();
    if (!row.enabled || !key) {
      kept.push(row);
      continue;
    }
    if (!next.has(key) || seen.has(key)) continue;
    seen.add(key);
    kept.push(row.value === next.get(key) ? row : { ...row, value: next.get(key)! });
  }
  for (const [key, value] of next) {
    if (seen.has(key)) continue;
    const disabled = kept.findIndex((row) => !row.enabled && row.key.trim() === key);
    if (disabled !== -1) {
      kept[disabled] = { ...kept[disabled], value, enabled: true };
      continue;
    }
    kept.push({ id: newId(), key, value, enabled: true });
  }
  return kept;
}
