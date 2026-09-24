import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { METHODS, type HttpMethod } from "../lib/request";
import { cx, methodText } from "./ui";

type MethodPickerProps = {
  value: HttpMethod;
  onChange: (method: HttpMethod) => void;
};

export function MethodPicker({ value, onChange }: MethodPickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, METHODS.indexOf(value)));
    listRef.current?.focus();
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open, value]);

  function choose(method: HttpMethod) {
    onChange(method);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`HTTP method, ${value}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className={cx(
          "flex h-[30px] w-[92px] cursor-pointer items-center justify-between gap-1 rounded-l-md border-r border-line pr-1.5 pl-2.5 font-mono text-[12.5px] font-medium hover:bg-hover",
          methodText[value],
        )}
      >
        {value}
        <ChevronDown size={13} className="text-faint" aria-hidden="true" />
      </button>
      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label="HTTP method"
          aria-activedescendant={`method-${METHODS[active]}`}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % METHODS.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index - 1 + METHODS.length) % METHODS.length);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              choose(METHODS[active]);
            } else if (event.key === "Escape" || event.key === "Tab") {
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          className="absolute top-full left-0 z-30 mt-1 w-40 rounded-lg border border-line bg-panel p-1 shadow-[0_8px_24px_rgb(0_0_0/0.18)] outline-none"
        >
          {METHODS.map((method, index) => (
            <li
              key={method}
              id={`method-${method}`}
              role="option"
              aria-selected={method === value}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(method)}
              className={cx(
                "flex h-7 cursor-pointer items-center rounded-md px-2 font-mono text-[12.5px] font-medium",
                methodText[method],
                index === active && "bg-hover",
              )}
            >
              {method}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
