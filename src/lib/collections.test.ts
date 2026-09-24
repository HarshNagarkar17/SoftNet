import { describe, expect, it } from "vitest";
import {
  addNode,
  ancestors,
  canMove,
  duplicateNode,
  emptyWorkspace,
  moveNode,
  parseWorkspace,
  removeNode,
  visibleRows,
} from "./collections";
import { emptyRequest } from "./request";
import { repair } from "./storage";

function sample() {
  let ws = emptyWorkspace();
  const col = addNode(ws, null, "collection", "Shop");
  ws = col.ws;
  const folder = addNode(ws, col.id, "folder", "Users");
  ws = folder.ws;
  const req = addNode(ws, folder.id, "request", "List users", { ...emptyRequest(), url: "https://api.test/users" });
  ws = req.ws;
  const other = addNode(ws, col.id, "request", "Health", emptyRequest());
  ws = other.ws;
  return { ws, col: col.id, folder: folder.id, req: req.id, other: other.id };
}

describe("collections", () => {
  it("builds a nested tree and lists visible rows", () => {
    const { ws } = sample();
    expect(visibleRows(ws, "").map((row) => [row.node.name, row.depth])).toEqual([
      ["Shop", 0],
      ["Users", 1],
      ["List users", 2],
      ["Health", 1],
    ]);
  });

  it("filters by name or url and keeps ancestors", () => {
    const { ws } = sample();
    expect(visibleRows(ws, "api.test").map((row) => row.node.name)).toEqual(["Shop", "Users", "List users"]);
  });

  it("removes a folder with everything inside it", () => {
    const { ws, folder, req, col } = sample();
    const result = removeNode(ws, folder);
    expect(result.removed.sort()).toEqual([folder, req].sort());
    expect(result.ws.nodes[req]).toBeUndefined();
    expect(result.ws.nodes[col].children).not.toContain(folder);
  });

  it("moves requests between folders and blocks invalid moves", () => {
    const { ws, col, folder, req, other } = sample();
    const moved = moveNode(ws, other, folder, "inside");
    expect(moved.nodes[folder].children).toEqual([req, other]);
    expect(moved.nodes[other].parent).toBe(folder);
    expect(canMove(ws, folder, req, "before")).toBe(false);
    expect(canMove(ws, col, folder, "inside")).toBe(false);
    expect(canMove(ws, req, col, "before")).toBe(false);
  });

  it("reorders before a sibling", () => {
    const { ws, col, folder, other } = sample();
    const moved = moveNode(ws, other, folder, "before");
    expect(moved.nodes[col].children).toEqual([other, folder]);
  });

  it("duplicates a folder deeply with new ids", () => {
    const { ws, col, folder } = sample();
    const { ws: next, id } = duplicateNode(ws, folder);
    expect(next.nodes[col].children.indexOf(id)).toBe(1);
    expect(next.nodes[id].name).toBe("Users copy");
    const child = next.nodes[next.nodes[id].children[0]];
    expect(child.name).toBe("List users");
    expect(child.parent).toBe(id);
    expect(child.request).not.toBe(ws.nodes[ws.nodes[folder].children[0]].request);
  });

  it("returns the path to a node", () => {
    const { ws, req } = sample();
    expect(ancestors(ws, req).map((node) => node.name)).toEqual(["Shop", "Users", "List users"]);
  });

  it("round-trips through JSON and survives bad data", () => {
    const { ws } = sample();
    expect(parseWorkspace(JSON.stringify(ws), repair)).toEqual(ws);
    expect(parseWorkspace("{not json", repair)).toEqual(emptyWorkspace());
    expect(parseWorkspace(null, repair)).toEqual(emptyWorkspace());
  });
});
