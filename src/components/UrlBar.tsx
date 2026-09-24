import { ChevronRight, Code2, Loader2, Save, X } from "lucide-react";
import { forwardRef, useRef, useState, type ReactNode } from "react";
import { looksLikeCurl } from "../lib/curl";
import type { HttpMethod } from "../lib/request";
import { MethodPicker } from "./MethodPicker";
import { IconButton, cx, modKey } from "./ui";
import { SuggestInput } from "./VariableSuggest";

type UrlBarProps = {
  method: HttpMethod;
  url: string;
  sending: boolean;
  error: string | null;
  crumbs: string[];
  name: string;
  saved: boolean;
  dirty: boolean;
  onMethod: (method: HttpMethod) => void;
  onUrl: (url: string) => void;
  onCurl: (command: string) => void;
  onSend: () => void;
  onCancel: () => void;
  onCopyCurl: () => void;
  onSave: () => void;
  onRename: (name: string) => void;
  extra?: ReactNode;
};

function highlightVariables(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\{\{[^{}]*\}\}/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) out.push(text.slice(last, index));
    out.push(
      <span key={key++} className="rounded-[3px] bg-accent-soft text-accent">
        {match[0]}
      </span>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function RequestName({ name, onRename }: { name: string; onRename: (name: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <button
        type="button"
        title="Rename request"
        onClick={() => setDraft(name)}
        className="min-w-0 cursor-text truncate rounded px-1 text-fg hover:bg-hover"
      >
        {name}
      </button>
    );
  }
  const commit = () => {
    if (draft.trim() && draft.trim() !== name) onRename(draft.trim());
    setDraft(null);
  };
  return (
    <input
      autoFocus
      aria-label="Request name"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        else if (event.key === "Escape") setDraft(null);
      }}
      className="h-5 w-56 rounded border border-ring bg-panel px-1 text-fg outline-none focus-visible:outline-none"
    />
  );
}

export const UrlBar = forwardRef<HTMLInputElement, UrlBarProps>(function UrlBar(
  { method, url, sending, error, crumbs, name, saved, dirty, onMethod, onUrl, onCurl, onSend, onCancel, onCopyCurl, onSave, onRename, extra },
  ref,
) {
  const mirror = useRef<HTMLDivElement>(null);
  return (
    <div className="px-3 pt-1.5 pb-2">
      <div className="flex h-8 items-center justify-between gap-3">
        <nav aria-label="Request location" className="flex min-w-0 items-center text-xs text-muted">
          {saved
            ? crumbs.map((crumb, index) => (
                <span key={`${crumb}-${index}`} className="flex min-w-0 shrink items-center">
                  <span className="truncate px-1">{crumb}</span>
                  <ChevronRight size={12} className="shrink-0 text-faint" aria-hidden="true" />
                </span>
              ))
            : null}
          <RequestName key={name} name={name} onRename={onRename} />
          {dirty ? (
            <span className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-s-client" title="Unsaved changes" aria-label="Unsaved changes" />
          ) : null}
        </nav>
        <div className="flex shrink-0 items-center gap-1">
          {extra}
        <button
          type="button"
          onClick={onSave}
          title={`Save (${modKey}S)`}
          className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <Save size={13} aria-hidden="true" />
          Save
        </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className={cx(
            "flex h-8 min-w-0 flex-1 items-center rounded-md border bg-raised transition-colors focus-within:border-ring",
            error ? "border-danger" : "border-line",
          )}
        >
          <MethodPicker value={method} onChange={onMethod} />
          <div className="relative h-full min-w-0 flex-1">
            <div
              ref={mirror}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-x-auto px-2.5 font-mono text-[12.5px] leading-8 whitespace-pre text-fg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {url ? highlightVariables(url) : null}
            </div>
          <SuggestInput
            ref={ref}
            aria-label="Request URL"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "url-error" : "url-hint"}
            value={url}
            onValue={onUrl}
            onScroll={(event) => {
              if (mirror.current) mirror.current.scrollLeft = event.currentTarget.scrollLeft;
            }}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (looksLikeCurl(text)) {
                event.preventDefault();
                onCurl(text);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (looksLikeCurl(url)) onCurl(url);
                else onSend();
              }
            }}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder="Enter a URL or paste a cURL command"
            className="relative z-[1] h-full w-full bg-transparent px-2.5 font-mono text-[12.5px] leading-8 text-transparent caret-[var(--fg)] outline-none placeholder:font-sans placeholder:text-faint focus-visible:outline-none"
          />
          </div>
        </div>
        <IconButton label="Copy as cURL" onClick={onCopyCurl} className="h-8 w-8 border border-line">
          <Code2 size={15} aria-hidden="true" />
        </IconButton>
        {sending ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 w-[76px] cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line-strong bg-panel text-[12.5px] font-medium text-fg hover:bg-hover"
          >
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (looksLikeCurl(url) ? onCurl(url) : onSend())}
            className="inline-flex h-8 w-[76px] cursor-pointer items-center justify-center rounded-md bg-accent text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            Send
          </button>
        )}
      </div>
      {error ? (
        <p id="url-error" role="alert" className="mt-1.5 flex items-center gap-1 text-xs text-danger">
          <X size={12} aria-hidden="true" />
          {error}
        </p>
      ) : (
        <p id="url-hint" className="sr-only">
          Paste a cURL command here to fill in the whole request.
        </p>
      )}
    </div>
  );
});
