export const METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export type HttpMethod = (typeof METHODS)[number];
export type BodyKind = "none" | "json" | "text" | "form";
export type AuthKind = "none" | "inherit" | "bearer" | "basic" | "apikey";

export type KvRow = {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
};

export type Auth = {
  kind: AuthKind;
  token: string;
  username: string;
  password: string;
  keyName: string;
  keyValue: string;
  keyIn: "header" | "query";
};

export type RequestModel = {
  method: HttpMethod;
  url: string;
  params: KvRow[];
  headers: KvRow[];
  auth: Auth;
  bodyKind: BodyKind;
  bodyText: string;
  formFields: KvRow[];
  preRequest: string;
  tests: string;
};

export type OutgoingHeader = {
  key: string;
  value: string;
};

export type OutgoingRequest = {
  method: string;
  url: string;
  headers: OutgoingHeader[];
  body: string | null;
};

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}`;
}

export function blankRow(): KvRow {
  return { id: newId(), key: "", value: "", enabled: true };
}

export function withIds(rows: { key: string; value: string }[]): KvRow[] {
  return rows.map((row) => ({
    id: newId(),
    key: row.key,
    value: row.value,
    enabled: true,
  }));
}

export function emptyAuth(): Auth {
  return {
    kind: "none",
    token: "",
    username: "",
    password: "",
    keyName: "",
    keyValue: "",
    keyIn: "header",
  };
}

export function emptyRequest(): RequestModel {
  return {
    method: "GET",
    url: "",
    params: [],
    headers: [],
    auth: emptyAuth(),
    bodyKind: "none",
    bodyText: "",
    formFields: [],
    preRequest: "",
    tests: "",
  };
}

export function splitUrl(raw: string): { base: string; query: string; hash: string } {
  const hashIndex = raw.indexOf("#");
  const hash = hashIndex === -1 ? "" : raw.slice(hashIndex);
  const before = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  const queryIndex = before.indexOf("?");
  if (queryIndex === -1) {
    return { base: before, query: "", hash };
  }
  return {
    base: before.slice(0, queryIndex),
    query: before.slice(queryIndex + 1),
    hash,
  };
}

function decodePart(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

export function parseQueryRows(query: string): { key: string; value: string }[] {
  if (!query) return [];
  const rows: { key: string; value: string }[] = [];
  for (const part of query.split("&")) {
    if (part === "") continue;
    const eq = part.indexOf("=");
    if (eq === -1) {
      rows.push({ key: decodePart(part), value: "" });
    } else {
      rows.push({
        key: decodePart(part.slice(0, eq)),
        value: decodePart(part.slice(eq + 1)),
      });
    }
  }
  return rows;
}

function encodePairs(rows: { key: string; value: string; enabled: boolean }[]): string {
  const parts: string[] = [];
  for (const row of rows) {
    if (!row.enabled || row.key === "") continue;
    parts.push(`${encodeURIComponent(row.key)}=${encodeURIComponent(row.value)}`);
  }
  return parts.join("&");
}

export function applyParams(
  url: string,
  params: { key: string; value: string; enabled: boolean }[],
): string {
  const { base, hash } = splitUrl(url);
  const query = encodePairs(params);
  return query ? `${base}?${query}${hash}` : `${base}${hash}`;
}

export function syncParamsFromUrl(url: string, previous: KvRow[]): KvRow[] {
  const parsed = parseQueryRows(splitUrl(url).query);
  const enabled = previous.filter((row) => row.enabled);
  const disabled = previous.filter((row) => !row.enabled);
  const rows = parsed.map((row, index) => ({
    id: enabled[index]?.id ?? newId(),
    key: row.key,
    value: row.value,
    enabled: true,
  }));
  return [...rows, ...disabled];
}

export const encodeForm = encodePairs;

function hasHeader(headers: OutgoingHeader[], name: string): boolean {
  const target = name.toLowerCase();
  return headers.some((header) => header.key.toLowerCase() === target);
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(trimmed);
  return `${local ? "http" : "https"}://${trimmed}`;
}

export function basicToken(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildOutgoing(request: RequestModel): OutgoingRequest {
  let url = normalizeUrl(applyParams(request.url, request.params));
  const headers = request.headers
    .filter((header) => header.enabled && header.key.trim() !== "")
    .map((header) => ({ key: header.key.trim(), value: header.value }));

  const auth = request.auth;
  if (auth.kind === "bearer" && auth.token && !hasHeader(headers, "authorization")) {
    headers.push({ key: "Authorization", value: `Bearer ${auth.token}` });
  }
  if (auth.kind === "basic" && (auth.username || auth.password) && !hasHeader(headers, "authorization")) {
    headers.push({
      key: "Authorization",
      value: `Basic ${basicToken(auth.username, auth.password)}`,
    });
  }
  if (auth.kind === "apikey" && auth.keyName) {
    if (auth.keyIn === "header") {
      if (!hasHeader(headers, auth.keyName)) {
        headers.push({ key: auth.keyName, value: auth.keyValue });
      }
    } else {
      const { base, query, hash } = splitUrl(url);
      const pair = `${encodeURIComponent(auth.keyName)}=${encodeURIComponent(auth.keyValue)}`;
      url = `${base}?${query ? `${query}&` : ""}${pair}${hash}`;
    }
  }

  if (request.bodyKind === "none") {
    return { method: request.method, url, headers, body: null };
  }

  const body =
    request.bodyKind === "form" ? encodeForm(request.formFields) : request.bodyText;
  if (request.bodyKind === "json" && !hasHeader(headers, "content-type")) {
    headers.push({ key: "Content-Type", value: "application/json" });
  }
  if (request.bodyKind === "form" && !hasHeader(headers, "content-type")) {
    headers.push({
      key: "Content-Type",
      value: "application/x-www-form-urlencoded",
    });
  }

  return { method: request.method, url, headers, body };
}

export function validateUrl(url: string): string | null {
  const trimmed = normalizeUrl(url);
  if (!trimmed) return "Enter a URL.";
  if (!/^https?:\/\//i.test(trimmed)) {
    return "SoftNet can only send http:// and https:// URLs.";
  }
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return "That URL is not valid.";
  } catch {
    return "That URL is not valid.";
  }
  return null;
}

export function countActive(rows: KvRow[]): number {
  return rows.filter((row) => row.enabled && row.key.trim() !== "").length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const value = bytes / 1024;
    return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
}

export function requestTitle(request: RequestModel): string {
  const url = request.url.trim();
  if (!url) return "Untitled request";
  const { base } = splitUrl(url);
  const withoutScheme = base.replace(/^[a-z]+:\/\//i, "");
  const slash = withoutScheme.indexOf("/");
  const path = slash === -1 ? "" : withoutScheme.slice(slash);
  if (path && path !== "/") return path;
  return withoutScheme || "Untitled request";
}
