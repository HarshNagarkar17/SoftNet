import { AlertTriangle, ArrowDown, ArrowUp, Copy, Search, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { detectFormat, formatJson, plainLines } from "../lib/format";
import { contentType, type HttpResult } from "../lib/http";
import { formatBytes, formatDuration } from "../lib/request";
import type { ScriptReport } from "../lib/script";
import { LineViewer } from "./LineViewer";
import { IconButton, Kbd, Segmented, Tabs, cx, modKey, statusText } from "./ui";

export type SendState =
  | { phase: "idle" }
  | { phase: "sending"; startedAt: number }
  | { phase: "error"; message: string; scripts?: ScriptReport }
  | { phase: "done"; result: HttpResult; scripts?: ScriptReport };

type ResponsePaneProps = {
  state: SendState;
  onCopy: (text: string, what: string) => void;
};

type View = "pretty" | "raw" | "preview";

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="tabular-nums">{formatDuration(Math.max(0, now - since))}</span>;
}

export const ResponsePane = forwardRef<HTMLInputElement, ResponsePaneProps>(function ResponsePane(
  { state, onCopy },
  searchRef,
) {
  return (
    <section aria-label="Response" className="relative flex h-full min-h-0 flex-1 flex-col bg-panel">
      {state.phase === "sending" ? (
        <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden" aria-hidden="true">
          <div className="progress-sweep h-full w-1/3 bg-accent" />
        </div>
      ) : null}
      {state.phase === "done" ? (
        <ResultView
          key={state.result.finalUrl + state.result.timeMs}
          result={state.result}
          scripts={state.scripts}
          onCopy={onCopy}
          searchRef={searchRef}
        />
      ) : (
        <>
          <div className="flex h-8 shrink-0 items-center border-b border-line px-3">
            <p className="text-[13px] font-medium text-fg">Response</p>
          </div>
          <div className="flex flex-1 items-center justify-center px-6" aria-live="polite">
            {state.phase === "idle" ? (
              <div className="max-w-sm text-center">
                <p className="text-sm text-fg">Send a request to see the response here.</p>
                <p className="mt-2 text-[13px] leading-6 text-muted">
                  Paste a cURL command into the URL bar to fill in everything at once. Press{" "}
                  <Kbd>{modKey}</Kbd> <Kbd>Enter</Kbd> to send.
                </p>
              </div>
            ) : null}
            {state.phase === "sending" ? (
              <p className="text-sm text-muted">
                Waiting for response, <Elapsed since={state.startedAt} />
              </p>
            ) : null}
            {state.phase === "error" ? (
              <div className="flex w-full max-w-lg flex-col gap-3">
                <div role="alert" className="flex items-start gap-3 rounded-lg border border-line bg-danger-soft px-4 py-3">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      {state.message === "Request cancelled." ? "Request cancelled" : "Could not get a response"}
                    </p>
                    {state.message !== "Request cancelled." ? (
                      <p className="mt-1 text-[13px] break-words text-muted" data-selectable>
                        {state.message}
                      </p>
                    ) : null}
                  </div>
                </div>
                {state.scripts && state.scripts.logs.length > 0 ? <ConsoleView logs={state.scripts.logs} /> : null}
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
});

function ResultView({
  result,
  scripts,
  onCopy,
  searchRef,
}: {
  result: HttpResult;
  scripts?: ScriptReport;
  onCopy: (text: string, what: string) => void;
  searchRef: React.ForwardedRef<HTMLInputElement>;
}) {
  const [tab, setTab] = useState<"body" | "headers" | "tests" | "console">("body");
  const type = contentType(result);
  const format = result.binary ? "text" : detectFormat(result.body, type);
  const pretty = useMemo(
    () => (format === "json" && !result.binary ? formatJson(result.body) : null),
    [format, result],
  );
  const raw = useMemo(() => plainLines(result.body), [result]);
  const [view, setView] = useState<View>(pretty ? "pretty" : format === "html" ? "preview" : "raw");
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);
  const onMatches = useCallback((next: number) => {
    setCount(next);
    setCurrent((index) => (next === 0 ? 0 : Math.min(index, next - 1)));
  }, []);

  const views: { id: View; label: string }[] = [];
  if (pretty) views.push({ id: "pretty", label: "Pretty" });
  views.push({ id: "raw", label: "Raw" });
  if (format === "html") views.push({ id: "preview", label: "Preview" });

  const statusLabel = result.statusText ? `${result.status} ${result.statusText}` : String(result.status);
  const lines = view === "pretty" && pretty ? pretty : raw;
  const bodyEmpty = result.body === "";

  function step(direction: 1 | -1) {
    if (count === 0) return;
    setCurrent((index) => (index + direction + count) % count);
  }

  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-line px-3">
        <Tabs
          label="Response"
          idPrefix="response"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "body", label: "Body" },
            { id: "headers", label: "Headers", count: result.headers.length },
            ...(scripts
              ? [
                  { id: "tests" as const, label: "Tests", count: scripts.tests.length },
                  { id: "console" as const, label: "Console", count: scripts.logs.length },
                ]
              : []),
          ]}
        />
        {tab === "body" ? <Segmented label="Body view" value={view} options={views} onChange={setView} /> : null}
        {tab === "body" && type ? <span className="hidden truncate text-xs text-faint xl:inline">{type.split(";")[0]}</span> : null}
        <dl className="ml-auto flex shrink-0 items-center gap-3 text-xs" aria-live="polite">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Status</dt>
            <dd className={cx("font-semibold tabular-nums", statusText(result.status))}>{statusLabel}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-faint">Time</dt>
            <dd className="text-fg tabular-nums">{formatDuration(result.timeMs)}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt className="text-faint">Size</dt>
            <dd className="text-fg tabular-nums">{formatBytes(result.sizeBytes)}</dd>
          </div>
        </dl>
        {tab === "body" && view !== "preview" && !bodyEmpty ? (
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex h-6 items-center rounded-md border border-line bg-raised focus-within:border-ring">
              <Search size={13} className="ml-2 text-faint" aria-hidden="true" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCurrent(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    step(event.shiftKey ? -1 : 1);
                  } else if (event.key === "Escape") {
                    setQuery("");
                  }
                }}
                aria-label="Search response body"
                placeholder="Search"
                spellCheck={false}
                className="h-full w-28 bg-transparent px-2 text-xs text-fg outline-none placeholder:text-faint focus-visible:outline-none"
              />
              {query ? (
                <span className="pr-2 text-[11px] whitespace-nowrap text-muted tabular-nums" aria-live="polite">
                  {count === 0 ? "No results" : `${current + 1} of ${count}`}
                </span>
              ) : null}
            </div>
            <IconButton size="sm" label="Previous match" disabled={count === 0} onClick={() => step(-1)}>
              <ArrowUp size={14} aria-hidden="true" />
            </IconButton>
            <IconButton size="sm" label="Next match" disabled={count === 0} onClick={() => step(1)}>
              <ArrowDown size={14} aria-hidden="true" />
            </IconButton>
            {query ? (
              <IconButton size="sm" label="Clear search" onClick={() => setQuery("")}>
                <X size={14} aria-hidden="true" />
              </IconButton>
            ) : null}
            <IconButton size="sm" label="Copy response body" onClick={() => onCopy(result.body, "Response body")}>
              <Copy size={14} aria-hidden="true" />
            </IconButton>
          </div>
        ) : null}
      </div>

      {tab === "body" ? (
        <>
          {result.truncated ? (
            <p className="mx-3 mb-2 rounded-md bg-raised px-3 py-1.5 text-xs text-muted">
              Showing the first 5 MB of {formatBytes(result.sizeBytes)}. The rest was not downloaded.
            </p>
          ) : null}
          <div
            id="response-panel"
            role="tabpanel"
            aria-labelledby="response-tab-body"
            className="min-h-0 flex-1"
          >
            {bodyEmpty ? (
              <p className="px-4 py-6 text-[13px] text-muted">The response has no body.</p>
            ) : view === "preview" ? (
              <iframe
                title="HTML preview"
                sandbox=""
                srcDoc={result.body}
                className="h-full w-full bg-white"
              />
            ) : (
              <LineViewer lines={lines} query={query} current={current} onMatches={onMatches} />
            )}
          </div>
        </>
      ) : tab === "tests" && scripts ? (
        <div id="response-panel" role="tabpanel" aria-labelledby="response-tab-tests" className="min-h-0 flex-1 overflow-auto">
          <ScriptReportView report={scripts} />
        </div>
      ) : tab === "console" && scripts ? (
        <div id="response-panel" role="tabpanel" aria-labelledby="response-tab-console" className="min-h-0 flex-1 overflow-auto">
          <ConsoleView logs={scripts.logs} />
        </div>
      ) : (
        <div id="response-panel" role="tabpanel" aria-labelledby="response-tab-headers" className="min-h-0 flex-1 overflow-auto">
          {result.headers.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted">The response has no headers.</p>
          ) : (
            <table className="w-full border-collapse text-[13px]" data-selectable>
              <thead className="sticky top-0 bg-raised text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="w-[32%] border-b border-line px-4 py-1.5 font-normal">
                    Header
                  </th>
                  <th scope="col" className="border-b border-line px-4 py-1.5 font-normal">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.headers.map((header, index) => (
                  <tr key={`${header.key}-${index}`} className="border-b border-line align-top hover:bg-hover/60">
                    <td className="px-4 py-1.5 font-medium break-all text-fg">{header.key}</td>
                    <td className="px-4 py-1.5 font-mono text-xs leading-5 break-all text-muted">{header.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.finalUrl ? (
            <p className="px-4 py-3 text-xs text-faint" data-selectable>
              Final URL <span className="font-mono text-muted">{result.finalUrl}</span>
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}

function ScriptReportView({ report }: { report: ScriptReport }) {
  if (report.testError) {
    return (
      <div>
        <p className="px-4 py-3 text-[13px] text-danger">{report.testError}</p>
        {report.tests.length > 0 ? <TestList report={report} /> : null}
      </div>
    );
  }
  if (report.tests.length === 0) {
    return <p className="px-4 py-6 text-[13px] text-muted">This request has no test script.</p>;
  }
  return <TestList report={report} />;
}

function TestList({ report }: { report: ScriptReport }) {
  const failed = report.tests.filter((test) => !test.passed).length;
  return (
    <div className="px-3 py-2">
      <p className="px-1 pb-2 text-xs text-muted">
        {failed === 0 ? `${report.tests.length} passed` : `${report.tests.length - failed} passed, ${failed} failed`}
      </p>
      <ul className="flex flex-col gap-1">
        {report.tests.map((test, index) => (
          <li key={`${test.name}-${index}`} className="rounded-md px-2 py-1.5">
            <p className={cx("text-[13px]", test.passed ? "text-s-ok" : "text-danger")}>
              {test.passed ? "Passed" : "Failed"} <span className="text-fg">{test.name}</span>
            </p>
            {test.message ? <p className="mt-0.5 text-xs text-muted">{test.message}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConsoleView({ logs }: { logs: ScriptReport["logs"] }) {
  if (logs.length === 0) return <p className="px-4 py-6 text-[13px] text-muted">No console output.</p>;
  return (
    <ul className="px-4 py-2 font-mono text-xs leading-5" data-selectable>
      {logs.map((entry, index) => (
        <li key={index} className={cx("py-0.5 break-all", entry.level === "error" || entry.level === "warn" ? "text-danger" : "text-fg")}>
          <span className="text-faint">{entry.source} </span>
          {entry.text}
        </li>
      ))}
    </ul>
  );
}
