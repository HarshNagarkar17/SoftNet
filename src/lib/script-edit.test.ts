import { describe, expect, it } from "vitest";
import { applyCompletion, highlightScript, matchingCompletions, scriptToken } from "./script-edit";

describe("script highlighting", () => {
  it("colors strings, keywords, and sn calls", () => {
    const spans = highlightScript('const token = sn.environment.get("token"); // saved');
    expect(spans.map((span) => span.kind)).toContain("keyword");
    expect(spans.map((span) => span.kind)).toContain("string");
    expect(spans.map((span) => span.kind)).toContain("sn");
    expect(spans.map((span) => span.kind)).toContain("comment");
  });
});

describe("script suggestions", () => {
  it("opens on an sn member and inserts the call", () => {
    const token = scriptToken('sn.env', 6);
    expect(token).toEqual({ start: 0, query: "sn.env" });
    expect(matchingCompletions("sn.env").map((item) => item.label)).toEqual([
      "sn.environment.get",
      "sn.environment.set",
      "sn.environment.unset",
      "sn.environment.has",
    ]);
    const applied = applyCompletion('sn.env', 0, 6, 'sn.environment.get("")');
    expect(applied.text).toBe('sn.environment.get("")');
    expect(applied.text[applied.caret]).toBe('"');
  });
});
