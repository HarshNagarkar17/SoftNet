import { describe, expect, it } from "vitest";
import { applyVariable, matchingVariables, openVariable } from "./suggest";

describe("variable suggestions", () => {
  it("opens after an unfinished {{", () => {
    expect(openVariable("https://api.test/{{tok", 22)).toEqual({ start: 17, query: "tok" });
    expect(openVariable("https://{ho", 11)).toEqual({ start: 8, query: "ho" });
    expect(openVariable("https://api.test/{{token}}", 26)).toBeNull();
    expect(openVariable("{token}", 7)).toBeNull();
  });

  it("inserts the chosen name and closes the braces", () => {
    expect(applyVariable("{{to", 0, 4, "token")).toEqual({ text: "{{token}}", caret: 9 });
  });

  it("keeps collection and environment entries that match", () => {
    const choices = [
      { name: "token", value: "a", scope: "Collection" as const },
      { name: "host", value: "b", scope: "Environment" as const },
    ];
    expect(matchingVariables(choices, "to").map((item) => item.scope)).toEqual(["Collection"]);
  });
});
