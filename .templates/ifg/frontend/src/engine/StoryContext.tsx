import { createContext, useEffect, useReducer, type ReactNode } from "react";
import type {
  BacklogEntry, Effect, SaveData, Settings, StoryConfig, StoryTree, Variables,
} from "./types";
import { applyEffects } from "./effects";
import { loadStory } from "./loader";
import i18n, { normalizeLocale } from "@/i18n";
import {
  DEFAULT_SETTINGS, loadSaves, loadSettings, loadUnlockedEndings,
  unlockEnding, writeSave, writeSettings,
} from "./storage";

export interface EngineState {
  status: "idle" | "loading" | "ready" | "error" | "empty";
  error?: string;
  tree?: StoryTree;
  config?: StoryConfig;
  currentNodeId?: string;
  variables: Variables;
  inventory: string[];
  visited: string[];
  backlog: BacklogEntry[];
  history: string[]; // 用于「返回上一步」
  settings: Settings;
  unlockedEndings: string[];
}

const initialState: EngineState = {
  status: "idle", variables: {}, inventory: [], visited: [],
  backlog: [], history: [], settings: DEFAULT_SETTINGS, unlockedEndings: [],
};

export type EngineAction =
  | { type: "LOADING" }
  | { type: "LOADED"; tree: StoryTree; config: StoryConfig }
  | { type: "EMPTY" }
  | { type: "ERROR"; error: string }
  | { type: "START" }
  | { type: "GOTO"; nodeId: string; effects?: Effect[] }
  | { type: "BACK" }
  | { type: "RESTART" }
  | { type: "LOAD_SAVE"; save: SaveData }
  | { type: "UPDATE_SETTINGS"; settings: Settings };

/**
 * 进入某节点：先应用选项 preEffects，再应用节点 effects，
 * 入栈 history、标记 visited、追加 backlog。
 */
function enterNode(
  state: EngineState, nodeId: string, pushHistory: boolean, preEffects?: Effect[],
): EngineState {
  const tree = state.tree!;
  const node = tree.nodes[nodeId];
  if (!node) return { ...state, status: "error", error: i18n.t("error.nodeNotFound", { nodeId }) };
  const afterChoice = applyEffects({ variables: state.variables, inventory: state.inventory }, preEffects);
  const applied = applyEffects(afterChoice, node.effects);
  const visited = state.visited.includes(nodeId) ? state.visited : [...state.visited, nodeId];
  const backlog: BacklogEntry[] = node.text
    ? [...state.backlog, { nodeId, text: node.text }]
    : state.backlog;
  return {
    ...state,
    currentNodeId: nodeId,
    variables: applied.variables,
    inventory: applied.inventory,
    visited,
    backlog,
    history: pushHistory && state.currentNodeId ? [...state.history, state.currentNodeId] : state.history,
  };
}

export function reducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case "LOADING": return { ...state, status: "loading" };
    case "EMPTY": return { ...state, status: "empty" };
    case "ERROR": return { ...state, status: "error", error: action.error };
    case "LOADED": {
      return {
        ...state, status: "ready",
        tree: action.tree, config: action.config,
        settings: loadSettings(action.tree.meta),
        unlockedEndings: loadUnlockedEndings(action.tree.meta),
      };
    }
    case "START":
    case "RESTART": {
      const tree = state.tree!;
      const reset: EngineState = {
        ...state,
        variables: { ...(tree.variables ?? {}) },
        inventory: [], visited: [], backlog: [], history: [],
        currentNodeId: undefined,
      };
      return enterNode(reset, tree.meta.start, false);
    }
    case "GOTO": return enterNode(state, action.nodeId, true, action.effects);
    case "BACK": {
      if (state.history.length === 0) return state;
      const history = [...state.history];
      const prev = history.pop()!;
      // 回退不重放 effects（简单可预期）：仅切当前节点，回滚 backlog 末项
      const backlog = state.backlog.length ? state.backlog.slice(0, -1) : state.backlog;
      return { ...state, currentNodeId: prev, history, backlog };
    }
    case "LOAD_SAVE": {
      const s = action.save;
      return {
        ...state,
        currentNodeId: s.currentNodeId, variables: s.variables, inventory: s.inventory,
        visited: s.visited, backlog: s.backlog, history: s.history,
      };
    }
    case "UPDATE_SETTINGS": return { ...state, settings: action.settings };
    default: return state;
  }
}

export interface StoryContextValue {
  state: EngineState;
  dispatch: React.Dispatch<EngineAction>;
}
export const StoryContext = createContext<StoryContextValue | null>(null);

export function StoryProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // 启动加载
  useEffect(() => {
    let alive = true;
    dispatch({ type: "LOADING" });
    loadStory()
      .then(({ tree, config }) => {
        if (!alive) return;
        if (!tree) dispatch({ type: "EMPTY" });
        else dispatch({ type: "LOADED", tree, config });
      })
      .catch((e: unknown) => { if (alive) dispatch({ type: "ERROR", error: e instanceof Error ? e.message : String(e) }); });
    return () => { alive = false; };
  }, []);

  // 语言由 story.json 的 config.locale 驱动（缺省 zh-CN），同步 <html lang> 语义
  useEffect(() => {
    const locale = normalizeLocale(state.config?.locale);
    void i18n.changeLanguage(locale);
    document.documentElement.lang = locale;
  }, [state.config?.locale]);

  // 副作用持久化：自动存档 + 结局解锁（reducer 保持纯净）
  useEffect(() => {
    if (state.status !== "ready" || !state.tree || !state.currentNodeId) return;
    const meta = state.tree.meta;
    const node = state.tree.nodes[state.currentNodeId];
    if (state.config?.features?.autosave !== false) {
      writeSave(meta, {
        slot: 0, name: i18n.t("play.autoSave"), savedAt: Date.now(),
        currentNodeId: state.currentNodeId, variables: state.variables, inventory: state.inventory,
        visited: state.visited, backlog: state.backlog, history: state.history,
      });
    }
    if (node?.type === "ending") unlockEnding(meta, state.currentNodeId);
  }, [state.currentNodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 设置变更持久化
  useEffect(() => {
    if (state.status === "ready" && state.tree) writeSettings(state.tree.meta, state.settings);
  }, [state.settings, state.status, state.tree]);

  return <StoryContext.Provider value={{ state, dispatch }}>{children}</StoryContext.Provider>;
}

export { loadSaves };
