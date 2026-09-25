import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { version } from "../package.json";
import { AuthEditor } from "./components/AuthEditor";
import { BodyEditor } from "./components/BodyEditor";
import { CollectionTree, type TreeActions } from "./components/CollectionTree";
import { ConfirmDialog, SaveDiscardDialog } from "./components/ConfirmDialog";
import { CollectionPage, EmptyCanvas, EnvironmentPage, SettingsDialog, type SettingsSection } from "./components/ResourcePage";
import { EnvironmentPicker } from "./components/VariablesDialog";
import { KeyValueEditor } from "./components/KeyValueEditor";
import { ResponsePane, type SendState } from "./components/ResponsePane";
import { SaveDialog } from "./components/SaveDialog";
import { ScriptEditor, type ScriptPhase } from "./components/ScriptEditor";
import { Sidebar } from "./components/Sidebar";
import { VariableChoices } from "./components/VariableSuggest";
import { TabBar } from "./components/TabBar";
import { UrlBar } from "./components/UrlBar";
import { Tabs, copyText, isMac } from "./components/ui";
import {
  addNode,
  ancestors,
  effectiveAuth,
  duplicateNode,
  emptyWorkspace,
  moveNode,
  parseWorkspace,
  patchNode,
  removeNode,
  revealNode,
  type NodeKind,
  type Workspace,
} from "./lib/collections";
import { looksLikeCurl, parseCurl, requestFromCurl, toCurl } from "./lib/curl";
import { cancelHttp, errorMessage, inDesktop, sendHttp } from "./lib/http";
import { addImportedCollection, parsePostman } from "./lib/postman";
import { loadStore, saveStore } from "./lib/persist";
import { runScript, type ScriptReport } from "./lib/script";
import {
  applyParams,
  buildOutgoing,
  countActive,
  emptyAuth,
  emptyRequest,
  newId,
  requestTitle,
  syncParamsFromUrl,
  validateUrl,
  type KvRow,
  type RequestModel,
} from "./lib/request";
import {
  HISTORY_LIMIT,
  loadHistory,
  loadPrefs,
  historyFromJson,
  loadTabs,
  prefsFromJson,
  repair,
  saveHistory,
  savePrefs,
  saveTabs,
  tabsFromJson,
  type HistoryEntry,
  type Prefs,
  type TabKind,
} from "./lib/storage";
import {
  applyVariables,
  emptyEnvironments,
  mergedValues,
  missingVariables,
  parseEnvironments,
  replaceVariableMap,
  scopeVariables,
  variableMap,
  type Environments,
} from "./lib/variables";
import type { VariableChoice } from "./lib/suggest";
import { closeWindow, setWindowTitle } from "./lib/window";

type EditorTab = "params" | "auth" | "headers" | "body" | "scripts";

type TabState = {
  id: string;
  kind: TabKind;
  request: RequestModel;
  savedId: string | null;
  editor: EditorTab;
  script: ScriptPhase;
  send: SendState;
  urlError: string | null;
  requestId: string | null;
  name: string | null;
};

const NEW_NAMES: Record<NodeKind, string> = {
  collection: "New collection",
  folder: "New folder",
  request: "New request",
};

function newTab(request: RequestModel = emptyRequest(), savedId: string | null = null, kind: TabKind = "request"): TabState {
  return {
    id: newId(),
    kind,
    request,
    savedId,
    editor: request.bodyKind !== "none" ? "body" : "params",
    script: "pre",
    send: { phase: "idle" },
    urlError: null,
    requestId: null,
    name: null,
  };
}

function initialTabs(): { tabs: TabState[]; active: string | null } {
  const saved = loadTabs();
  if (!saved) {
    const tab = newTab();
    return { tabs: [tab], active: tab.id };
  }
  const source = saved.tabs.filter((tab) => tab.kind !== "settings");
  if (source.length === 0) return { tabs: [], active: null };
  const tabs = source.map((tab) => ({ ...newTab(tab.request, tab.savedId, tab.kind), id: tab.id, name: tab.name }));
  const active = tabs.some((tab) => tab.id === saved.active) ? saved.active : tabs[0].id;
  return { tabs, active };
}

function sameMap(left: Map<string, string>, right: Map<string, string>): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) if (right.get(key) !== value) return false;
  return true;
}

function isBlank(tab: TabState): boolean {
  return tab.kind === "request" && tab.savedId === null && tab.request.url.trim() === "" && tab.send.phase === "idle";
}

function sameRequest(a: RequestModel, b: RequestModel): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function requestTouched(request: RequestModel): boolean {
  if (request.preRequest.trim() || request.tests.trim()) return true;
  if (request.url.trim() || request.bodyText.trim() || request.method !== "GET") return true;
  if (request.auth.kind !== "none" && request.auth.kind !== "inherit") return true;
  return [...request.params, ...request.headers, ...request.formFields].some((row) => row.key.trim() || row.value.trim());
}

function shouldAsk(tab: TabState, ws: Workspace): boolean {
  if (tab.kind !== "request") return false;
  const node = tab.savedId ? ws.nodes[tab.savedId] : undefined;
  if (node?.request) return !sameRequest(node.request, tab.request);
  return tab.name != null || requestTouched(tab.request);
}

