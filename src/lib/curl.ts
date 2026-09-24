import {
  type BodyKind,
  type HttpMethod,
  METHODS,
  type OutgoingRequest,
  type RequestModel,
  emptyAuth,
  parseQueryRows,
  splitUrl,
  withIds,
} from "./request";

export type ParsedCurl = {
  method: HttpMethod;
  url: string;
  headers: { key: string; value: string }[];
  params: { key: string; value: string }[];
  bodyKind: BodyKind;
  bodyText: string;
  formFields: { key: string; value: string }[];
};

const VALUE_SHORT = new Set(["X", "H", "d", "u", "o", "w", "m", "A", "e", "b", "F", "T", "x", "D", "K"]);

const IGNORED_LONG = new Set([
  "--silent",
  "--show-error",
  "--insecure",
  "--location",
  "--verbose",
  "--include",
  "--fail",
  "--globoff",
  "--progress-bar",
  "--no-progress-meter",
  "--http1.0",
  "--http1.1",
  "--http2",
  "--http2-prior-knowledge",
  "--path-as-is",
  "--fail-with-body",
  "--ipv4",
  "--ipv6",
  "--get",
]);

const IGNORED_VALUE_LONG = new Set([
  "--output",
  "--write-out",
  "--max-time",
  "--connect-timeout",
  "--retry",
  "--retry-delay",
  "--retry-max-time",
  "--dump-header",
  "--trace",
  "--trace-ascii",
  "--stderr",
]);

