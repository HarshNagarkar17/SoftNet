import {
  ChevronRight,
  Copy,
  ExternalLink,
  FilePlus2,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canMove, visibleRows, type DropPosition, type NodeKind, type TreeNode, type Workspace } from "../lib/collections";
import { Menu, type MenuItem } from "./Menu";
import { IconButton, cx, methodShort, methodText } from "./ui";

export type TreeActions = {
  open: (id: string, inNewTab?: boolean) => void;
  toggle: (id: string) => void;
  rename: (id: string, name: string) => void;
  add: (parent: string | null, kind: NodeKind) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  askRemove: (id: string) => void;
  move: (id: string, target: string, position: DropPosition) => void;
  openCollection: (id: string) => void;
};

type CollectionTreeProps = {
  workspace: Workspace;
  filter: string;
  activeId: string | null;
  renaming: string | null;
  onRenaming: (id: string | null) => void;
  actions: TreeActions;
};

type DropHint = { id: string; position: DropPosition } | null;

function NameInput({ value, onDone }: { value: string; onDone: (name: string | null) => void }) {
  const [draft, setDraft] = useState(value);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      aria-label="Name"
      value={draft}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(draft.trim() || null)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(draft.trim() || null);
        else if (event.key === "Escape") finish(null);
      }}
      onClick={(event) => event.stopPropagation()}
      className="h-5 min-w-0 flex-1 rounded border border-ring bg-panel px-1 text-[12.5px] text-fg outline-none focus-visible:outline-none"
    />
  );
}

type RowProps = {
  node: TreeNode;
  depth: number;
  active: boolean;
  renaming: boolean;
  forceOpen: boolean;
  hint: DropPosition | null;
  onRenaming: (id: string | null) => void;
  onMenu: (node: TreeNode, x: number, y: number) => void;
  onDragStart: (id: string) => void;
  onDragOver: (node: TreeNode, event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (node: TreeNode) => void;
  onDragEnd: () => void;
  actions: TreeActions;
};

const Row = memo(function Row({
  node,
  depth,
  active,
  renaming,
  forceOpen,
  hint,
  onRenaming,
  onMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  actions,
}: RowProps) {
  const container = node.kind !== "request";
  const open = forceOpen || node.open;
  const pendingClick = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pendingClick.current) window.clearTimeout(pendingClick.current);
    };
  }, []);

  function openRow() {
    if (node.kind === "collection") actions.openCollection(node.id);
    else if (node.kind === "folder") actions.toggle(node.id);
    else actions.open(node.id);
  }

  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={container ? !!open : undefined}
      aria-selected={active}
      draggable={!renaming}
      onDragStart={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button, input")) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", node.name);
        onDragStart(node.id);
      }}
      onDragOver={(event) => onDragOver(node, event)}
      onDrop={(event) => {
        event.preventDefault();
        onDrop(node);
      }}
      onDragEnd={onDragEnd}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(node, event.clientX, event.clientY);
      }}
      className={cx(
        "group relative flex h-[26px] items-center rounded-md",
        active ? "bg-accent-soft" : "hover:bg-hover",
        hint === "inside" && "bg-accent-soft ring-1 ring-accent ring-inset",
      )}
    >
      {hint === "before" || hint === "after" ? (
        <span
          aria-hidden="true"
          className={cx("pointer-events-none absolute right-1 h-0.5 rounded-full bg-accent", hint === "before" ? "-top-px" : "-bottom-px")}
          style={{ left: 8 + depth * 12 }}
        />
      ) : null}
      <div className="flex h-full min-w-0 flex-1 items-center" style={{ paddingLeft: 2 + depth * 12 }}>
        {container ? (
          <button
            type="button"
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={() => actions.toggle(node.id)}
            className="flex h-full w-4 shrink-0 cursor-pointer items-center justify-center rounded text-faint hover:text-fg"
          >
            <ChevronRight size={12} aria-hidden="true" className={cx("transition-transform duration-100", open && "rotate-90")} />
          </button>
        ) : (
          <span className="w-4 shrink-0" aria-hidden="true" />
        )}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (pendingClick.current) window.clearTimeout(pendingClick.current);
          pendingClick.current = window.setTimeout(() => {
            pendingClick.current = null;
            openRow();
          }, 220);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          if (pendingClick.current) window.clearTimeout(pendingClick.current);
          pendingClick.current = null;
          onRenaming(node.id);
        }}
        onKeyDown={(event) => {
          if (event.key === "F2") {
            event.preventDefault();
            onRenaming(node.id);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openRow();
          }
        }}
        title={node.request ? `${node.request.method} ${node.request.url}` : node.name}
        className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 pr-1 text-left focus-visible:outline-none"
      >
        {node.kind === "request" ? (
          <span className={cx("w-8 shrink-0 font-mono text-[9.5px] font-semibold", methodText[node.request!.method])}>
            {methodShort[node.request!.method]}
          </span>
        ) : null}
        {renaming ? (
          <NameInput
            value={node.name}
            onDone={(name) => {
              if (name && name !== node.name) actions.rename(node.id, name);
              onRenaming(null);
            }}
          />
        ) : (
          <span className={cx("truncate text-[12.5px]", node.kind === "collection" ? "font-medium text-fg" : "text-fg")}>
            {node.name}
          </span>
        )}
      </div>
      </div>
      {renaming ? null : (
        <div className="invisible flex shrink-0 items-center pr-0.5 group-focus-within:visible group-hover:visible">
          {container ? (
            <IconButton size="sm" label={`Add request to ${node.name}`} className="h-5 w-5" onClick={() => actions.add(node.id, "request")}>
              <Plus size={12} aria-hidden="true" />
            </IconButton>
          ) : null}
          <IconButton
            size="sm"
            label={`More actions for ${node.name}`}
            className="h-5 w-5"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onMenu(node, rect.left, rect.bottom + 4);
            }}
          >
            <MoreHorizontal size={13} aria-hidden="true" />
          </IconButton>
        </div>
      )}
    </div>
  );
});