function App() {
  const [{ tabs, active }, setTabState] = useState(initialTabs);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [environments, setEnvironments] = useState<Environments>(emptyEnvironments);
  const [storesReady, setStoresReady] = useState(false);
  const envsRef = useRef(environments);
  envsRef.current = environments;
  const [filter, setFilter] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: "environment" | "collection"; id: string; name: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const quitWhenEmpty = useRef(false);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const urlRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const splitRef = useRef<HTMLDivElement>(null);
  const requestPaneRef = useRef<HTMLElement>(null);
  const responsePaneRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeRef = useRef(active);
  activeRef.current = active;

  const tab = tabs.find((item) => item.id === active) ?? null;

  const setTabs = useCallback((update: (tabs: TabState[]) => TabState[]) => {
    setTabState((state) => ({ ...state, tabs: update(state.tabs) }));
  }, []);

  const updateTab = useCallback(
    (id: string, update: (tab: TabState) => TabState) => {
      setTabs((list) => list.map((item) => (item.id === id ? update(item) : item)));
    },
    [setTabs],
  );

  const updateRequest = useCallback(
    (update: (request: RequestModel) => RequestModel) => {
      const id = activeRef.current;
      if (!id) return;
      updateTab(id, (item) => (item.kind === "request" ? { ...item, request: update(item.request) } : item));
    },
    [updateTab],
  );

  useEffect(() => {
    void setWindowTitle(`Softnet v${version}`);
  }, []);

  const notify = useCallback((text: string) => setToast({ id: Date.now(), text }), []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const saved = {
      active,
      tabs: tabs.map((item) => ({ id: item.id, kind: item.kind, request: item.request, savedId: item.savedId, name: item.name })),
    };
    const timer = window.setTimeout(() => saveTabs(saved), 300);
    if (!storesReady) return () => window.clearTimeout(timer);
    const disk = window.setTimeout(() => {
      saveStore("tabs", JSON.stringify(saved)).catch((error) => notify(`Could not save tabs. ${errorMessage(error)}`));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(disk);
    };
  }, [tabs, active, storesReady, notify]);

  useEffect(() => {
    let live = true;
    Promise.all([
      loadStore("workspace"),
      loadStore("history"),
      loadStore("tabs"),
      loadStore("prefs"),
      loadStore("environments"),
    ])
      .then(([ws, historyRaw, tabsRaw, prefsRaw, envRaw]) => {
        if (!live) return;
        if (ws !== null) setWorkspace(parseWorkspace(ws, repair));
        if (historyRaw) {
          const parsed = historyFromJson(historyRaw);
          if (parsed) setHistory(parsed);
        }
        if (tabsRaw) {
          const parsed = tabsFromJson(tabsRaw);
          if (parsed) {
            const next = parsed.tabs.map((item) => ({ ...newTab(item.request, item.savedId, item.kind), id: item.id }));
            const activeId = next.some((item) => item.id === parsed.active) ? parsed.active : (next[0]?.id ?? null);
            setTabState({ tabs: next, active: activeId });
          }
        }
        if (prefsRaw) {
          const parsed = prefsFromJson(prefsRaw);
          if (parsed) setPrefs(parsed);
        }
        if (envRaw) setEnvironments(parseEnvironments(envRaw));
        setStoresReady(true);
      })
      .catch((error) => {
        notify(`Could not load saved data. ${errorMessage(error)}`);
        if (live) setStoresReady(true);
      });
    return () => {
      live = false;
    };
  }, [notify]);

  useEffect(() => {
    if (!storesReady) return;
    const timer = window.setTimeout(() => {
      saveStore("workspace", JSON.stringify(workspace)).catch((error) =>
        notify(`Could not save collections. ${errorMessage(error)}`),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [workspace, storesReady, notify]);

  useEffect(() => {
    saveHistory(history);
    if (!storesReady) return;
    const timer = window.setTimeout(() => {
      saveStore("history", JSON.stringify(history)).catch((error) => notify(`Could not save history. ${errorMessage(error)}`));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [history, storesReady, notify]);

  useEffect(() => {
    savePrefs(prefs);
    if (!storesReady) return;
    const timer = window.setTimeout(() => {
      saveStore("prefs", JSON.stringify(prefs)).catch((error) => notify(`Could not save preferences. ${errorMessage(error)}`));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [prefs, storesReady, notify]);

  useEffect(() => {
    if (!storesReady) return;
    const timer = window.setTimeout(() => {
      saveStore("environments", JSON.stringify(environments)).catch((error) =>
        notify(`Could not save environments. ${errorMessage(error)}`),
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [environments, storesReady, notify]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = prefs.theme === "dark" || (prefs.theme === "system" && query.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [prefs.theme]);

  const openTab = useCallback((request?: RequestModel, savedId: string | null = null) => {
    const created = newTab(request, savedId);
    setTabState((state) =>
      state.tabs.some((item) => item.id === created.id) ? { ...state, active: created.id } : { tabs: [...state.tabs, created], active: created.id },
    );
    requestAnimationFrame(() => urlRef.current?.focus());
  }, []);

  const duplicateTab = useCallback((id: string) => {
    setTabState((state) => {
      const index = state.tabs.findIndex((item) => item.id === id);
      const source = index >= 0 ? state.tabs[index] : undefined;
      if (!source || source.kind !== "request") return state;
      const title =
        source.name ?? (source.savedId ? workspaceRef.current.nodes[source.savedId]?.name : undefined) ?? null;
      const created = {
        ...newTab(structuredClone(source.request)),
        name: title ? `${title} copy` : null,
      };
      const next = [...state.tabs];
      next.splice(index + 1, 0, created);
      return { tabs: next, active: created.id };
    });
    requestAnimationFrame(() => urlRef.current?.focus());
  }, []);

  const closeTabs = useCallback((ids: string[]) => {
    const closing = new Set(ids);
    for (const item of tabsRef.current) {
      if (closing.has(item.id) && item.requestId) void cancelHttp(item.requestId);
    }
    setTabState((state) => {
      const rest = state.tabs.filter((item) => !closing.has(item.id));
      if (rest.length === 0) return { tabs: [], active: null };
      const activeId = rest.some((item) => item.id === state.active) ? state.active : rest[rest.length - 1].id;
      return { tabs: rest, active: activeId };
    });
  }, []);

  const [closeQueue, setCloseQueue] = useState<string[]>([]);
  const closeQueueRef = useRef(closeQueue);
  closeQueueRef.current = closeQueue;

  const askClose = useCallback(
    (ids: string[]) => {
      const free: string[] = [];
      const ask: string[] = [];
      for (const id of ids) {
        const item = tabsRef.current.find((tab) => tab.id === id);
        if (item && shouldAsk(item, workspaceRef.current)) ask.push(id);
        else free.push(id);
      }
      if (free.length) closeTabs(free);
      if (ask.length) {
        setCloseQueue((current) => [...current, ...ask.filter((id) => !current.includes(id))]);
      }
    },
    [closeTabs],
  );

  const importCurl = useCallback(
    (tabId: string, command: string) => {
      try {
        const request = requestFromCurl(parseCurl(command));
        updateTab(tabId, (item) => ({
          ...item,
          request,
          urlError: null,
          editor: request.bodyKind !== "none" ? "body" : request.params.length > 0 ? "params" : item.editor,
        }));
        notify("Imported cURL command");
      } catch (error) {
        updateTab(tabId, (item) => ({
          ...item,
          urlError: `Could not import cURL. ${error instanceof Error ? error.message : ""}`.trim(),
        }));
      }
    },
    [notify, updateTab],
  );

  const valuesFor = useCallback((savedId: string | null) => {
    const nodeId = savedId && workspaceRef.current.nodes[savedId] ? savedId : null;
    const collection = nodeId ? ancestors(workspaceRef.current, nodeId).find((node) => node.kind === "collection") : undefined;
    const environment = envsRef.current.items.find((item) => item.id === envsRef.current.activeId);
    return scopeVariables(collection?.variables, environment?.values);
  }, []);

  const scriptScopes = useCallback((savedId: string | null) => {
    const nodeId = savedId && workspaceRef.current.nodes[savedId] ? savedId : null;
    const collection = nodeId ? ancestors(workspaceRef.current, nodeId).find((node) => node.kind === "collection") : undefined;
    const environment = envsRef.current.items.find((item) => item.id === envsRef.current.activeId);
    return {
      collectionId: collection?.id ?? null,
      environmentId: environment?.id ?? null,
      environment: variableMap(environment?.values),
      collection: variableMap(collection?.variables),
      hasEnvironment: Boolean(environment),
      hasCollection: Boolean(collection),
    };
  }, []);

  const persistScriptVars = useCallback(
    (
      scopes: {
        collectionId: string | null;
        environmentId: string | null;
        environment: Map<string, string>;
        collection: Map<string, string>;
      },
      environment: Map<string, string>,
      collection: Map<string, string>,
    ) => {
      if (scopes.environmentId && !sameMap(scopes.environment, environment)) {
        const environmentId = scopes.environmentId;
        setEnvironments((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === environmentId ? { ...item, values: replaceVariableMap(item.values, environment) } : item,
          ),
        }));
      }
      if (scopes.collectionId && !sameMap(scopes.collection, collection)) {
        const collectionId = scopes.collectionId;
        setWorkspace((ws) => {
          const node = ws.nodes[collectionId];
          if (!node) return ws;
          return patchNode(ws, node.id, { variables: replaceVariableMap(node.variables ?? [], collection) });
        });
      }
    },
    [],
  );

  const recordHistory = useCallback((request: RequestModel, sentUrl: string, status: number | null, timeMs: number | null) => {
    const snapshot = structuredClone(request);
    setHistory((list) => {
      const entry: HistoryEntry = {
        id: newId(),
        at: Date.now(),
        method: request.method,
        url: sentUrl,
        status,
        timeMs,
        request: snapshot,
      };
      const [latest, ...rest] = list;
      const same =
        latest &&
        latest.method === entry.method &&
        latest.url === entry.url &&
        JSON.stringify(latest.request) === JSON.stringify(entry.request);
      return (same ? [entry, ...rest] : [entry, ...list]).slice(0, HISTORY_LIMIT);
    });
  }, []);

  const send = useCallback(
    async (tabId: string) => {
      const current = tabsRef.current.find((item) => item.id === tabId);
      if (!current || current.kind !== "request" || current.send.phase === "sending") return;
      const request = current.request;
      if (looksLikeCurl(request.url)) {
        importCurl(tabId, request.url);
        return;
      }
      const scopes = scriptScopes(current.savedId);
      const prepared = {
        ...request,
        auth: effectiveAuth(workspaceRef.current, current.savedId, request.auth).auth,
      };
      const pre = runScript({
        code: prepared.preRequest,
        phase: "prerequest",
        request: prepared,
        environment: scopes.environment,
        collection: scopes.collection,
        locals: new Map(),
        hasEnvironment: scopes.hasEnvironment,
        hasCollection: scopes.hasCollection,
      });
      persistScriptVars(scopes, pre.environment, pre.collection);
      if (pre.error) {
        updateTab(tabId, (item) => ({
          ...item,
          urlError: null,
          requestId: null,
          send: {
            phase: "error",
            message: pre.error ?? "The pre-request script failed.",
            scripts: { logs: pre.logs, tests: [], testError: null },
          },
        }));
        return;
      }
      const resolved = applyVariables(pre.request, mergedValues(pre.collection, pre.environment, pre.locals));
      const target = applyParams(resolved.url, resolved.params);
      const missing = missingVariables(target, mergedValues(pre.collection, pre.environment, pre.locals));
      const problem = missing.length
        ? `No value for ${missing.map((name) => `{{${name}}}`).join(", ")}.`
        : validateUrl(target);
      if (problem) {
        updateTab(tabId, (item) => ({ ...item, urlError: problem }));
        urlRef.current?.focus();
        return;
      }
      const requestId = newId();
      const outgoing = buildOutgoing(resolved);
      updateTab(tabId, (item) => ({
        ...item,
        urlError: null,
        requestId,
        send: { phase: "sending", startedAt: Date.now() },
      }));
      const ranScripts = prepared.preRequest.trim() !== "" || prepared.tests.trim() !== "";
      try {
        const result = await sendHttp(outgoing, requestId);
        const tested = runScript({
          code: prepared.tests,
          phase: "test",
          request: pre.request,
          environment: pre.environment,
          collection: pre.collection,
          locals: pre.locals,
          hasEnvironment: scopes.hasEnvironment,
          hasCollection: scopes.hasCollection,
          response: {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
            body: result.body,
            timeMs: result.timeMs,
          },
        });
        persistScriptVars(scopes, tested.environment, tested.collection);
        const scripts: ScriptReport | undefined = ranScripts
          ? { logs: [...pre.logs, ...tested.logs], tests: tested.tests, testError: tested.error }
          : undefined;
        updateTab(tabId, (item) =>
          item.requestId === requestId ? { ...item, requestId: null, send: { phase: "done", result, scripts } } : item,
        );
        recordHistory(request, outgoing.url, result.status, result.timeMs);
      } catch (error) {
        const message = errorMessage(error);
        const scripts: ScriptReport | undefined = ranScripts
          ? { logs: pre.logs, tests: [], testError: null }
          : undefined;
        updateTab(tabId, (item) =>
          item.requestId === requestId ? { ...item, requestId: null, send: { phase: "error", message, scripts } } : item,
        );
        if (message !== "Request cancelled.") recordHistory(request, outgoing.url, null, null);
      }
    },
    [importCurl, persistScriptVars, recordHistory, scriptScopes, updateTab],
  );

  const cancel = useCallback(() => {
    const current = tabsRef.current.find((item) => item.id === activeRef.current);
    if (current?.requestId) void cancelHttp(current.requestId);
  }, []);

  const copy = useCallback(
    async (text: string, what: string) => {
      notify((await copyText(text)) ? `${what} copied` : "Could not copy to the clipboard");
    },
    [notify],
  );

  const toggleSidebar = useCallback(() => setPrefs((value) => ({ ...value, sidebar: !value.sidebar })), []);

  const saveTab = useCallback(
    (tabId: string) => {
      const current = tabsRef.current.find((item) => item.id === tabId);
      if (!current || current.kind !== "request") return;
      const node = current.savedId ? workspaceRef.current.nodes[current.savedId] : undefined;
      if (node?.request) {
        setWorkspace((ws) => patchNode(ws, node.id, { request: current.request }));
        notify(`Saved “${node.name}”`);
      } else {
        setSaving(tabId);
      }
    },
    [notify],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "enter") {
        event.preventDefault();
        if (activeRef.current) void send(activeRef.current);
      } else if (key === "t") {
        event.preventDefault();
        openTab();
      } else if (key === "l") {
        event.preventDefault();
        urlRef.current?.focus();
        urlRef.current?.select();
      } else if (key === "s") {
        event.preventDefault();
        if (activeRef.current) saveTab(activeRef.current);
      } else if (key === "b") {
        event.preventDefault();
        toggleSidebar();
      } else if (key === "f" && searchRef.current) {
        event.preventDefault();
        searchRef.current.focus();
        searchRef.current.select();
      } else if (key === ",") {
        event.preventDefault();
        setSettingsSection("general");
        setSettingsOpen(true);
      } else if (key === "/") {
        event.preventDefault();
        setSettingsSection("shortcuts");
        setSettingsOpen(true);
      } else if (key === "w" && !event.shiftKey && !event.altKey && !event.repeat) {
        event.preventDefault();
        const id = activeRef.current;
        if (!id || !tabsRef.current.some((item) => item.id === id)) {
          void closeWindow();
          return;
        }
        quitWhenEmpty.current = true;
        askClose([id]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askClose, openTab, saveTab, send, toggleSidebar]);

  useEffect(() => {
    if (!prefs.autosave || !tab || tab.kind !== "request" || !tab.savedId) return;
    const savedId = tab.savedId;
    const request = tab.request;
    const timer = window.setTimeout(() => {
      const node = workspaceRef.current.nodes[savedId];
      if (!node?.request || sameRequest(node.request, request)) return;
      setWorkspace((ws) => patchNode(ws, savedId, { request }));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [prefs.autosave, tab]);

  useEffect(() => {
    setTabState((state) => {
      if (!state.tabs.some((item) => item.kind === "settings")) return state;
      const next = state.tabs.filter((item) => item.kind !== "settings");
      const activeId = next.some((item) => item.id === state.active) ? state.active : (next[next.length - 1]?.id ?? null);
      return { tabs: next, active: activeId };
    });
  }, []);

  useEffect(() => {
    if (!quitWhenEmpty.current) return;
    if (closeQueue.length > 0 || saving) return;
    quitWhenEmpty.current = false;
    if (tabs.length === 0) void closeWindow();
  }, [tabs.length, closeQueue.length, saving]);

  const openHistory = useCallback(
    (entry: HistoryEntry) => {
      const request = structuredClone(entry.request);
      const current = tabsRef.current.find((item) => item.id === activeRef.current);
      if (current && isBlank(current)) {
        updateTab(current.id, (item) => ({ ...newTab(request), id: item.id }));
      } else {
        openTab(request);
      }
    },
    [openTab, updateTab],
  );

  const openSaved = useCallback(
    (id: string, inNewTab = false) => {
      const node = workspaceRef.current.nodes[id];
      if (!node?.request) return;
      const existing = tabsRef.current.find((item) => item.kind === "request" && item.savedId === id);
      if (existing) {
        setTabState((state) => ({ ...state, active: existing.id }));
        return;
      }
      const current = tabsRef.current.find((item) => item.id === activeRef.current);
      if (!inNewTab && current && isBlank(current)) {
        updateTab(current.id, (item) => ({ ...newTab(node.request, id), id: item.id }));
      } else {
        openTab(node.request, id);
      }
    },
    [openTab, updateTab],
  );

  const openSettings = useCallback(() => {
    setSettingsSection("general");
    setSettingsOpen(true);
  }, []);

  const deleteEnvironment = useCallback((id: string) => {
    setEnvironments((current) => ({
      activeId: current.activeId === id ? null : current.activeId,
      items: current.items.filter((item) => item.id !== id),
    }));
    setTabState((state) => {
      const next = state.tabs.filter((item) => !(item.kind === "environment" && item.savedId === id));
      const activeId = next.some((item) => item.id === state.active) ? state.active : (next[next.length - 1]?.id ?? null);
      return { tabs: next, active: activeId };
    });
  }, []);

  const openPage = useCallback((kind: "collection" | "environment", targetId: string) => {
    setTabState((state) => {
      const existing = state.tabs.find((item) => item.kind === kind && item.savedId === targetId);
      if (existing) return state.active === existing.id ? state : { ...state, active: existing.id };
      const created = newTab(emptyRequest(), targetId, kind);
      return { tabs: [...state.tabs, created], active: created.id };
    });
  }, []);

  const treeActions = useMemo<TreeActions>(
    () => ({
      open: openSaved,
      toggle: (id) => setWorkspace((ws) => patchNode(ws, id, { open: !ws.nodes[id]?.open })),
      rename: (id, name) => setWorkspace((ws) => patchNode(ws, id, { name })),
      add: (parent, kind) => {
        const { ws, id } = addNode(
          workspaceRef.current,
          parent,
          kind,
          NEW_NAMES[kind],
          kind === "request"
            ? { ...emptyRequest(), auth: { ...emptyAuth(), kind: parent ? "inherit" : "none" } }
            : undefined,
        );
        workspaceRef.current = ws;
        setWorkspace(ws);
        setPrefs((value) => (value.panel === "collections" && value.sidebar ? value : { ...value, panel: "collections", sidebar: true }));
        setFilter("");
        if (kind === "request") openSaved(id);
        setRenaming(id);
      },
      duplicate: (id) => {
        const { ws, id: created } = duplicateNode(workspaceRef.current, id);
        workspaceRef.current = ws;
        setWorkspace(ws);
        setRenaming(created);
      },
      remove: (id) => {
        const { ws, removed } = removeNode(workspaceRef.current, id);
        const gone = new Set(removed);
        setWorkspace(ws);
        setTabState((state) => {
          const next = state.tabs.flatMap((item) => {
            if (!item.savedId || !gone.has(item.savedId)) return [item];
            if (item.kind === "request") return [{ ...item, savedId: null }];
            return [];
          });
          const activeId = next.some((item) => item.id === state.active) ? state.active : (next[next.length - 1]?.id ?? null);
          return { tabs: next, active: activeId };
        });
      },
      move: (id, target, position) => setWorkspace((ws) => moveNode(ws, id, target, position)),
      openCollection: (id) => openPage("collection", id),
      askRemove: (id) => {
        const node = workspaceRef.current.nodes[id];
        if (node?.kind === "collection") setPendingDelete({ kind: "collection", id, name: node.name });
      },
    }),
    [openPage, openSaved],
  );

  const importDocument = useCallback(
    (text: string) => {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        notify("That file is not valid JSON.");
        return;
      }
      const imported = parsePostman(data);
      if (imported.type === "collection") {
        const next = addImportedCollection(workspaceRef.current, imported);
        workspaceRef.current = next;
        setWorkspace(next);
        setPrefs((value) => ({ ...value, panel: "collections", sidebar: true }));
        notify(`Imported “${imported.name}”`);
        return;
      }
      if (imported.type === "environment") {
        const id = newId();
        setEnvironments((current) => ({
          activeId: current.activeId ?? id,
          items: [...current.items, { id, name: imported.name, values: imported.values }],
        }));
        setPrefs((value) => ({ ...value, envsOpen: true, sidebar: true }));
        openPage("environment", id);
        notify(`Imported environment “${imported.name}”`);
        return;
      }
      notify(imported.message);
    },
    [notify, openPage],
  );

  const chooseImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void file.text().then(importDocument);
    };
    input.click();
  }, [importDocument]);

  const finishSave = useCallback(
    (name: string, target: { parent: string } | { newCollection: string }) => {
      const tabId = saving;
      const current = tabsRef.current.find((item) => item.id === tabId);
      setSaving(null);
      if (!current) return;
      let ws = workspaceRef.current;
      let parent: string;
      if ("newCollection" in target) {
        const created = addNode(ws, null, "collection", target.newCollection);
        ws = created.ws;
        parent = created.id;
      } else {
        parent = target.parent;
      }
      const added = addNode(ws, parent, "request", name, current.request);
      ws = revealNode(added.ws, added.id);
      workspaceRef.current = ws;
      setWorkspace(ws);
      updateTab(current.id, (item) => ({ ...item, savedId: added.id, name: null }));
      setPrefs((value) => ({ ...value, panel: "collections" }));
      notify(`Saved “${name}”`);
      if (closeQueueRef.current.includes(current.id)) {
        closeTabs([current.id]);
        setCloseQueue((queue) => queue.filter((id) => id !== current.id));
      }
    },
    [closeTabs, notify, saving, updateTab],
  );

  const summaries = useMemo(
    () =>
      tabs.map((item) => {
        if (item.kind === "settings") {
          return { id: item.id, kind: item.kind, method: item.request.method, title: "Settings", sending: false, dirty: false };
        }
        if (item.kind === "environment") {
          const environment = environments.items.find((entry) => entry.id === item.savedId);
          return {
            id: item.id,
            kind: item.kind,
            method: item.request.method,
            title: environment?.name ?? "Environment",
            sending: false,
            dirty: false,
          };
        }
        const node = item.savedId ? workspace.nodes[item.savedId] : undefined;
        return {
          id: item.id,
          kind: item.kind,
          method: item.request.method,
          title: item.kind === "collection" ? (node?.name ?? "Collection") : node ? node.name : (item.name ?? requestTitle(item.request)),
          sending: item.send.phase === "sending",
          dirty: item.kind === "request" && node?.request ? !sameRequest(node.request, item.request) : false,
        };
      }),
    [environments.items, tabs, workspace],
  );

  function paintSplit(split: number) {
    if (requestPaneRef.current) requestPaneRef.current.style.flex = `${split} 1 0px`;
    if (responsePaneRef.current) responsePaneRef.current.style.flex = `${1 - split} 1 0px`;
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    const container = splitRef.current;
    if (!container) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "row-resize";
    let latest = prefs.split;
    const apply = (clientY: number) => {
      const rect = container.getBoundingClientRect();
      const bar = handle.offsetHeight || 8;
      const usable = Math.max(1, rect.height - bar);
      const min = Math.min(0.35, 88 / usable);
      const ratio = (clientY - rect.top - bar / 2) / usable;
      latest = Math.min(1 - min, Math.max(min, ratio));
      paintSplit(latest);
    };
    const move = (moveEvent: PointerEvent) => apply(moveEvent.clientY);
    const stop = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      setPrefs((value) => ({ ...value, split: latest }));
    };
    apply(event.clientY);
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  }

  const choices = useMemo(() => {
    const list: VariableChoice[] = [];
    const nodeId = tab?.savedId && workspace.nodes[tab.savedId] ? tab.savedId : null;
    const collection = nodeId ? ancestors(workspace, nodeId).find((node) => node.kind === "collection") : undefined;
    for (const row of collection?.variables ?? []) {
      if (row.enabled && row.key.trim()) list.push({ name: row.key.trim(), value: row.value, scope: "Collection" });
    }
    const environment = environments.items.find((item) => item.id === environments.activeId);
    for (const row of environment?.values ?? []) {
      if (row.enabled && row.key.trim()) list.push({ name: row.key.trim(), value: row.value, scope: "Environment" });
    }
    return list;
  }, [environments, tab?.savedId, workspace]);

  const requestTab = tab?.kind === "request" ? tab : null;
  const request = requestTab ? requestTab.request : emptyRequest();
  const savedNode = requestTab?.savedId ? workspace.nodes[requestTab.savedId] : undefined;
  const crumbs = savedNode ? ancestors(workspace, savedNode.id).slice(0, -1).map((node) => node.name) : [];
  const activeSummary = requestTab ? summaries.find((item) => item.id === requestTab.id) : undefined;
  const collectionNode = tab?.kind === "collection" && tab.savedId ? workspace.nodes[tab.savedId] : undefined;
  const environment = tab?.kind === "environment" ? environments.items.find((item) => item.id === tab.savedId) : undefined;

  return (
    <VariableChoices.Provider value={choices}>
    <div
      className="flex h-full min-h-0 flex-col bg-app text-fg"
      onContextMenu={(event) => event.preventDefault()}
    >
      {isMac && inDesktop() ? (
        <div data-tauri-drag-region className="relative h-7 shrink-0 border-b border-line bg-panel">
          <p data-tauri-drag-region className="absolute inset-0 flex items-center justify-center text-[13px] font-medium text-fg">
            SoftNet v{version}
          </p>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
      <Sidebar
        open={prefs.sidebar}
        history={history}
        filter={filter}
        onFilter={setFilter}
        collections={
          <CollectionTree
            workspace={workspace}
            filter={filter}
            activeId={tab?.kind === "environment" ? null : (tab?.savedId ?? null)}
            renaming={renaming}
            onRenaming={setRenaming}
            actions={treeActions}
          />
        }
        onNewCollection={() => treeActions.add(null, "collection")}
        onImport={chooseImport}
        onToggle={toggleSidebar}
        onNew={() => openTab()}
        onOpen={openHistory}
        onRemove={(id) => setHistory((list) => list.filter((entry) => entry.id !== id))}
        onClear={() => setHistory([])}
        environments={environments.items.map((item) => ({ id: item.id, name: item.name }))}
        activeEnvironment={environments.activeId}
        openEnvironment={tab?.kind === "environment" ? tab.savedId : null}
        envsOpen={prefs.envsOpen}
        onEnvsOpen={(envsOpen) => setPrefs((value) => ({ ...value, envsOpen }))}
        onOpenEnvironment={(id) => openPage("environment", id)}
        onNewEnvironment={() => {
          const id = newId();
          setEnvironments((current) => ({
            activeId: id,
            items: [...current.items, { id, name: "New environment", values: [] }],
          }));
          setPrefs((value) => ({ ...value, envsOpen: true }));
          openPage("environment", id);
        }}
        onUseEnvironment={(id) => setEnvironments((current) => ({ ...current, activeId: id }))}
        onDeleteEnvironment={(id) => {
          const item = environments.items.find((entry) => entry.id === id);
          if (item) setPendingDelete({ kind: "environment", id: item.id, name: item.name });
        }}
        onRenameEnvironment={(id, name) =>
          setEnvironments((current) => ({
            ...current,
            items: current.items.map((item) => (item.id === id ? { ...item, name } : item)),
          }))
        }
        settingsActive={settingsOpen}
        onOpenSettings={openSettings}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TabBar
          tabs={summaries}
          active={active}
          onSelect={(id) => setTabState((state) => ({ ...state, active: id }))}
          onClose={(id) => askClose([id])}
          onCloseTabs={askClose}
          onDuplicate={duplicateTab}
          onNew={() => openTab()}
          onRename={(id, name) => {
            const current = tabsRef.current.find((item) => item.id === id);
            if (!current || current.kind !== "request") return;
            const node = current.savedId ? workspaceRef.current.nodes[current.savedId] : undefined;
            if (node?.kind === "request") setWorkspace((ws) => patchNode(ws, node.id, { name }));
            else updateTab(id, (item) => ({ ...item, name }));
          }}
        />
        {!tab ? (
          <EmptyCanvas onNew={() => openTab()} />
        ) : tab.kind === "collection" ? (
          collectionNode?.kind === "collection" ? (
            <CollectionPage
              key={collectionNode.id}
              name={collectionNode.name}
              description={collectionNode.description ?? ""}
              auth={collectionNode.auth ?? emptyAuth()}
              rows={collectionNode.variables ?? []}
              onRename={(name) => treeActions.rename(collectionNode.id, name)}
              onDescription={(description) => setWorkspace((ws) => patchNode(ws, collectionNode.id, { description }))}
              onAuth={(auth) => setWorkspace((ws) => patchNode(ws, collectionNode.id, { auth }))}
              onChange={(variables) => setWorkspace((ws) => patchNode(ws, collectionNode.id, { variables }))}
            />
          ) : (
            <EmptyCanvas onNew={() => openTab()} />
          )
        ) : tab.kind === "environment" ? (
          environment ? (
            <EnvironmentPage
              name={environment.name}
              rows={environment.values}
              active={environments.activeId === environment.id}
              onRename={(name) =>
                setEnvironments((current) => ({
                  ...current,
                  items: current.items.map((item) => (item.id === environment.id ? { ...item, name } : item)),
                }))
              }
              onChange={(values) =>
                setEnvironments((current) => ({
                  ...current,
                  items: current.items.map((item) => (item.id === environment.id ? { ...item, values } : item)),
                }))
              }
              onUse={() =>
                setEnvironments((current) => ({
                  ...current,
                  activeId: current.activeId === environment.id ? null : environment.id,
                }))
              }
              onDelete={() => setPendingDelete({ kind: "environment", id: environment.id, name: environment.name })}
            />
          ) : (
            <EmptyCanvas onNew={() => openTab()} />
          )
        ) : tab.kind === "settings" ? (
          <EmptyCanvas onNew={() => openTab()} />
        ) : (
        <div className="flex min-h-0 flex-1 flex-col bg-panel">
          <UrlBar
            ref={urlRef}
            method={request.method}
            url={request.url}
            sending={tab.send.phase === "sending"}
            error={tab.urlError}
            crumbs={crumbs}
            name={savedNode?.name ?? tab.name ?? requestTitle(request)}
            saved={!!savedNode}
            dirty={activeSummary?.dirty ?? false}
            onSave={() => saveTab(tab.id)}
            onRename={(name) => {
              if (savedNode) treeActions.rename(savedNode.id, name);
              else updateTab(tab.id, (item) => ({ ...item, name }));
            }}
            extra={<EnvironmentPicker value={environments} onChange={setEnvironments} />}
            onMethod={(method) => updateRequest((value) => ({ ...value, method }))}
            onUrl={(url) => {
              updateTab(tab.id, (item) => ({
                ...item,
                urlError: null,
                request: looksLikeCurl(url)
                  ? { ...item.request, url }
                  : { ...item.request, url, params: syncParamsFromUrl(url, item.request.params) },
              }));
            }}
            onCurl={(command) => importCurl(tab.id, command)}
            onSend={() => void send(tab.id)}
            onCancel={cancel}
            onCopyCurl={() => {
              if (!request.url.trim()) {
                notify("Enter a URL first");
                return;
              }
              const auth = effectiveAuth(workspace, tab.savedId, request.auth).auth;
              void copy(toCurl(buildOutgoing(applyVariables({ ...request, auth }, valuesFor(tab.savedId)))), "cURL command");
            }}
          />
          <div ref={splitRef} className="flex min-h-0 flex-1 flex-col">
            <section
              ref={requestPaneRef}
              aria-label="Request"
              className="flex min-h-0 flex-col overflow-hidden"
              style={{ flex: `${prefs.split} 1 0px` }}
            >
              <div className="flex h-8 shrink-0 items-stretch border-b border-line px-3">
                <Tabs
                  label="Request"
                  idPrefix="request"
                  value={tab.editor}
                  onChange={(editor) => updateTab(tab.id, (item) => ({ ...item, editor }))}
                  tabs={[
                    { id: "params", label: "Params", count: countActive(request.params) },
                    { id: "auth", label: "Auth", dot: request.auth.kind !== "none" },
                    { id: "headers", label: "Headers", count: countActive(request.headers) },
                    { id: "body", label: "Body", dot: request.bodyKind !== "none" },
                    { id: "scripts", label: "Scripts", dot: request.preRequest.trim() !== "" || request.tests.trim() !== "" },
                  ]}
                />
              </div>
              <div
                id="request-panel"
                role="tabpanel"
                aria-labelledby={`request-tab-${tab.editor}`}
                className="min-h-0 flex-1 overflow-auto"
              >
                {tab.editor === "params" ? (
                  <KeyValueEditor
                    key={`${tab.id}-params`}
                    label="Query params"
                    rows={request.params}
                    onChange={(params: KvRow[]) =>
                      updateRequest((value) => ({ ...value, params, url: applyParams(value.url, params) }))
                    }
                  />
                ) : null}
                {tab.editor === "auth" ? (
                  <AuthEditor
                    auth={request.auth}
                    allowInherit={Boolean(tab.savedId)}
                    parentName={effectiveAuth(workspace, tab.savedId, { ...request.auth, kind: "inherit" }).parentName}
                    onChange={(auth) => updateRequest((value) => ({ ...value, auth }))}
                  />
                ) : null}
                {tab.editor === "headers" ? (
                  <KeyValueEditor
                    key={`${tab.id}-headers`}
                    label="Headers"
                    keyPlaceholder="Header"
                    rows={request.headers}
                    onChange={(headers) => updateRequest((value) => ({ ...value, headers }))}
                  />
                ) : null}
                {tab.editor === "body" ? (
                  <BodyEditor
                    kind={request.bodyKind}
                    text={request.bodyText}
                    formFields={request.formFields}
                    onKind={(bodyKind) => updateRequest((value) => ({ ...value, bodyKind }))}
                    onText={(bodyText) => updateRequest((value) => ({ ...value, bodyText }))}
                    onForm={(formFields) => updateRequest((value) => ({ ...value, formFields }))}
                  />
                ) : null}
                {tab.editor === "scripts" ? (
                  <ScriptEditor
                    phase={tab.script}
                    preRequest={request.preRequest}
                    tests={request.tests}
                    onPhase={(script) => updateTab(tab.id, (item) => ({ ...item, script }))}
                    onPreRequest={(preRequest) => updateRequest((value) => ({ ...value, preRequest }))}
                    onTests={(tests) => updateRequest((value) => ({ ...value, tests }))}
                  />
                ) : null}
              </div>
            </section>
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize request and response"
              aria-valuemin={15}
              aria-valuemax={85}
              aria-valuenow={Math.round(prefs.split * 100)}
              tabIndex={0}
              onPointerDown={startResize}
              onDoubleClick={() => setPrefs((value) => ({ ...value, split: 0.45 }))}
              onKeyDown={(event) => {
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  const delta = event.key === "ArrowUp" ? -0.04 : 0.04;
                  setPrefs((value) => ({ ...value, split: Math.min(0.85, Math.max(0.15, value.split + delta)) }));
                }
              }}
              className="group relative z-20 h-px shrink-0 cursor-row-resize bg-line hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className="absolute inset-x-0 -top-1 -bottom-1" />
            </div>
            <div ref={responsePaneRef} className="flex min-h-0 flex-col overflow-hidden" style={{ flex: `${1 - prefs.split} 1 0px` }}>
              <ResponsePane ref={searchRef} state={tab.send} onCopy={copy} />
            </div>
          </div>
        </div>
        )}
    </main>
      </div>
      </div>
      <footer aria-hidden="true" className="h-[22px] shrink-0 border-t border-line bg-app" />
      {saving && requestTab ? (
        <SaveDialog
          workspace={workspace}
          initialName={
            tabs.find((item) => item.id === saving)?.name ||
            requestTitle(tabs.find((item) => item.id === saving)?.request ?? request)
          }
          onCancel={() => setSaving(null)}
          onSave={finishSave}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsDialog
          key={settingsSection}
          theme={prefs.theme}
          autosave={prefs.autosave}
          initialSection={settingsSection}
          onTheme={(theme) => setPrefs((value) => ({ ...value, theme }))}
          onAutosave={(autosave) => setPrefs((value) => ({ ...value, autosave }))}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {closeQueue.length > 0 && !saving ? (
        <SaveDiscardDialog
          name={summaries.find((item) => item.id === closeQueue[0])?.title ?? "this request"}
          onCancel={() => {
            quitWhenEmpty.current = false;
            setCloseQueue([]);
          }}
          onDiscard={() => {
            const id = closeQueue[0];
            closeTabs([id]);
            setCloseQueue((queue) => queue.filter((item) => item !== id));
          }}
          onSave={() => {
            const id = closeQueue[0];
            const current = tabsRef.current.find((item) => item.id === id);
            const node = current?.savedId ? workspaceRef.current.nodes[current.savedId] : undefined;
            if (current && node?.request) {
              setWorkspace((ws) => patchNode(ws, node.id, { request: current.request }));
              closeTabs([id]);
              setCloseQueue((queue) => queue.filter((item) => item !== id));
              return;
            }
            setSaving(id);
          }}
        />
      ) : null}
      {pendingDelete ? (
        <ConfirmDialog
          title={pendingDelete.kind === "collection" ? "Delete collection" : "Delete environment"}
          message={`Do you want to delete “${pendingDelete.name}”?`}
          confirmLabel="Delete"
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            if (pendingDelete.kind === "collection") treeActions.remove(pendingDelete.id);
            else deleteEnvironment(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      ) : null}
      {toast ? (
        <div
          key={toast.id}
          role="status"
          className="toast-in pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2 rounded-md bg-fg px-3 py-1.5 text-[13px] text-panel shadow-lg"
        >
          {toast.text}
        </div>
      ) : null}
    </div>
    </VariableChoices.Provider>
  );
}

export default App;