export function parseCurl(input: string): ParsedCurl {
  let raw = input.trim();
  if (raw.startsWith("$")) raw = raw.slice(1).trim();
  if (!raw) throw new Error("Paste a cURL command.");

  const tokens = tokenize(raw);
  if (tokens.length === 0) throw new Error("Paste a cURL command.");

  let index = 0;
  const command = tokens[0].toLowerCase();
  if (command === "curl" || command === "curl.exe") {
    index = 1;
  } else if (!tokens[0].startsWith("-")) {
    throw new Error("Paste a command that starts with curl.");
  }

  let explicitMethod: string | null = null;
  let url: string | null = null;
  const headers: { key: string; value: string }[] = [];
  const dataParts: string[] = [];
  let sawData = false;
  let dataIsJson = false;
  let forceGet = false;
  let compressed = false;

  const takeValue = (flag: string, inline: string | undefined): string => {
    if (inline !== undefined) return inline;
    index += 1;
    if (index >= tokens.length) {
      throw new Error(`${flag} is missing a value.`);
    }
    return tokens[index];
  };

  const pushData = (kind: "data" | "raw" | "urlencode" | "json", value: string) => {
    if (kind === "json") {
      if (sawData && !dataIsJson) {
        throw new Error("Use either --json or --data, not both.");
      }
      dataIsJson = true;
      sawData = true;
      dataParts.push(value);
      return;
    }
    if (dataIsJson) throw new Error("Use either --json or --data, not both.");
    if (kind !== "raw" && readsFromFile(value)) {
      throw new Error("Reading the body from a file is not supported yet.");
    }
    sawData = true;
    dataParts.push(kind === "urlencode" ? encodeUrlencodeData(value) : value);
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (!token.startsWith("-")) {
      if (url) throw new Error("The cURL command has more than one URL.");
      url = token;
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      const name = eq === -1 ? token : token.slice(0, eq);
      const inline = eq === -1 ? undefined : token.slice(eq + 1);
      switch (name) {
        case "--request":
          explicitMethod = takeValue(name, inline);
          break;
        case "--url":
          url = takeValue(name, inline);
          break;
        case "--header":
          addHeader(headers, takeValue(name, inline));
          break;
        case "--user":
          upsertHeader(headers, "Authorization", basicAuth(takeValue(name, inline)));
          break;
        case "--user-agent":
          upsertHeader(headers, "User-Agent", takeValue(name, inline));
          break;
        case "--referer":
          upsertHeader(headers, "Referer", takeValue(name, inline));
          break;
        case "--cookie":
          upsertHeader(headers, "Cookie", takeValue(name, inline));
          break;
        case "--json":
          pushData("json", takeValue(name, inline));
          break;
        case "--data":
        case "--data-ascii":
        case "--data-binary":
          pushData("data", takeValue(name, inline));
          break;
        case "--data-raw":
          pushData("raw", takeValue(name, inline));
          break;
        case "--data-urlencode":
          pushData("urlencode", takeValue(name, inline));
          break;
        case "--get":
          forceGet = true;
          break;
        case "--compressed":
          compressed = true;
          break;
        case "--form":
          throw new Error("File and multipart form uploads are not supported yet.");
        case "--upload-file":
          throw new Error("Reading the body from a file is not supported yet.");
        case "--proxy":
        case "--proxy-user":
          throw new Error("SoftNet does not support proxies yet.");
        case "--config":
          throw new Error("SoftNet cannot read curl config files.");
        default:
          if (IGNORED_LONG.has(name)) break;
          if (IGNORED_VALUE_LONG.has(name)) {
            takeValue(name, inline);
            break;
          }
          throw new Error(`SoftNet does not recognize ${name}.`);
      }
      index += 1;
      continue;
    }

    const flag = token.slice(1);
    if (flag.length === 1) {
      applyShort(flag, undefined);
      index += 1;
      continue;
    }
    if (VALUE_SHORT.has(flag[0])) {
      applyShort(flag[0], flag.slice(1));
      index += 1;
      continue;
    }

    for (const char of flag) {
      if (VALUE_SHORT.has(char)) {
        throw new Error(`Split -${char} out of the combined flags.`);
      }
      applyShort(char, undefined);
    }
    index += 1;
  }

  function applyShort(char: string, inline: string | undefined) {
    switch (char) {
      case "X":
        explicitMethod = takeValue(`-${char}`, inline);
        break;
      case "H":
        addHeader(headers, takeValue(`-${char}`, inline));
        break;
      case "d":
        pushData("data", takeValue(`-${char}`, inline));
        break;
      case "u":
        upsertHeader(headers, "Authorization", basicAuth(takeValue(`-${char}`, inline)));
        break;
      case "A":
        upsertHeader(headers, "User-Agent", takeValue(`-${char}`, inline));
        break;
      case "e":
        upsertHeader(headers, "Referer", takeValue(`-${char}`, inline));
        break;
      case "b":
        upsertHeader(headers, "Cookie", takeValue(`-${char}`, inline));
        break;
      case "G":
        forceGet = true;
        break;
      case "F":
        throw new Error("File and multipart form uploads are not supported yet.");
      case "T":
        throw new Error("Reading the body from a file is not supported yet.");
      case "x":
        throw new Error("SoftNet does not support proxies yet.");
      case "K":
        throw new Error("SoftNet cannot read curl config files.");
      case "o":
      case "w":
      case "m":
      case "D":
        takeValue(`-${char}`, inline);
        break;
      case "s":
      case "S":
      case "k":
      case "L":
      case "v":
      case "i":
      case "f":
      case "g":
      case "4":
      case "6":
      case "#":
        break;
      default:
        throw new Error(`SoftNet does not recognize -${char}.`);
    }
  }

  if (!url) throw new Error("The cURL command is missing a URL.");

  let body = dataParts.join("&");
  if (forceGet && sawData) {
    url = appendQuery(url, body);
    body = "";
    sawData = false;
    dataIsJson = false;
  }

  if (dataIsJson) {
    upsertHeader(headers, "Content-Type", "application/json");
    if (!headers.some((header) => header.key.toLowerCase() === "accept")) {
      headers.push({ key: "Accept", value: "application/json" });
    }
  } else if (sawData && !headers.some((header) => header.key.toLowerCase() === "content-type")) {
    headers.push({ key: "Content-Type", value: "application/x-www-form-urlencoded" });
  }
  if (compressed && !headers.some((header) => header.key.toLowerCase() === "accept-encoding")) {
    headers.push({ key: "Accept-Encoding", value: "deflate, gzip, br" });
  }

  const method = resolveMethod(explicitMethod, forceGet, sawData || dataIsJson);
  const params = parseQueryRows(splitUrl(url).query);
  const contentType =
    headers.find((header) => header.key.toLowerCase() === "content-type")?.value.toLowerCase() ??
    "";

  let bodyKind: BodyKind = "none";
  let bodyText = "";
  let formFields: { key: string; value: string }[] = [];
  if (sawData || dataIsJson) {
    if (contentType.includes("json") || dataIsJson) {
      bodyKind = "json";
      bodyText = body;
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const fields = tryFormFields(body);
      if (fields) {
        bodyKind = "form";
        formFields = fields;
      } else {
        bodyKind = "text";
        bodyText = body;
      }
    } else {
      bodyKind = "text";
      bodyText = body;
    }
  }

  return { method, url, headers, params, bodyKind, bodyText, formFields };
}

export function looksLikeCurl(text: string): boolean {
  return /^\s*\$?\s*curl(\.exe)?\s/i.test(text);
}

export function requestFromCurl(parsed: ParsedCurl): RequestModel {
  const auth = emptyAuth();
  const headers = parsed.headers.filter((header) => {
    if (header.key.toLowerCase() !== "authorization") return true;
    const bearer = /^Bearer\s+(.+)$/i.exec(header.value);
    if (bearer) {
      auth.kind = "bearer";
      auth.token = bearer[1];
      return false;
    }
    const basic = /^Basic\s+(.+)$/i.exec(header.value);
    if (basic) {
      const decoded = decodeBasic(basic[1]);
      if (decoded) {
        auth.kind = "basic";
        auth.username = decoded.username;
        auth.password = decoded.password;
        return false;
      }
    }
    return true;
  });

  return {
    method: parsed.method,
    url: parsed.url,
    params: withIds(parsed.params),
    headers: withIds(headers),
    auth,
    bodyKind: parsed.bodyKind,
    bodyText: parsed.bodyKind === "json" ? prettyBody(parsed.bodyText) : parsed.bodyText,
    formFields: withIds(parsed.formFields),
    preRequest: "",
    tests: "",
  };
}

