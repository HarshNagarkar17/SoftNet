import { emptyAuth, emptyRequest, type HttpMethod, type RequestModel } from "./request";

export type HistoryEntry = {
  id: string;
  at: number;
  method: HttpMethod;
  url: string;
  status: number | null;
  timeMs: number | null;
  request: RequestModel;
};

export type Theme = "system" | "light" | "dark";

const HISTORY_KEY = "softnet.history.v1";
const TABS_KEY = "softnet.tabs.v1";
const PREFS_KEY = "softnet.prefs.v1";
export const HISTORY_LIMIT = 200;

export type Prefs = {
  theme: Theme;
  sidebar: boolean;
  split: number;
  panel: "collections" | "history";
  envsOpen: boolean;
  autosave: boolean;
};

const defaultPrefs: Prefs = { theme: "system", sidebar: true, split: 0.45, panel: "collections", envsOpen: true, autosave: false };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable; the app keeps working in memory.
  }
}

export function repair(request: RequestModel): RequestModel {
  return {
    ...request,
    params: request.params ?? [],
    headers: request.headers ?? [],
    formFields: request.formFields ?? [],
    auth: { ...emptyAuth(), ...request.auth },
    preRequest: typeof request.preRequest === "string" ? request.preRequest : "",
    tests: typeof request.tests === "string" ? request.tests : "",
  };
}

export function loadHistory(): HistoryEntry[] {
  return read<HistoryEntry[]>(HISTORY_KEY, []).map((entry) => ({
    ...entry,
    request: repair(entry.request),
  }));
}

export function saveHistory(entries: HistoryEntry[]) {
  write(HISTORY_KEY, entries.slice(0, HISTORY_LIMIT));
}

export type TabKind = "request" | "collection" | "environment" | "settings";

export type SavedTab = {
  id: string;
  kind: TabKind;
  request: RequestModel;
  savedId: string | null;
  name: string | null;
};

export type SavedTabs = {
  active: string | null;
  tabs: SavedTab[];
};

function savedTab(tab: Partial<SavedTab> & { id: string }): SavedTab {
  const kind =
    tab.kind === "collection" || tab.kind === "environment" || tab.kind === "settings" ? tab.kind : "request";
  return {
    id: tab.id,
    kind,
    request: repair(tab.request ?? emptyRequest()),
    savedId: tab.savedId ?? null,
    name: typeof tab.name === "string" && tab.name.trim() ? tab.name.trim() : null,
  };
}

export function loadTabs(): SavedTabs | null {
  const saved = read<SavedTabs | null>(TABS_KEY, null);
  if (!saved || !Array.isArray(saved.tabs)) return null;
  if (saved.tabs.length === 0) return { active: null, tabs: [] };
  const tabs = saved.tabs.map((tab) => savedTab(tab));
  return { active: tabs.some((tab) => tab.id === saved.active) ? saved.active : tabs[0].id, tabs };
}

export function saveTabs(value: SavedTabs) {
  write(TABS_KEY, value);
}

export function loadPrefs(): Prefs {
  return { ...defaultPrefs, ...read<Partial<Prefs>>(PREFS_KEY, {}) };
}

export function savePrefs(prefs: Prefs) {
  write(PREFS_KEY, prefs);
}

export function historyFromJson(raw: string): HistoryEntry[] | null {
  try {
    const data = JSON.parse(raw) as HistoryEntry[];
    if (!Array.isArray(data)) return null;
    return data.slice(0, HISTORY_LIMIT).map((entry) => ({ ...entry, request: repair(entry.request) }));
  } catch {
    return null;
  }
}

export function tabsFromJson(raw: string): SavedTabs | null {
  try {
    const saved = JSON.parse(raw) as SavedTabs;
    if (!saved || !Array.isArray(saved.tabs)) return null;
    if (saved.tabs.length === 0) return { active: null, tabs: [] };
    const tabs = saved.tabs.map((tab) => savedTab(tab));
    return { active: tabs.some((tab) => tab.id === saved.active) ? saved.active : tabs[0].id, tabs };
  } catch {
    return null;
  }
}

export function prefsFromJson(raw: string): Prefs | null {
  try {
    const saved = JSON.parse(raw) as Partial<Prefs>;
    if (!saved || typeof saved !== "object") return null;
    return { ...defaultPrefs, ...saved };
  } catch {
    return null;
  }
}
