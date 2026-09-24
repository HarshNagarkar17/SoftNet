import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { applyCompletion, matchingCompletions, scriptToken, type ScriptCompletion } from "../lib/script-edit";
import { cx } from "./ui";

type OpenState = { start: number; query: string; index: number; top: number; left: number; width: number };

function caretBox(el: HTMLTextAreaElement): { top: number; left: number } {
  const style = getComputedStyle(el);
  const mirror = document.createElement("div");
  mirror.style.position = "fixed";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre";
  mirror.style.font = style.font;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.padding = style.padding;
  mirror.style.width = `${el.clientWidth}px`;
  const host = el.getBoundingClientRect();
  mirror.style.left = `${host.left}px`;
  mirror.style.top = `${host.top - el.scrollTop}px`;
  mirror.textContent = el.value.slice(0, el.selectionStart ?? 0);
  const mark = document.createElement("span");
  mark.textContent = ".";
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const rect = mark.getBoundingClientRect();
  document.body.removeChild(mirror);
  return { top: rect.bottom + 2, left: rect.left };
}

function place(el: HTMLTextAreaElement): Pick<OpenState, "top" | "left" | "width"> {
  const caret = caretBox(el);
  const width = 420;
  const top = caret.top + 240 > window.innerHeight ? Math.max(8, caret.top - 244) : caret.top;
  return { top, left: Math.max(8, Math.min(caret.left, window.innerWidth - width - 8)), width };
}

export function useScriptSuggest(enabled: boolean, apply: (text: string, caret: number) => void) {
  const [open, setOpen] = useState<OpenState | null>(null);
  const filtered = useMemo(() => (open ? matchingCompletions(open.query) : []), [open]);

  function look(el: HTMLTextAreaElement) {
    if (!enabled) return;
    const found = scriptToken(el.value, el.selectionStart ?? el.value.length);
    if (!found) {
      setOpen(null);
      return;
    }
    setOpen((current) => ({
      ...found,
      index: current && current.start === found.start && current.query === found.query ? current.index : 0,
      ...place(el),
    }));
  }

  function choose(el: HTMLTextAreaElement, item: ScriptCompletion) {
    if (!open) return;
    const next = applyCompletion(el.value, open.start, el.selectionStart ?? el.value.length, item.insert);
    setOpen(null);
    apply(next.text, next.caret);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || filtered.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setOpen((current) => (current ? { ...current, index: (current.index + delta + filtered.length) % filtered.length } : current));
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(event.currentTarget, filtered[Math.min(open.index, filtered.length - 1)]);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(null);
      return true;
    }
    return false;
  }

  const menu =
    open && filtered.length > 0
      ? createPortal(
          <ul
            role="listbox"
            aria-label="Script suggestions"
            style={{ top: open.top, left: open.left, width: open.width }}
            className="fixed z-50 max-h-64 overflow-auto border border-line bg-panel py-1 shadow-[0_2px_8px_rgb(0_0_0/0.12)]"
          >
            {filtered.map((item, index) => {
              const selected = index === Math.min(open.index, filtered.length - 1);
              const name = item.label.slice(open.query.lastIndexOf(".") + 1);
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      const el = document.activeElement;
                      if (el instanceof HTMLTextAreaElement) choose(el, item);
                    }}
                    className={cx(
                      "flex w-full cursor-pointer items-baseline gap-4 px-2 py-0.5 text-left",
                      selected ? "bg-hover" : "hover:bg-hover",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">{name}</span>
                    <span className="shrink-0 truncate font-mono text-[11px] text-faint">{item.detail}</span>
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  return { look, onKeyDown, close: () => setOpen(null), menu };
}
