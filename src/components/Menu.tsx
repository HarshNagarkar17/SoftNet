import type { LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "./ui";

export type MenuItem = {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  confirm?: string;
  onSelect: () => void;
};

type MenuProps = {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
};

export function Menu({ x, y, items, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState(0);
  const [armed, setArmed] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - rect.width - 8),
      y: y + rect.height > window.innerHeight - 8 ? Math.max(8, y - rect.height) : y,
    });
    el.focus();
  }, [x, y]);

  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("blur", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  function choose(index: number) {
    const item = items[index];
    if (!item || item.disabled) return;
    if (item.confirm && armed !== index) {
      setArmed(index);
      return;
    }
    onClose();
    item.onSelect();
  }

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      style={{ left: pos.x, top: pos.y }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActive((index) => (index + 1) % items.length);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          setActive((index) => (index - 1 + items.length) % items.length);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          choose(active);
        } else if (event.key === "Escape" || event.key === "Tab") {
          event.preventDefault();
          onClose();
        }
      }}
      className="fixed z-50 min-w-44 rounded-lg border border-line bg-panel p-1 shadow-[0_8px_28px_rgb(0_0_0/0.22)] outline-none"
    >
      {items.map((item, index) => {
        const Icon = item.icon;
        const confirming = armed === index;
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={item.disabled}
            onPointerEnter={() => setActive(index)}
            onClick={() => choose(index)}
            className={cx(
              "flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-[12.5px]",
              item.disabled ? "cursor-not-allowed text-faint" : "cursor-pointer",
              !item.disabled && (item.danger ? "text-danger" : "text-fg"),
              !item.disabled && index === active && (confirming ? "bg-danger-soft" : "bg-hover"),
              confirming && "bg-danger-soft",
            )}
          >
            {Icon ? <Icon size={13} className={item.danger ? "" : "text-muted"} aria-hidden="true" /> : null}
            {confirming ? item.confirm : item.label}
          </button>
        );
      })}
    </div>
  );
}
