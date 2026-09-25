import { Layers, Plus, Settings, Variable, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HttpMethod } from "../lib/request";
import type { TabKind } from "../lib/storage";
import { Menu, type MenuItem } from "./Menu";
import { IconButton, cx, methodShort, methodText, modKey } from "./ui";

export type TabSummary = {
  id: string;
  kind: TabKind;
  method: HttpMethod;
  title: string;
  sending: boolean;
  dirty: boolean;
};

type TabBarProps = {
  tabs: TabSummary[];
  active: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCloseTabs: (ids: string[]) => void;
  onDuplicate: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
};

export function TabBar({
  tabs,
  active,
  onSelect,
  onClose,
  onCloseTabs,
  onDuplicate,
  onNew,
  onRename,
}: TabBarProps) {
  const activeRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
    null,
  );
  const [renaming, setRenaming] = useState<string | null>(null);
  const skipRename = useRef(false);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const menuTab = menu ? tabs.find((item) => item.id === menu.id) : undefined;
  const menuIndex = menuTab
    ? tabs.findIndex((item) => item.id === menuTab.id)
    : -1;
  const menuItems: MenuItem[] = menuTab
    ? [
        { label: "New request", onSelect: onNew },
        ...(menuTab.kind === "request"
          ? [
              {
                label: "Duplicate",
                divided: true,
                onSelect: () => onDuplicate(menuTab.id),
              } satisfies MenuItem,
            ]
          : []),
        { label: "Close", onSelect: () => onClose(menuTab.id) },
        {
          label: "Close others",
          disabled: tabs.length < 2,
          onSelect: () =>
            onCloseTabs(
              tabs
                .filter((item) => item.id !== menuTab.id)
                .map((item) => item.id),
            ),
        },
        {
          label: "Close to the right",
          disabled: menuIndex === tabs.length - 1,
          onSelect: () =>
            onCloseTabs(tabs.slice(menuIndex + 1).map((item) => item.id)),
        },
        {
          label: "Close all",
          onSelect: () => onCloseTabs(tabs.map((item) => item.id)),
        },
      ]
    : [];

  return (
    <div className="flex h-8 shrink-0 items-stretch border-b border-line bg-app">
      <div
        role="tablist"
        aria-label="Open requests"
        className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]"
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) onNew();
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <div
              key={tab.id}
              ref={selected ? activeRef : undefined}
              className={cx(
                "group relative flex w-44 shrink-0 items-center border-r border-line",
                selected ? "bg-panel" : "hover:bg-hover/70",
              )}
              onAuxClick={(event) => {
                if (event.button === 1) onClose(tab.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setMenu({ id: tab.id, x: event.clientX, y: event.clientY });
              }}
            >
              {selected ? (
                <span
                  className="absolute inset-x-0 top-0 h-0.5 bg-accent"
                  aria-hidden="true"
                />
              ) : null}
              <div
                role="tab"
                tabIndex={0}
                aria-selected={selected}
                onClick={() => onSelect(tab.id)}
                onKeyDown={(event) => {
                  if (renaming === tab.id) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(tab.id);
                  }
                }}
                onDoubleClick={(event) => {
                  if (tab.kind !== "request") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onSelect(tab.id);
                  setRenaming(tab.id);
                }}
                title={renaming === tab.id ? undefined : tab.title}
                className="flex h-full min-w-0 flex-1 cursor-pointer items-center gap-1.5 pr-1 pl-2.5 text-left focus-visible:outline-none"
              >
                {tab.kind === "collection" ? (
                  <Layers
                    size={13}
                    className="shrink-0 text-muted"
                    aria-hidden="true"
                  />
                ) : tab.kind === "environment" ? (
                  <Variable
                    size={13}
                    className="shrink-0 text-muted"
                    aria-hidden="true"
                  />
                ) : tab.kind === "settings" ? (
                  <Settings
                    size={13}
                    className="shrink-0 text-muted"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className={cx(
                      "shrink-0 font-mono text-[10px] font-semibold",
                      methodText[tab.method],
                    )}
                  >
                    {methodShort[tab.method]}
                  </span>
                )}
                {renaming === tab.id ? (
                  <input
                    autoFocus
                    aria-label="Request name"
                    defaultValue={tab.title}
                    onFocus={(event) => event.target.select()}
                    onClick={(event) => event.stopPropagation()}
                    onBlur={(event) => {
                      if (skipRename.current) {
                        skipRename.current = false;
                        setRenaming(null);
                        return;
                      }
                      const next = event.target.value.trim();
                      if (next && next !== tab.title) onRename(tab.id, next);
                      setRenaming(null);
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") event.currentTarget.blur();
                      else if (event.key === "Escape") {
                        skipRename.current = true;
                        setRenaming(null);
                      }
                    }}
                    className="h-5 min-w-0 flex-1 rounded border border-ring bg-panel px-1 text-[12.5px] text-fg outline-none focus-visible:outline-none"
                  />
                ) : (
                  <span
                    className={cx(
                      "truncate text-[12.5px]",
                      selected ? "text-fg" : "text-muted",
                    )}
                  >
                    {tab.title}
                  </span>
                )}
                {tab.sending ? (
                  <span
                    className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent"
                    aria-label="Sending"
                  />
                ) : null}
              </div>
              {tab.dirty ? (
                <span
                  className="pointer-events-none absolute right-2.5 h-1.5 w-1.5 rounded-full bg-s-client group-hover:invisible"
                  aria-label="Unsaved changes"
                />
              ) : null}
              <IconButton
                size="sm"
                label={`Close ${tab.title}`}
                onClick={() => onClose(tab.id)}
                className={cx(
                  "mr-1 h-5 w-5",
                  selected && !tab.dirty
                    ? "visible"
                    : "invisible group-hover:visible focus-visible:visible",
                )}
              >
                <X size={12} aria-hidden="true" />
              </IconButton>
            </div>
          );
        })}
      </div>
      <div className="flex items-center px-1">
        <IconButton
          size="sm"
          label={`New request (${modKey}T)`}
          onClick={onNew}
        >
          <Plus size={14} aria-hidden="true" />
        </IconButton>
      </div>
      {menu && menuTab ? (
        <Menu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
