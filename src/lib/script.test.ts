import { describe, expect, it } from "vitest";
import { emptyRequest } from "./request";
import { applyVariableMap, mergedVariables, runScript, variableMap } from "./script";

function run(code: string, phase: "prerequest" | "test" = "prerequest", response?: { status: number; body: string }) {
  const request = emptyRequest();
  request.url = "https://api.example.com/users";
  request.headers = [{ id: "h", key: "Accept", value: "application/json", enabled: true }];
  return runScript({
    code,
    phase,
    request,
    environment: variableMap([{ key: "token", value: "abc", enabled: true }]),
    collection: variableMap([{ key: "base", value: "https://api.example.com", enabled: true }]),
    locals: new Map(),
    hasEnvironment: true,
    hasCollection: true,
    response: response
      ? { status: response.status, statusText: "OK", headers: [{ key: "Content-Type", value: "application/json" }], body: response.body, timeMs: 12 }
      : undefined,
  });
}

describe("sn scripts", () => {
  it("sets a variable and changes the request before send", () => {
    const result = run(`
      sn.environment.set("token", "fresh");
      sn.request.headers.upsert({ key: "Authorization", value: "Bearer " + sn.environment.get("token") });
      sn.request.url = "https://api.example.com/users?page=2";
      console.log(sn.variables.replaceIn("{{base}}"));
    `);
    expect(result.error).toBeNull();
    expect(result.environment.get("token")).toBe("fresh");
    expect(result.request.headers.find((header) => header.key === "Authorization")?.value).toBe("Bearer fresh");
    expect(result.request.url).toBe("https://api.example.com/users?page=2");
    expect(result.request.params.map((row) => row.key)).toContain("page");
    expect(result.logs[0]).toMatchObject({ source: "Pre-request", text: "https://api.example.com" });
  });

  it("records passing and failing tests from the response", () => {
    const result = run(
      `
      sn.test("Status is 200", () => sn.response.to.have.status(200));
      sn.test("Has a name", () => {
        sn.expect(sn.response.json()).to.have.property("name");
      });
      sn.test("Wrong status", () => sn.response.to.have.status(201));
    `,
      "test",
      { status: 200, body: '{"name":"Ada"}' },
    );
    expect(result.error).toBeNull();
    expect(result.tests.map((test) => test.passed)).toEqual([true, true, false]);
    expect(result.tests[2].message).toMatch(/201/);
  });

  it("refuses environment writes when no environment is selected", () => {
    const request = emptyRequest();
    const result = runScript({
      code: `sn.environment.set("token", "x")`,
      phase: "prerequest",
      request,
      environment: new Map(),
      collection: new Map(),
      locals: new Map(),
      hasEnvironment: false,
      hasCollection: false,
    });
    expect(result.error).toMatch(/environment/i);
  });

  it("writes script variable changes back onto environment rows", () => {
    const rows = applyVariableMap(
      [
        { id: "1", key: "token", value: "old", enabled: true },
        { id: "2", key: "off", value: "no", enabled: false },
      ],
      mergedVariables(new Map(), new Map([["token", "fresh"], ["trace", "1"]]), new Map()),
    );
    expect(rows).toEqual([
      { id: "1", key: "token", value: "fresh", enabled: true },
      { id: "2", key: "off", value: "no", enabled: false },
      expect.objectContaining({ key: "trace", value: "1", enabled: true }),
    ]);
  });
});
