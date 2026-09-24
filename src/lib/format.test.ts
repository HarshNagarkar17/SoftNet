import { describe, expect, it } from "vitest";
import { detectFormat, formatJson, jsonErrorSpan, lineText } from "./format";

describe("formatJson", () => {
  it("pretty prints with folding ranges", () => {
    const lines = formatJson('{"a":1,"b":[true,null],"c":{}}')!;
    expect(lines.map((line) => "  ".repeat(line.depth) + lineText(line))).toEqual([
      "{",
      '  "a": 1,',
      '  "b": [',
      "    true,",
      "    null",
      "  ],",
      '  "c": {}',
      "}",
    ]);
    expect(lines[0]).toMatchObject({ end: 7, count: 3, bracket: "{" });
    expect(lines[2]).toMatchObject({ end: 5, count: 2, bracket: "[" });
  });

  it("keeps large integers exactly", () => {
    const lines = formatJson('{"id":12345678901234567890}')!;
    expect(lineText(lines[1])).toBe('"id": 12345678901234567890');
  });

  it("marks keys and strings differently", () => {
    const lines = formatJson('{"name":"Ada"}')!;
    expect(lines[1].tokens.map((token) => token.kind)).toEqual(["key", "punct", "string"]);
  });

  it("handles escaped quotes inside strings", () => {
    const lines = formatJson('{"q":"say \\"hi\\""}')!;
    expect(lineText(lines[1])).toBe('"q": "say \\"hi\\""');
  });

  it("returns null for invalid json", () => {
    expect(formatJson("{nope")).toBeNull();
    expect(formatJson("<html></html>")).toBeNull();
  });
});

describe("jsonErrorSpan", () => {
  it("underlines a key that has no value", () => {
    const text = '{\n  ""\n}';
    const mark = jsonErrorSpan(text);
    expect(mark && text.slice(mark.start, mark.end)).toBe('""');
  });

  it("stays quiet for valid json", () => {
    expect(jsonErrorSpan('{"a":1}')).toBeNull();
    expect(jsonErrorSpan("")).toBeNull();
  });
});

describe("detectFormat", () => {
  it("uses content type and body shape", () => {
    expect(detectFormat("{}", "")).toBe("json");
    expect(detectFormat("<!doctype html><p>", "")).toBe("html");
    expect(detectFormat("hi", "text/plain")).toBe("text");
  });
});