export function CollectionTree({ workspace, filter, activeId, renaming, onRenaming, actions }: CollectionTreeProps) {
  const rows = useMemo(() => visibleRows(workspace, filter), [workspace, filter]);
  const [menu, setMenu] = useState<{ node: TreeNode; x: number; y: number } | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  const dragging = useRef<string | null>(null);
  const filtering = filter.trim() !== "";

  const onMenu = useCallback((node: TreeNode, x: number, y: number) => setMenu({ node, x, y }), []);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onDragStart = useCallback((id: string) => {
    dragging.current = id;
  }, []);
  const onDragEnd = useCallback(() => {
    dragging.current = null;
    setHint(null);
  }, []);
  const onDragOver = useCallback(
    (node: TreeNode, event: React.DragEvent<HTMLDivElement>) => {
      const id = dragging.current;
      if (!id) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientY - rect.top) / rect.height;
      const container = node.kind !== "request";
      const position: DropPosition = container
        ? ratio < 0.28
          ? "before"
          : ratio > 0.72 && !node.open
            ? "after"
            : "inside"
        : ratio < 0.5
          ? "before"
          : "after";
      const fallback: DropPosition = position === "inside" ? "after" : "inside";
      const chosen = canMove(workspace, id, node.id, position)
        ? position
        : container && canMove(workspace, id, node.id, fallback)
          ? fallback
          : null;
      if (!chosen) {
        setHint((current) => (current?.id === node.id ? null : current));
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setHint((current) => (current?.id === node.id && current.position === chosen ? current : { id: node.id, position: chosen }));
    },
    [workspace],
  );
  const onDrop = useCallback(
    (node: TreeNode) => {
      const id = dragging.current;
      if (id && hint && hint.id === node.id) actions.move(id, node.id, hint.position);
      dragging.current = null;
      setHint(null);
    },
    [actions, hint],
  );

  function menuItems(node: TreeNode): MenuItem[] {
    const kind = node.kind === "collection" ? "collection" : node.kind === "folder" ? "folder" : "request";
    const remove: MenuItem =
      node.kind === "collection"
        ? { label: "Delete", icon: Trash2, danger: true, onSelect: () => actions.askRemove(node.id) }
        : {
            label: "Delete",
            icon: Trash2,
            danger: true,
            confirm: node.kind === "request" ? "Click again to delete" : `Delete ${kind} and its contents`,
            onSelect: () => actions.remove(node.id),
          };
    if (node.kind === "request") {
      return [
        { label: "Open in new tab", icon: ExternalLink, onSelect: () => actions.open(node.id, true) },
        { label: "Rename", icon: Pencil, onSelect: () => onRenaming(node.id) },
        { label: "Duplicate", icon: Copy, onSelect: () => actions.duplicate(node.id) },
        remove,
      ];
    }
    const items: MenuItem[] = [
      { label: "Add request", icon: FilePlus2, onSelect: () => actions.add(node.id, "request") },
      { label: "Add folder", icon: FolderPlus, onSelect: () => actions.add(node.id, "folder") },
    ];
    if (node.kind === "collection") {
      items.unshift({ label: "Open", icon: ExternalLink, onSelect: () => actions.openCollection(node.id) });
    }
    items.push(
      { label: "Rename", icon: Pencil, onSelect: () => onRenaming(node.id) },
      { label: "Duplicate", icon: Copy, onSelect: () => actions.duplicate(node.id) },
      remove,
    );
    return items;
  }

  if (workspace.roots.length === 0) {
    return (
      <div className="px-3 py-3">
        <p className="text-xs leading-5 text-faint">
          No item in this panel.
        </p>
        <button
          type="button"
          onClick={() => actions.add(null, "collection")}
          className="mt-2.5 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-xs text-fg hover:border-line-strong"
        >
          <Plus size={13} aria-hidden="true" />
          Create
        </button>
      </div>
    );
  }

  return (
    <>
      <div role="tree" aria-label="Collections" className="px-1.5 pb-2" onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setHint(null);
      }}>
        {rows.length === 0 ? (
          <p className="px-2 py-3 text-xs text-faint">Nothing in collections matches “{filter}”.</p>
        ) : (
          rows.map(({ node, depth }) => (
            <Row
              key={node.id}
              node={node}
              depth={depth}
              active={node.id === activeId}
              renaming={node.id === renaming}
              forceOpen={filtering}
              hint={hint?.id === node.id ? hint.position : null}
              onRenaming={onRenaming}
              onMenu={onMenu}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              actions={actions}
            />
          ))
        )}
      </div>
      {menu ? <Menu x={menu.x} y={menu.y} items={menuItems(menu.node)} onClose={closeMenu} /> : null}
    </>
  );
}
