import { describe, expect, it } from "vitest";
import { emptyWorkspace } from "./collections";
import { addImportedCollection, parsePostman } from "./postman";
import { emptyRequest } from "./request";
import { applyVariables, missingVariables, scopeVariables } from "./variables";
import { applyParams, buildOutgoing } from "./request";

const collection = {
  info: { name: "Shop", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
  variable: [
    { key: "base", value: "https://api.example.com" },
    { key: "off", value: "no", disabled: true },
  ],
  item: [
    {
      name: "Users",
      item: [
        {
          name: "List",
          event: [
            { listen: "prerequest", script: { exec: ["pm.environment.set('page', '1');"] } },
            { listen: "test", script: { exec: ["pm.test('ok', function () { pm.response.to.have.status(200); });"] } },
          ],
          request: {
            method: "GET",
            header: [
              { key: "Accept", value: "application/json" },
              { key: "Authorization", value: "Bearer stale" },
            ],
            url: { raw: "{{base}}/users", query: [{ key: "page", value: "1" }] },
            auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] },
          },
        },
      ],
    },
  ],
};

describe("postman import", () => {
  it("imports a collection with folders, auth, and variables", () => {
    const imported = parsePostman(collection);
    expect(imported.type).toBe("collection");
    if (imported.type !== "collection") return;
    expect(imported.name).toBe("Shop");
    expect(imported.variables.map((row) => [row.key, row.enabled])).toEqual([
      ["base", true],
      ["off", false],
    ]);
    const ws = addImportedCollection(emptyWorkspace(), imported);
    const root = ws.nodes[ws.roots[0]];
    const folder = ws.nodes[root.children[0]];
    const request = ws.nodes[folder.children[0]].request!;
    expect(folder.name).toBe("Users");
    expect(request.method).toBe("GET");
    expect(request.url).toBe("{{base}}/users?page=1");
    expect(request.auth.kind).toBe("bearer");
    expect(request.auth.token).toBe("{{token}}");
    expect(request.headers.map((header) => header.key)).toEqual(["Accept"]);
    expect(request.preRequest).toBe("sn.environment.set('page', '1');");
    expect(request.tests).toContain("sn.test");
    expect(request.tests).not.toContain("pm.");
  });

  it("imports an environment file", () => {
    const imported = parsePostman({ name: "Dev", values: [{ key: "token", value: "abc", enabled: true }] });
    expect(imported).toMatchObject({ type: "environment", name: "Dev" });
  });

  it("rejects an unrelated json file", () => {
    expect(parsePostman({ hello: "world" }).type).toBe("error");
  });
});

describe("variables", () => {
  it("lets the environment override the collection", () => {
    const values = scopeVariables(
      [{ id: "1", key: "host", value: "collection.test", enabled: true }],
      [{ id: "2", key: "host", value: "env.test", enabled: true }, { id: "3", key: "token", value: "secret", enabled: false }],
    );
    const request = emptyRequest();
    request.url = "https://{{host}}/users";
    request.headers = [{ id: "h", key: "Authorization", value: "Bearer {{token}}", enabled: true }];
    const outgoing = buildOutgoing(applyVariables(request, values));
    expect(outgoing.url).toBe("https://env.test/users");
    expect(outgoing.headers[0].value).toBe("Bearer {{token}}");
    expect(missingVariables(applyParams(outgoing.url, []), values)).toEqual([]);
  });
});
