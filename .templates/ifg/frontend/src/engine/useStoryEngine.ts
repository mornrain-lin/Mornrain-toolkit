import { useContext, useMemo } from "react";
import { StoryContext } from "./StoryContext";
import { evalCondition } from "./conditions";
import type { Choice, SaveData, Settings, StoryNode } from "./types";
import { loadSaves, writeSave } from "./storage";

export function useStoryEngine() {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error("useStoryEngine 必须在 <StoryProvider> 内使用");
  const { state, dispatch } = ctx;

  const currentNode: StoryNode | undefined =
    state.tree && state.currentNodeId ? state.tree.nodes[state.currentNodeId] : undefined;

  // 条件过滤后的可选项（任何节点只要带 choices 即为决策点，选项内嵌于该幕视频）
  const availableChoices: Choice[] = useMemo(() => {
    if (!currentNode?.choices) return [];
    const evalCtx = { variables: state.variables, inventory: state.inventory, visited: state.visited };
    return currentNode.choices.filter((c) => evalCondition(c.condition, evalCtx));
  }, [currentNode, state.variables, state.inventory, state.visited]);

  const actions = useMemo(() => ({
    start: () => dispatch({ type: "START" }),
    restart: () => dispatch({ type: "RESTART" }),
    advance: () => { if (currentNode?.next) dispatch({ type: "GOTO", nodeId: currentNode.next }); },
    choose: (choice: Choice) => dispatch({ type: "GOTO", nodeId: choice.next, effects: choice.effects }),
    back: () => dispatch({ type: "BACK" }),
    updateSettings: (settings: Settings) => dispatch({ type: "UPDATE_SETTINGS", settings }),
    loadSave: (save: SaveData) => dispatch({ type: "LOAD_SAVE", save }),
    saveTo: (slot: number, name: string) => {
      if (!state.tree || !state.currentNodeId) return;
      const save: SaveData = {
        slot, name, savedAt: Date.now(),
        currentNodeId: state.currentNodeId, variables: state.variables, inventory: state.inventory,
        visited: state.visited, backlog: state.backlog, history: state.history,
      };
      writeSave(state.tree.meta, save);
    },
    listSaves: (): Record<number, SaveData> => (state.tree ? loadSaves(state.tree.meta) : {}),
  }), [dispatch, currentNode, state]);

  return { state, currentNode, availableChoices, actions };
}
