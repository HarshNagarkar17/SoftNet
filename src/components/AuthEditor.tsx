import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Auth, AuthKind } from "../lib/request";
import { IconButton, cx } from "./ui";
import { SuggestInput } from "./VariableSuggest";

const KINDS: { id: AuthKind; label: string }[] = [
  { id: "none", label: "No auth" },
  { id: "bearer", label: "Bearer token" },
  { id: "basic", label: "Basic" },
  { id: "apikey", label: "API key" },
];

type AuthEditorProps = {
  auth: Auth;
  onChange: (auth: Auth) => void;
  allowInherit?: boolean;
  parentName?: string | null;
};

const field =
  "h-7 w-full rounded-md border border-line bg-raised px-2.5 font-mono text-[12.5px] text-fg outline-none placeholder:font-sans placeholder:text-faint focus:border-ring focus-visible:outline-none";

function Field({
  label,
  value,
  onChange,
  secret,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  placeholder?: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
      <label htmlFor={id} className="text-[13px] text-muted">
        {label}
      </label>
      <div className="relative">
        <SuggestInput
          id={id}
          type={secret && !shown ? "password" : "text"}
          value={value}
          placeholder={placeholder}
          onValue={onChange}
          spellCheck={false}
          autoComplete="off"
          className={`${field} ${secret ? "pr-10" : ""}`}
        />
        {secret ? (
          <IconButton
            size="sm"
            label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            onClick={() => setShown((current) => !current)}
            className="absolute top-0.5 right-0.5"
          >
            {shown ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
          </IconButton>
        ) : null}
      </div>
    </div>
  );
}

function OptionSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((option) => option.id === value)));
    listRef.current?.focus();
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open, options, value]);

  function choose(next: T) {
    onChange(next);
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="relative max-w-xs">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-line bg-panel px-2.5 text-left text-[13px] text-fg outline-none hover:bg-hover focus:border-ring focus-visible:outline-none"
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown size={14} className="shrink-0 text-faint" aria-hidden="true" />
      </button>
      {open ? (
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => (index + 1) % options.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => (index - 1 + options.length) % options.length);
            } else if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              const option = options[active];
              if (option) choose(option.id);
            } else if (event.key === "Escape" || event.key === "Tab") {
              setOpen(false);
              buttonRef.current?.focus();
            }
          }}
          className="absolute top-full left-0 z-30 mt-1 w-full min-w-44 rounded-lg border border-line bg-panel p-1 shadow-[0_8px_24px_rgb(0_0_0/0.18)] outline-none"
        >
          {options.map((option, index) => (
            <li
              key={option.id}
              role="option"
              aria-selected={option.id === value}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(option.id)}
              className={cx(
                "flex h-7 cursor-pointer items-center rounded-md px-2 text-[13px]",
                option.id === value ? "text-fg" : "text-muted",
                index === active && "bg-hover text-fg",
              )}
            >
              {option.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function AuthEditor({ auth, onChange, allowInherit = false, parentName = null }: AuthEditorProps) {
  const set = (patch: Partial<Auth>) => onChange({ ...auth, ...patch });
  const kinds = allowInherit ? [{ id: "inherit" as const, label: "Inherit from parent" }, ...KINDS] : KINDS;
  return (
    <div className="space-y-3 px-3 py-2.5">
      <div className="block max-w-xs">
        <span className="mb-1 block text-[11px] font-medium tracking-wide text-faint uppercase">Type</span>
        <OptionSelect label="Auth type" value={auth.kind} options={kinds} onChange={(kind) => set({ kind })} />
      </div>
      <div className="max-w-xl space-y-2">
        {auth.kind === "inherit" ? (
          <p className="text-[13px] text-muted">
            {parentName
              ? `This request uses the authorization from ${parentName}.`
              : "This request uses the authorization of its parent collection or folder."}
          </p>
        ) : null}
        {auth.kind === "none" ? (
          <p className="text-[13px] text-muted">
            This request is sent without credentials. Pick a type to add an Authorization header.
          </p>
        ) : null}
        {auth.kind === "bearer" ? (
          <Field label="Token" value={auth.token} secret onChange={(token) => set({ token })} />
        ) : null}
        {auth.kind === "basic" ? (
          <>
            <Field label="Username" value={auth.username} onChange={(username) => set({ username })} />
            <Field label="Password" value={auth.password} secret onChange={(password) => set({ password })} />
          </>
        ) : null}
        {auth.kind === "apikey" ? (
          <>
            <Field label="Key" value={auth.keyName} placeholder="X-API-Key" onChange={(keyName) => set({ keyName })} />
            <Field label="Value" value={auth.keyValue} secret onChange={(keyValue) => set({ keyValue })} />
            <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3">
              <span className="text-[13px] text-muted">Add to</span>
              <OptionSelect
                label="Add API key to"
                value={auth.keyIn}
                options={[
                  { id: "header", label: "Header" },
                  { id: "query", label: "Query params" },
                ]}
                onChange={(keyIn) => set({ keyIn })}
              />
            </div>
          </>
        ) : null}
        {auth.kind !== "none" && auth.kind !== "inherit" ? (
          <p className="text-xs text-faint">A header you add yourself with the same name takes priority.</p>
        ) : null}
      </div>
    </div>
  );
}
