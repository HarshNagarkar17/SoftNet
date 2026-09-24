import { addNode, patchNode, type Workspace } from "./collections";
import { emptyRequest, syncParamsFromUrl, withIds, type BodyKind, type KvRow, type RequestModel } from "./request";
import { normalizeVariables } from "./variables";

type Json = Record<string, unknown>;

export type ImportedNode =
  | { kind: "folder"; name: string; children: ImportedNode[] }
  | { kind: "request"; name: string; request: RequestModel };

export type PostmanImport =
  | { type: "collection"; name: string; variables: KvRow[]; items: ImportedNode[] }
  | { type: "environment"; name: string; values: KvRow[] }
  | { type: "error"; message: string };

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function authValue(list: unknown, key: string): string {
  if (!Array.isArray(list)) return "";
  const row = list.find((item) => isRecord(item) && item.key === key);
  return row && isRecord(row) ? text(row.value) : "";
}

function urlFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  if (typeof value.raw === "string" && value.raw) {
    if (value.raw.includes("?") || !Array.isArray(value.query)) return value.raw;
    const extra = Array.isArray(value.query)
      ? value.query
          .flatMap((item) => {
            if (!isRecord(item) || item.disabled || !text(item.key)) return [];
            return [`${encodeURIComponent(text(item.key))}=${encodeURIComponent(text(item.value))}`];
          })
          .join("&")
      : "";
    return extra ? `${value.raw}?${extra}` : value.raw;
  }
  const host = Array.isArray(value.host) ? value.host.map(text).join(".") : text(value.host);
  const path = Array.isArray(value.path) ? value.path.map(text).filter(Boolean).join("/") : "";
  const protocol = text(value.protocol);
  const query = Array.isArray(value.query)
    ? value.query
        .flatMap((item) => {
          if (!isRecord(item) || item.disabled || !text(item.key)) return [];
          return [`${encodeURIComponent(text(item.key))}=${encodeURIComponent(text(item.value))}`];
        })
        .join("&")
    : "";
  if (!host && !path) return "";
  return `${protocol ? `${protocol}://` : ""}${host}${path ? `/${path}` : ""}${query ? `?${query}` : ""}`;
}

function rowsFrom(value: unknown): KvRow[] {
  if (!Array.isArray(value)) return [];
  return withIds(
    value.flatMap((item) => {
      if (!isRecord(item) || item.disabled || item.type === "file" || !text(item.key)) return [];
      return [{ key: text(item.key), value: text(item.value) }];
    }),
  );
}

function requestFrom(item: Json): RequestModel {
  const source = isRecord(item.request) ? item.request : {};
  const request = emptyRequest();
  const method = text(source.method).toUpperCase();
  if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE" || method === "HEAD" || method === "OPTIONS") {
    request.method = method;
  }
  request.url = urlFrom(source.url);
  request.params = syncParamsFromUrl(request.url, []);
  request.headers = rowsFrom(source.header);

  const auth = isRecord(source.auth) ? source.auth : null;
  const authType = auth ? text(auth.type) : "";
  if (authType === "bearer") {
    request.auth = { ...request.auth, kind: "bearer", token: authValue(auth?.bearer, "token") };
  } else if (authType === "basic") {
    request.auth = {
      ...request.auth,
      kind: "basic",
      username: authValue(auth?.basic, "username"),
      password: authValue(auth?.basic, "password"),
    };
  } else if (authType === "apikey") {
    const where = authValue(auth?.apikey, "in");
    request.auth = {
      ...request.auth,
      kind: "apikey",
      keyName: authValue(auth?.apikey, "key"),
      keyValue: authValue(auth?.apikey, "value"),
      keyIn: where === "query" ? "query" : "header",
    };
  }
  if (request.auth.kind !== "none") {
    request.headers = request.headers.filter((header) => header.key.toLowerCase() !== "authorization");
  }

  const body = isRecord(source.body) ? source.body : null;
  const mode = body ? text(body.mode) : "";
  if (mode === "raw") {
    const language = isRecord(body?.options) && isRecord(body.options.raw) ? text(body.options.raw.language) : "";
    const raw = text(body?.raw);
    const kind: BodyKind = language === "json" || /^\s*[\[{]/.test(raw) ? "json" : "text";
    request.bodyKind = raw ? kind : "none";
    request.bodyText = raw;
  } else if (mode === "urlencoded" || mode === "formdata") {
    request.bodyKind = "form";
    request.formFields = rowsFrom(body?.[mode]).filter((row) => row.key !== "");
    if (request.formFields.length === 0) request.bodyKind = "none";
  }
  request.preRequest = toSn(scriptOf(item, "prerequest"));
  request.tests = toSn(scriptOf(item, "test"));
  return request;
}

function scriptOf(item: Json, listen: string): string {
  if (!Array.isArray(item.event)) return "";
  const event = item.event.find((entry) => isRecord(entry) && entry.listen === listen);
  if (!event || !isRecord(event)) return "";
  const script = isRecord(event.script) ? event.script : null;
  const exec = script?.exec;
  if (Array.isArray(exec)) return exec.map((line) => (typeof line === "string" ? line : "")).join("\n");
  return typeof exec === "string" ? exec : "";
}

function toSn(code: string): string {
  return code.replace(/\bpm\b/g, "sn");
}

function itemsFrom(value: unknown): ImportedNode[] {
  if (!Array.isArray(value)) return [];
  const out: ImportedNode[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const name = text(item.name) || "Untitled";
    if (Array.isArray(item.item)) out.push({ kind: "folder", name, children: itemsFrom(item.item) });
    else if (isRecord(item.request)) out.push({ kind: "request", name, request: requestFrom(item) });
  }
  return out;
}

function collectionBody(data: Json): Json | null {
  if (Array.isArray(data.item) && isRecord(data.info)) return data;
  if (isRecord(data.collection) && Array.isArray(data.collection.item)) return data.collection;
  return null;
}

function environmentBody(data: Json): Json | null {
  if (Array.isArray(data.values) && typeof data.name === "string") return data;
  if (isRecord(data.environment) && Array.isArray(data.environment.values)) return data.environment;
  return null;
}

export function parsePostman(data: unknown): PostmanImport {
  if (!isRecord(data)) return { type: "error", message: "That file is not a Postman collection or environment." };
  const collection = collectionBody(data);
  if (collection) {
    const info = isRecord(collection.info) ? collection.info : {};
    return {
      type: "collection",
      name: text(info.name) || "Imported collection",
      variables: normalizeVariables(collection.variable),
      items: itemsFrom(collection.item),
    };
  }
  const environment = environmentBody(data);
  if (environment) {
    return { type: "environment", name: text(environment.name) || "Imported environment", values: normalizeVariables(environment.values) };
  }
  return { type: "error", message: "That file is not a Postman collection or environment." };
}

export function addImportedCollection(ws: Workspace, imported: Extract<PostmanImport, { type: "collection" }>): Workspace {
  const root = addNode(ws, null, "collection", imported.name);
  let next = patchNode(root.ws, root.id, { variables: imported.variables });
  const addAll = (parent: string, items: ImportedNode[]) => {
    for (const item of items) {
      if (item.kind === "folder") {
        const added = addNode(next, parent, "folder", item.name);
        next = added.ws;
        addAll(added.id, item.children);
      } else {
        next = addNode(next, parent, "request", item.name, item.request).ws;
      }
    }
  };
  addAll(root.id, imported.items);
  return next;
}
