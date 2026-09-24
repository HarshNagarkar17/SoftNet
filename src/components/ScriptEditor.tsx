import { CodeEditor } from "./CodeEditor";

export type ScriptPhase = "pre" | "tests";

const PHASES: { id: ScriptPhase; label: string }[] = [
  { id: "pre", label: "Before request" },
  { id: "tests", label: "After response" },
];

const PRE_PLACEHOLDER = `sn.environment.set("timestamp", String(Date.now()));

sn.request.headers.upsert({
  key: "X-Trace",
  value: sn.variables.get("timestamp"),
});`;

const TEST_PLACEHOLDER = `sn.test("Status is 200", () => {
  sn.response.to.have.status(200);
});

const body = sn.response.json();
sn.expect(body).to.have.property("id");`;

type ScriptEditorProps = {
  phase: ScriptPhase;
  preRequest: string;
  tests: string;
  onPhase: (phase: ScriptPhase) => void;
  onPreRequest: (value: string) => void;
  onTests: (value: string) => void;
};

export function ScriptEditor({ phase, preRequest, tests, onPhase, onPreRequest, onTests }: ScriptEditorProps) {
  const writingTests = phase === "tests";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-4 border-b border-line px-3">
        {PHASES.map((item) => {
          const selected = item.id === phase;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPhase(item.id)}
              className={selected ? "text-[12.5px] text-fg" : "text-[12.5px] text-muted hover:text-fg"}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-panel">
        <CodeEditor
          label={writingTests ? "Test script" : "Pre-request script"}
          value={writingTests ? tests : preRequest}
          onChange={writingTests ? onTests : onPreRequest}
          placeholder={writingTests ? TEST_PLACEHOLDER : PRE_PLACEHOLDER}
          script
        />
      </div>
    </div>
  );
}
