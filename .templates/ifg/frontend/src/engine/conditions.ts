import type { Condition, Variables } from "./types";

export interface EvalContext {
  variables: Variables;
  inventory: string[];
  visited: string[];
}

/** 结构化条件求值。未知结构/未声明符号 → 保守返回 false。无条件 → true。 */
export function evalCondition(cond: Condition | undefined, ctx: EvalContext): boolean {
  if (!cond) return true;
  if ("and" in cond) return cond.and.every((c) => evalCondition(c, ctx));
  if ("or" in cond) return cond.or.some((c) => evalCondition(c, ctx));
  if ("not" in cond) return !evalCondition(cond.not, ctx);
  if (cond.op === "has") return ctx.inventory.includes(cond.item);
  if (cond.op === "visited") return ctx.visited.includes(cond.node);

  const left = ctx.variables[cond.var];
  const right = cond.value;
  switch (cond.op) {
    case "==": return left === right;
    case "!=": return left !== right;
    case ">": return Number(left) > Number(right);
    case ">=": return Number(left) >= Number(right);
    case "<": return Number(left) < Number(right);
    case "<=": return Number(left) <= Number(right);
    default: return false;
  }
}
