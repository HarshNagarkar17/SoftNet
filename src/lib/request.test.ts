import { describe, expect, it } from "vitest";
import {
  applyParams,
  blankRow,
  buildOutgoing,
  emptyRequest,
  formatBytes,
  normalizeUrl,
  requestTitle,
  syncParamsFromUrl,
  validateUrl,
} from "./request";

describe("url and query sync", () => {
  it("keeps the hash and drops disabled or blank params", () => {
    const url = applyParams("https://api.example.com/users?old=1#top", [
      { key: "q", value: "ada", enabled: true },
      { key: "skip", value: "1", enabled: false },
      blankRow(),
    ]);
    expect(url).toBe("https://api.example.com/users?q=ada#top");
  });

  it("reads the query back into rows, reuses ids, and keeps disabled rows", () => {
    const previous = [
      { id: "keep", key: "q", value: "old", enabled: true },
      { id: "off", key: "debug", value: "1", enabled: false },
    ];
    const rows = syncParamsFromUrl("https://api.example.com/search?q=rust&page=2", previous);
    expect(rows).toEqual([
      { id: "keep", key: "q", value: "rust", enabled: true },
      expect.objectContaining({ key: "page", value: "2", enabled: true }),
      { id: "off", key: "debug", value: "1", enabled: false },
    ]);
  });

  it("has no rows when the url has no query", () => {
    expect(syncParamsFromUrl("https://api.example.com/users", [])).toEqual([]);
  });
});

describe("normalizeUrl", () => {
  it("adds a scheme the way people expect", () => {
    expect(normalizeUrl("api.example.com/users")).toBe("https://api.example.com/users");
    expect(normalizeUrl("localhost:3000/health")).toBe("http://localhost:3000/health");
    expect(normalizeUrl("http://x.dev")).toBe("http://x.dev");
  });
});

describe("buildOutgoing", () => {
  it("adds a json content type only when the user did not set one", () => {
    const request = emptyRequest();
    request.method = "POST";
    request.url = "https://api.example.com/users";
    request.bodyKind = "json";
    request.bodyText = '{"name":"Ada"}';
    request.headers = [
      { id: "1", key: "Accept", value: "application/json", enabled: true },
      { id: "2", key: "X-Skip", value: "no", enabled: false },
    ];

    const outgoing = buildOutgoing(request);
    expect(outgoing.body).toBe('{"name":"Ada"}');
    expect(outgoing.headers).toEqual([
      { key: "Accept", value: "application/json" },
      { key: "Content-Type", value: "application/json" },
    ]);
  });

  it("keeps a content type the user already set", () => {
    const request = emptyRequest();
    request.bodyKind = "json";
    request.bodyText = "{}";
    request.url = "https://api.example.com/users";
    request.headers = [
      { id: "1", key: "Content-Type", value: "application/vnd.api+json", enabled: true },
    ];
    expect(buildOutgoing(request).headers).toEqual([
      { key: "Content-Type", value: "application/vnd.api+json" },
    ]);
  });

  it("encodes form fields", () => {
    const request = emptyRequest();
    request.method = "POST";
    request.url = "https://api.example.com/users";
    request.bodyKind = "form";
    request.formFields = [
      { id: "1", key: "name", value: "Ada Lovelace", enabled: true },
      { id: "2", key: "skip", value: "1", enabled: false },
    ];
    const outgoing = buildOutgoing(request);
    expect(outgoing.body).toBe("name=Ada%20Lovelace");
    expect(outgoing.headers).toEqual([
      { key: "Content-Type", value: "application/x-www-form-urlencoded" },
    ]);
  });

  it("applies bearer, basic, and api key auth", () => {
    const request = emptyRequest();
    request.url = "api.example.com/me";

    request.auth = { ...request.auth, kind: "bearer", token: "abc" };
    expect(buildOutgoing(request).headers).toEqual([
      { key: "Authorization", value: "Bearer abc" },
    ]);

    request.auth = { ...request.auth, kind: "basic", username: "ada", password: "secret" };
    expect(buildOutgoing(request).headers).toEqual([
      { key: "Authorization", value: "Basic YWRhOnNlY3JldA==" },
    ]);

    request.auth = { ...request.auth, kind: "apikey", keyName: "api_key", keyValue: "k 1", keyIn: "query" };
    expect(buildOutgoing(request).url).toBe("https://api.example.com/me?api_key=k%201");
  });
});

describe("validateUrl", () => {
  it("asks for a url and allows a missing scheme", () => {
    expect(validateUrl("")).toBe("Enter a URL.");
    expect(validateUrl("ftp://example.com")).toMatch(/http:\/\//);
    expect(validateUrl("example.com")).toBeNull();
  });
});

describe("helpers", () => {
  it("formats sizes and titles", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2150)).toBe("2.1 KB");
    const request = emptyRequest();
    expect(requestTitle(request)).toBe("Untitled request");
    request.url = "https://api.example.com/v1/users?page=2";
    expect(requestTitle(request)).toBe("/v1/users");
  });
});
