import { describe, expect, it } from "vitest";
import { editForKey } from "./editor";

describe("json editor pairs", () => {
  it("closes quotes and brackets and leaves the caret inside", () => {
    expect(editForKey("", 0, 0, '"')).toEqual({ value: '""', start: 1, end: 1 });
    expect(editForKey("", 0, 0, "{")).toEqual({ value: "{}", start: 1, end: 1 });
    expect(editForKey("[]", 1, 1, '"')).toEqual({ value: '[""]', start: 2, end: 2 });
  });

  it("wraps a selection in quotes", () => {
    expect(editForKey("name", 0, 4, '"')).toEqual({ value: '"name"', start: 1, end: 5 });
  });

  it("steps over a closing quote instead of inserting another", () => {
    expect(editForKey('""', 1, 1, '"')).toEqual({ value: '""', start: 2, end: 2 });
  });

  it("deletes an empty pair with backspace", () => {
    expect(editForKey("{}", 1, 1, "Backspace")).toEqual({ value: "", start: 0, end: 0 });
    expect(editForKey('""', 1, 1, "Backspace")).toEqual({ value: "", start: 0, end: 0 });
  });

  it("splits a brace pair onto indented lines", () => {
    expect(editForKey("{}", 1, 1, "Enter")).toEqual({ value: "{\n  \n}", start: 4, end: 4 });
  });
});
