import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { HttpMethod } from "../lib/request";

export const methodText: Record<HttpMethod, string> = {
  GET: "text-m-get",
  POST: "text-m-post",
  PUT: "text-m-put",
  PATCH: "text-m-patch",
  DELETE: "text-m-delete",
  HEAD: "text-m-other",
  OPTIONS: "text-m-other",
};

export const methodShort: Record<HttpMethod, string> = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  PATCH: "PATCH",
  DELETE: "DEL",
  HEAD: "HEAD",
  OPTIONS: "OPT",
};

export function statusText(status: number): string {
  if (status >= 500) return "text-s-server";
  if (status >= 400) return "text-s-client";
  if (status >= 300) return "text-s-redirect";
  if (status >= 200) return "text-s-ok";
  return "text-muted";
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  size?: "sm" | "md";
};

export function IconButton({ label, children, size = "md", className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-6 w-6" : "h-7 w-7",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-raised p-0.5">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cx(
              "h-6 cursor-pointer rounded-[5px] px-2 text-xs transition-colors",
              selected ? "bg-panel text-fg shadow-[0_0_0_1px_var(--line)]" : "text-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-raised px-1 font-sans text-[11px] text-muted">
      {children}
    </kbd>
  );
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? "⌘" : "Ctrl";

type TabsProps<T extends string> = {
  label: string;
  value: T;
  tabs: { id: T; label: string; count?: number; dot?: boolean }[];
  onChange: (value: T) => void;
  idPrefix: string;
};

export function Tabs<T extends string>({ label, value, tabs, onChange, idPrefix }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="flex h-full items-stretch gap-3.5">
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            onClick={() => onChange(tab.id)}
            className={cx(
              "relative inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] transition-colors",
              selected ? "text-fg" : "text-muted hover:text-fg",
            )}
          >
            {tab.label}
            {tab.count ? (
              <span className="rounded bg-raised px-1 text-[11px] leading-4 text-muted tabular-nums">
                {tab.count}
              </span>
            ) : null}
            {tab.dot ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : null}
            <span
              aria-hidden="true"
              className={cx(
                "absolute inset-x-0 -bottom-px h-0.5 rounded-full",
                selected ? "bg-accent" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}
