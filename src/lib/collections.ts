import { emptyAuth, newId, type Auth, type KvRow, type RequestModel } from "./request";
import { normalizeVariables } from "./variables";

export type NodeKind = "collection" | "folder" | "request";

export type TreeNode = {
  id: string;
  kind: NodeKind;
  name: string;
  parent: string | null;
  children: string[];
  open?: boolean;
  request?: RequestModel;
  variables?: KvRow[];
  auth?: Auth;
  description?: string;
};

export type Workspace = {
  version: 1;
  roots: string[];
  nodes: Record<string, TreeNode>;
};

export type DropPosition = "before" | "after" | "inside";

export type TreeRow = { node: TreeNode; depth: number };

export function emptyWorkspace(): Workspace {
  return { version: 1, roots: [], nodes: {} };
}

export function isContainer(node: TreeNode): boolean {
  return node.kind !== "request";
}

function siblings(ws: Workspace, parent: string | null): string[] {
  return parent === null ? ws.roots : ws.nodes[parent].children;
}

function withSiblings(ws: Workspace, nodes: Record<string, TreeNode>, parent: string | null, list: string[]): Workspace {
  if (parent === null) return { ...ws, nodes, roots: list };
  return { ...ws, nodes: { ...nodes, [parent]: { ...nodes[parent], children: list } } };
}

export function addNode(
  ws: Workspace,
  parent: string | null,
  kind: NodeKind,
  name: string,
  request?: RequestModel,
): { ws: Workspace; id: string } {
  const id = newId();
  const node: TreeNode = { id, kind, name, parent, children: [], ...(kind === "request" ? { request } : { open: true }) };
  const nodes = { ...ws.nodes, [id]: node };
  if (parent !== null) nodes[parent] = { ...nodes[parent], open: true };
  return { ws: withSiblings(ws, nodes, parent, [...siblings(ws, parent), id]), id };
}

export function patchNode(
  ws: Workspace,
  id: string,
  patch: Partial<Pick<TreeNode, "name" | "open" | "request" | "variables" | "auth" | "description">>,
): Workspace {
  const node = ws.nodes[id];
  if (!node) return ws;
  return { ...ws, nodes: { ...ws.nodes, [id]: { ...node, ...patch } } };
}

export function descendants(ws: Workspace, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const current = stack.pop()!;
    out.push(current);
    const node = ws.nodes[current];
    if (node) stack.push(...node.children);
  }
  return out;
}

export function removeNode(ws: Workspace, id: string): { ws: Workspace; removed: string[] } {
  const node = ws.nodes[id];
  if (!node) return { ws, removed: [] };
  const removed = descendants(ws, id);
  const nodes = { ...ws.nodes };
  for (const gone of removed) delete nodes[gone];
  const list = siblings(ws, node.parent).filter((item) => item !== id);
  return { ws: withSiblings(ws, nodes, node.parent, list), removed };
}

export function duplicateNode(ws: Workspace, id: string): { ws: Workspace; id: string } {
  const source = ws.nodes[id];
  if (!source) return { ws, id };
  const nodes = { ...ws.nodes };
  const copy = (nodeId: string, parent: string | null, rename: boolean): string => {
    const original = ws.nodes[nodeId];
    const next = newId();
    nodes[next] = {
      ...original,
      id: next,
      parent,
      name: rename ? `${original.name} copy` : original.name,
      request: original.request ? structuredClone(original.request) : undefined,
      variables: original.variables ? structuredClone(original.variables) : undefined,
      auth: original.auth ? structuredClone(original.auth) : undefined,
      description: original.description,
      children: [],
    };
    nodes[next].children = original.children.map((child) => copy(child, next, false));
    return next;
  };
  const created = copy(id, source.parent, true);
  const list = [...siblings(ws, source.parent)];
  list.splice(list.indexOf(id) + 1, 0, created);
  return { ws: withSiblings(ws, nodes, source.parent, list), id: created };
}

export function canMove(ws: Workspace, id: string, target: string, position: DropPosition): boolean {
  const node = ws.nodes[id];
  const over = ws.nodes[target];
  if (!node || !over || id === target) return false;
  if (position === "inside" && !isContainer(over)) return false;
  const parent = position === "inside" ? target : over.parent;
  if (node.kind === "collection") return parent === null;
  if (parent === null) return false;
  return !descendants(ws, id).includes(parent);
}

