import { describe, expect, it } from "vitest";
import { looksLikeCurl, parseCurl, requestFromCurl, toCurl } from "./curl";
import { buildOutgoing } from "./request";

describe("parseCurl", () => {
  it("reads a get request and its query", () => {
    const parsed = parseCurl("curl https://api.example.com/search?q=rust");
    expect(parsed.method).toBe("GET");
    expect(parsed.url).toBe("https://api.example.com/search?q=rust");
    expect(parsed.params).toEqual([{ key: "q", value: "rust" }]);
    expect(parsed.bodyKind).toBe("none");
  });

  it("reads a posted json command with line breaks", () => {
    const parsed = parseCurl(`curl -sS -X POST https://api.example.com/users \\
      -H "Content-Type: application/json" \\
      -H "Accept: application/json" \\
      -d '{"name":"Ada"}'`);
    expect(parsed.method).toBe("POST");
    expect(parsed.bodyKind).toBe("json");
    expect(parsed.bodyText).toBe('{"name":"Ada"}');
    expect(parsed.headers).toEqual([
      { key: "Content-Type", value: "application/json" },
      { key: "Accept", value: "application/json" },
    ]);
  });

  it("turns --json into a json post", () => {
    const parsed = parseCurl(`curl --json '{"a":1}' https://example.com/items`);
    expect(parsed.method).toBe("POST");
    expect(parsed.bodyKind).toBe("json");
    expect(parsed.bodyText).toBe('{"a":1}');
    expect(parsed.headers).toContainEqual({ key: "Content-Type", value: "application/json" });
    expect(parsed.headers).toContainEqual({ key: "Accept", value: "application/json" });
  });

  it("turns form data into fields", () => {
    const parsed = parseCurl("curl -d 'name=Ada&role=admin' https://example.com/users");
    expect(parsed.method).toBe("POST");
    expect(parsed.bodyKind).toBe("form");
    expect(parsed.formFields).toEqual([
      { key: "name", value: "Ada" },
      { key: "role", value: "admin" },
    ]);
  });

  it("moves -G data onto the query string", () => {
    const parsed = parseCurl("curl -G -d 'q=rust' https://example.com/search");
    expect(parsed.method).toBe("GET");
    expect(parsed.url).toBe("https://example.com/search?q=rust");
    expect(parsed.params).toEqual([{ key: "q", value: "rust" }]);
    expect(parsed.bodyKind).toBe("none");
  });

  it("turns -u into a basic authorization header", () => {
    const parsed = parseCurl("curl -u ada:secret https://example.com");
    expect(parsed.headers).toEqual([
      { key: "Authorization", value: "Basic YWRhOnNlY3JldA==" },
    ]);
  });

  it("encodes --data-urlencode values", () => {
    const parsed = parseCurl(
      "curl --data-urlencode 'note=a b' https://example.com/notes",
    );
    expect(parsed.bodyKind).toBe("form");
    expect(parsed.formFields).toEqual([{ key: "note", value: "a b" }]);
  });

  it("ignores flags that do not change the request", () => {
    const parsed = parseCurl("curl -sSL -k -v https://example.com/health");
    expect(parsed.method).toBe("GET");
    expect(parsed.url).toBe("https://example.com/health");
    expect(parsed.headers).toEqual([]);
  });

  it("refuses multipart uploads without changing a successful parse", () => {
    expect(() => parseCurl("curl -F file=@notes.txt https://example.com/upload")).toThrow(
      /multipart form uploads/,
    );
  });

  it("refuses file bodies", () => {
    expect(() => parseCurl("curl -d @body.json https://example.com")).toThrow(/from a file/);
  });

  it("reports an unfinished quote and a missing url", () => {
    expect(() => parseCurl("curl 'https://example.com")).toThrow(/unfinished quote/);
    expect(() => parseCurl("curl -X GET")).toThrow(/missing a URL/);
  });

  it("rejects methods this client cannot send", () => {
    expect(() => parseCurl("curl -X TRACE https://example.com")).toThrow(/TRACE/);
  });

  it("reads the Chrome copy-as-cURL shape", () => {
    const parsed = parseCurl(`curl 'https://api.example.com/graphql' \\
  -H 'accept: */*' \\
  -H 'content-type: application/json' \\
  --data-raw '{"query":"{ me { id } }"}' \\
  --compressed`);
    expect(parsed.method).toBe("POST");
    expect(parsed.bodyKind).toBe("json");
    expect(parsed.headers).toContainEqual({ key: "accept", value: "*/*" });
  });
});

describe("looksLikeCurl", () => {
  it("spots pasted curl commands", () => {
    expect(looksLikeCurl("curl https://x.dev")).toBe(true);
    expect(looksLikeCurl("  $ curl -X POST x")).toBe(true);
    expect(looksLikeCurl("https://curl.se")).toBe(false);
  });
});

describe("requestFromCurl", () => {
  it("moves bearer and basic credentials into auth", () => {
    const bearer = requestFromCurl(parseCurl("curl -H 'Authorization: Bearer t0k' https://x.dev"));
    expect(bearer.auth).toMatchObject({ kind: "bearer", token: "t0k" });
    expect(bearer.headers).toEqual([]);

    const basic = requestFromCurl(parseCurl("curl -u ada:secret https://x.dev"));
    expect(basic.auth).toMatchObject({ kind: "basic", username: "ada", password: "secret" });
  });

  it("pretty prints json bodies", () => {
    const request = requestFromCurl(parseCurl(`curl --json '{"a":1}' https://x.dev`));
    expect(request.bodyText).toBe('{\n  "a": 1\n}');
  });
});

describe("toCurl", () => {
  it("round-trips through the parser", () => {
    const original = parseCurl(
      `curl -X PUT 'https://x.dev/items?id=1' -H 'Content-Type: application/json' -d '{"it'"'"'s":true}'`,
    );
    const command = toCurl(buildOutgoing(requestFromCurl(original)));
    const again = parseCurl(command);
    expect(again.method).toBe("PUT");
    expect(again.url).toBe("https://x.dev/items?id=1");
    expect(JSON.parse(again.bodyText)).toEqual({ "it's": true });
  });
});