function prettyBody(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function decodeBasic(token: string): { username: string; password: string } | null {
  try {
    const binary = atob(token.trim());
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    const colon = text.indexOf(":");
    if (colon === -1) return null;
    return { username: text.slice(0, colon), password: text.slice(colon + 1) };
  } catch {
    return null;
  }
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function toCurl(request: OutgoingRequest): string {
  const lines = [`curl${request.method === "GET" ? "" : ` -X ${request.method}`} ${shellQuote(request.url)}`];
  for (const header of request.headers) {
    lines.push(`-H ${shellQuote(`${header.key}: ${header.value}`)}`);
  }
  if (request.body !== null && request.body !== "") {
    lines.push(`--data-raw ${shellQuote(request.body)}`);
  }
  return lines.join(" \\\n  ");
}

function resolveMethod(explicit: string | null, forceGet: boolean, hasBody: boolean): HttpMethod {
  if (explicit) {
    const method = explicit.toUpperCase();
    if (!METHODS.includes(method as HttpMethod)) {
      throw new Error(`SoftNet does not support the ${explicit} method.`);
    }
    return method as HttpMethod;
  }
  if (forceGet || !hasBody) return "GET";
  return "POST";
}

function appendQuery(url: string, extra: string): string {
  if (!extra) return url;
  const { base, query, hash } = splitUrl(url);
  const next = query ? `${query}&${extra}` : extra;
  return `${base}?${next}${hash}`;
}

function readsFromFile(value: string): boolean {
  return value.startsWith("@");
}

function encodeUrlencodeData(value: string): string {
  if (readsFromFile(value)) {
    throw new Error("Reading the body from a file is not supported yet.");
  }
  const at = value.indexOf("@");
  const eq = value.indexOf("=");
  if (at !== -1 && (eq === -1 || at < eq)) {
    throw new Error("Reading the body from a file is not supported yet.");
  }
  if (eq === -1) return encodeURIComponent(value);
  if (eq === 0) return `=${encodeURIComponent(value.slice(1))}`;
  return `${value.slice(0, eq)}=${encodeURIComponent(value.slice(eq + 1))}`;
}

function addHeader(headers: { key: string; value: string }[], raw: string) {
  const parsed = parseHeader(raw);
  if (parsed) headers.push(parsed);
}

function upsertHeader(headers: { key: string; value: string }[], key: string, value: string) {
  const index = headers.findIndex((header) => header.key.toLowerCase() === key.toLowerCase());
  if (index === -1) headers.push({ key, value });
  else headers[index] = { key, value };
}

function parseHeader(raw: string): { key: string; value: string } | null {
  const separator = raw.indexOf(":");
  if (separator === -1) {
    if (raw.trim().endsWith(";")) return null;
    throw new Error(`Header "${raw}" needs a name and a value separated by a colon.`);
  }
  const key = raw.slice(0, separator).trim();
  if (!key) throw new Error("A header is missing its name.");
  return { key, value: raw.slice(separator + 1).trim() };
}

function tryFormFields(body: string): { key: string; value: string }[] | null {
  if (body === "") return [];
  const fields: { key: string; value: string }[] = [];
  for (const part of body.split("&")) {
    if (!part.includes("=")) return null;
    const eq = part.indexOf("=");
    fields.push({
      key: decodeForm(part.slice(0, eq)),
      value: decodeForm(part.slice(eq + 1)),
    });
  }
  return fields;
}

function decodeForm(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

function basicAuth(user: string): string {
  const value = user.includes(":") ? user : `${user}:`;
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let index = 0;
  let quote: "'" | '"' | null = null;
  const source = input.replace(/\r\n/g, "\n");

  while (index < source.length) {
    const char = source[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
      index += 1;
      continue;
    }
    if (quote === '"') {
      if (char === "\\") {
        const next = source[index + 1];
        if (next === undefined) throw new Error("The cURL command ends with a backslash.");
        if (next === "\n") {
          index += 2;
          continue;
        }
        if (next === '"' || next === "\\" || next === "$" || next === "`") {
          current += next;
          index += 2;
          continue;
        }
        current += `\\${next}`;
        index += 2;
        continue;
      }
      if (char === '"') quote = null;
      else current += char;
      index += 1;
      continue;
    }
    if (char === "\\") {
      const next = source[index + 1];
      if (next === undefined) throw new Error("The cURL command ends with a backslash.");
      if (next !== "\n") current += next;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      index += 1;
      continue;
    }
    if (char === " " || char === "\n" || char === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }

  if (quote) throw new Error("The cURL command has an unfinished quote.");
  if (current.length > 0) tokens.push(current);
  return tokens;
}
