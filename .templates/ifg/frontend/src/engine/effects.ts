import type { Effect, Variables } from "./types";

export interface MutableState { variables: Variables; inventory: string[]; }

/** 按序应用效果，返回全新的 variables/inventory（不改入参）。 */
export function applyEffects(state: MutableState, effects?: Effect[]): MutableState {
  if (!effects || effects.length === 0) return state;
  const variables: Variables = { ...state.variables };
  let inventory = [...state.inventory];
  for (const e of effects) {
    switch (e.op) {
      case "set": variables[e.var] = e.value; break;
      case "inc": variables[e.var] = Number(variables[e.var] ?? 0) + (e.value ?? 1); break;
      case "dec": variables[e.var] = Number(variables[e.var] ?? 0) - (e.value ?? 1); break;
      case "add": if (!inventory.includes(e.item)) inventory.push(e.item); break;
      case "remove": inventory = inventory.filter((i) => i !== e.item); break;
    }
  }
  return { variables, inventory };
}
