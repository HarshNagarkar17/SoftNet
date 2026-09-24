import { createContext, forwardRef, useContext, useLayoutEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { DYNAMIC_VARIABLES, applyVariable, matchingVariables, openVariable, type VariableChoice } from "../lib/suggest";
import { cx } from "./ui";

export const VariableChoices = createContext<VariableChoice[]>([]);

type OpenState = { start: number; query: string; index: number; top: number; left: number; width: number };
type Tip = { top: number; left: number; text: string };

const SCOPE_MARK: Record<VariableChoice["scope"], string> = {
  Environment: "E",
  Collection: "C",
  Dynamic: "G",
};

const SCOPE_TONE: Record<VariableChoice["scope"], string> = {
  Environment: "bg-s-ok/15 text-s-ok",
  Collection: "bg-m-post/15 text-m-post",
  Dynamic: "bg-accent-soft text-accent",
};

function place(el: HTMLElement): Pick<OpenState, "top" | "left" | "width"> {
  const rect = el.getBoundingClientRect();
  const width = Math.max(280, Math.min(380, Math.max(rect.width, 280)));
  const below = rect.bottom + 4;
  const top = below + 180 > window.innerHeight ? Math.max(8, rect.top - 4 - 180) : below;
  return { top, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)), width };
}

export function useVariableSuggest(apply: (text: string, caret: number) => void) {
  const choices = useContext(VariableChoices);
  const all = useMemo(() => [...choices, ...DYNAMIC_VARIABLES], [choices]);
  const [open, setOpen] = useState<OpenState | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const filtered = useMemo(() => (open ? matchingVariables(all, open.query) : []), [all, open]);

  function look(el: HTMLInputElement | HTMLTextAreaElement) {
    const found = openVariable(el.value, el.selectionStart ?? el.value.length);
    if (!found) {
      setOpen(null);
      setTip(null);
      return;
    }
    setOpen((current) => ({
      ...found,
      index: current && current.start === found.start && current.query === found.query ? current.index : 0,
      ...place(el),
    }));
  }

  function choose(el: HTMLInputElement | HTMLTextAreaElement, index: number) {
    if (!open) return;
    const choice = filtered[index];
    if (!choice) return;
    const next = applyVariable(el.value, open.start, el.selectionStart ?? el.value.length, choice.name);
    setOpen(null);
    setTip(null);
    apply(next.text, next.caret);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>): boolean {
    if (!open || filtered.length === 0) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setOpen((current) => (current ? { ...current, index: (current.index + delta + filtered.length) % filtered.length } : current));
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(event.currentTarget, Math.min(open.index, filtered.length - 1));
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(null);
      setTip(null);
      return true;
    }
    return false;
  }

  const menu =
    open && filtered.length > 0
      ? createPortal(
          <ul
            role="listbox"
            aria-label="Variables"
            style={{ top: open.top, left: open.left, width: open.width }}
            className="fixed z-50 max-h-72 overflow-auto rounded-lg border border-line bg-panel p-1 shadow-[0_12px_32px_rgb(0_0_0/0.18)]"
          >
            {filtered.map((choice, index) => {
              const selected = index === Math.min(open.index, filtered.length - 1);
              return (
              <li key={`${choice.scope}-${choice.name}-${index}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    const el = document.activeElement;
                    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) choose(el, index);
                  }}
                  onMouseEnter={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const left = rect.right + 8 + 280 > window.innerWidth ? Math.max(8, rect.left - 288) : rect.right + 8;
                    setTip({ top: rect.top, left, text: choice.value });
                  }}
                  onMouseLeave={() => setTip(null)}
                  className={cx(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left",
                    selected ? "bg-accent-soft" : "hover:bg-hover",
                  )}
                >
                  <span className={cx("flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-semibold", SCOPE_TONE[choice.scope])}>
                    {SCOPE_MARK[choice.scope]}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg">{choice.name}</span>
                  <span className="max-w-[46%] shrink-0 truncate text-[11px] text-faint">{choice.value}</span>
                </button>
              </li>
              );
            })}
          </ul>,
          document.body,
        )
      : null;

  const valueTip =
    tip && open && filtered.length > 0
      ? createPortal(
          <div
            role="tooltip"
            style={{ top: tip.top, left: tip.left }}
            className="fixed z-50 max-h-40 max-w-xs overflow-auto rounded-md border border-line bg-raised px-2 py-1.5 font-mono text-[12px] leading-5 break-all text-fg shadow-[0_8px_24px_rgb(0_0_0/0.16)]"
          >
            {tip.text}
          </div>,
          document.body,
        )
      : null;

  return { look, onKeyDown, close: () => { setOpen(null); setTip(null); }, menu: menu || valueTip ? <>{menu}{valueTip}</> : null };
}

type SuggestInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValue: (value: string) => void;
};

export const SuggestInput = forwardRef<HTMLInputElement, SuggestInputProps>(function SuggestInput(
  { value, onValue, onKeyDown, onClick, onKeyUp, ...rest },
  forwarded,
) {
  const local = useRef<HTMLInputElement>(null);
  const pending = useRef<number | null>(null);
  const suggest = useVariableSuggest((text, caret) => {
    pending.current = caret;
    onValue(text);
  });

  useLayoutEffect(() => {
    const el = local.current;
    if (!el || pending.current == null) return;
    el.setSelectionRange(pending.current, pending.current);
    pending.current = null;
  }, [value]);

  function setRef(node: HTMLInputElement | null) {
    local.current = node;
    if (typeof forwarded === "function") forwarded(node);
    else if (forwarded) forwarded.current = node;
  }

  return (
    <>
      <input
        {...rest}
        ref={setRef}
        value={value}
        onChange={(event) => {
          onValue(event.target.value);
          suggest.look(event.target);
        }}
        onClick={(event) => {
          suggest.look(event.currentTarget);
          onClick?.(event);
        }}
        onKeyUp={(event) => {
          if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) suggest.look(event.currentTarget);
          onKeyUp?.(event);
        }}
        onKeyDown={(event) => {
          if (suggest.onKeyDown(event)) return;
          onKeyDown?.(event);
        }}
        onBlur={() => window.setTimeout(suggest.close, 0)}
      />
      {suggest.menu}
    </>
  );
});