export function moveNode(ws: Workspace, id: string, target: string, position: DropPosition): Workspace {
  if (!canMove(ws, id, target, position)) return ws;
  const node = ws.nodes[id];
  const over = ws.nodes[target];
  const parent = position === "inside" ? target : over.parent;

  let next = withSiblings(ws, ws.nodes, node.parent, siblings(ws, node.parent).filter((item) => item !== id));
  const list = [...siblings(next, parent)];
  const index = position === "inside" ? list.length : list.indexOf(target) + (position === "after" ? 1 : 0);
  list.splice(index, 0, id);
  next = withSiblings(next, { ...next.nodes, [id]: { ...node, parent } }, parent, list);
  if (position === "inside") next = patchNode(next, target, { open: true });
  return next;
}

export function ancestors(ws: Workspace, id: string): TreeNode[] {
  const out: TreeNode[] = [];
  let current: TreeNode | undefined = ws.nodes[id];
  while (current) {
    out.unshift(current);
    current = current.parent === null ? undefined : ws.nodes[current.parent];
  }
  return out;
}

export function revealNode(ws: Workspace, id: string): Workspace {
  let next = ws;
  for (const node of ancestors(ws, id).slice(0, -1)) {
    if (!node.open) next = patchNode(next, node.id, { open: true });
  }
  return next;
}

function matches(node: TreeNode, needle: string): boolean {
  if (node.name.toLowerCase().includes(needle)) return true;
  return node.request ? node.request.url.toLowerCase().includes(needle) : false;
}

export function visibleRows(ws: Workspace, filter: string): TreeRow[] {
  const needle = filter.trim().toLowerCase();
  const rows: TreeRow[] = [];
  if (!needle) {
    const walk = (ids: string[], depth: number) => {
      for (const id of ids) {
        const node = ws.nodes[id];
        if (!node) continue;
        rows.push({ node, depth });
        if (node.open) walk(node.children, depth + 1);
      }
    };
    walk(ws.roots, 0);
    return rows;
  }
  const keep = (id: string): boolean => {
    const node = ws.nodes[id];
    if (!node) return false;
    const childHit = node.children.map(keep).some(Boolean);
    return childHit || matches(node, needle);
  };
  const walk = (ids: string[], depth: number) => {
    for (const id of ids) {
      if (!keep(id)) continue;
      const node = ws.nodes[id];
      rows.push({ node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(ws.roots, 0);
  return rows;
}

export function destinations(ws: Workspace): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (ids: string[], depth: number) => {
    for (const id of ids) {
      const node = ws.nodes[id];
      if (!node || !isContainer(node)) continue;
      rows.push({ node, depth });
      walk(node.children, depth + 1);
    }
  };
  walk(ws.roots, 0);
  return rows;
}

const AUTH_KINDS = new Set<Auth["kind"]>(["none", "inherit", "bearer", "basic", "apikey"]);

export function readAuth(value: unknown): Auth | undefined {
  if (!value || typeof value !== "object") return undefined;
  const auth = { ...emptyAuth(), ...(value as Partial<Auth>) };
  if (!AUTH_KINDS.has(auth.kind)) auth.kind = "none";
  if (auth.keyIn !== "header" && auth.keyIn !== "query") auth.keyIn = "header";
  return auth;
}

export function effectiveAuth(ws: Workspace, savedId: string | null, auth: Auth): { auth: Auth; parentName: string | null } {
  if (auth.kind !== "inherit") return { auth, parentName: null };
  let parent = savedId ? (ws.nodes[savedId]?.parent ?? null) : null;
  let parentName: string | null = null;
  while (parent) {
    const node = ws.nodes[parent];
    if (!node) break;
    parentName = node.name;
    if (node.auth && node.auth.kind !== "none" && node.auth.kind !== "inherit") {
      return { auth: node.auth, parentName: node.name };
    }
    parent = node.parent;
  }
  return { auth: emptyAuth(), parentName };
}

export function parseWorkspace(raw: string | null, repair: (request: RequestModel) => RequestModel): Workspace {
  if (!raw) return emptyWorkspace();
  try {
    const data = JSON.parse(raw) as Workspace;
    if (!data || !Array.isArray(data.roots) || typeof data.nodes !== "object") return emptyWorkspace();
    const nodes: Record<string, TreeNode> = {};
    for (const [id, node] of Object.entries(data.nodes)) {
      const { variables, auth, description, ...rest } = node;
      const parsedAuth = readAuth(auth);
      nodes[id] = {
        ...rest,
        children: Array.isArray(node.children) ? node.children : [],
        request: node.request ? repair(node.request) : undefined,
        ...(Array.isArray(variables) ? { variables: normalizeVariables(variables) } : {}),
        ...(parsedAuth ? { auth: parsedAuth } : {}),
        ...(typeof description === "string" && description ? { description } : {}),
      };
    }
    return { version: 1, roots: data.roots.filter((id) => nodes[id]), nodes };
  } catch {
    return emptyWorkspace();
  }
}
