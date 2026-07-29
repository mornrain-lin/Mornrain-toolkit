import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Fx } from "./types";
import { playSfx } from "./sfx";

/** 视觉类 fx（在 FxLayer 渲染） */
export type ScreenFx =
  | "shake-light" | "shake-heavy" | "flash" | "vignette" | "zoom-punch" | "slowmo" | "sparkle";

const SCREEN_FX: ReadonlySet<string> = new Set<ScreenFx>([
  "shake-light", "shake-heavy", "flash", "vignette", "zoom-punch", "slowmo", "sparkle",
]);

export interface FxState { fx: ScreenFx[]; nonce: number }
interface FxContextValue {
  visual: FxState;
  runFx: (names?: (Fx | string)[], sfxVolume?: number) => void;
}
const FxContext = createContext<FxContextValue | null>(null);

/** 视觉 fx 自动清除时长(ms) */
const FX_DURATION = 700;

export function FxProvider({ children }: { children: ReactNode }) {
  const [visual, setVisual] = useState<FxState>({ fx: [], nonce: 0 });
  const timer = useRef<number | null>(null);

  const runFx = useCallback((names?: (Fx | string)[], sfxVolume = 0.8) => {
    if (!names || names.length === 0) return;
    const screen: ScreenFx[] = [];
    for (const n of names) {
      if (n.startsWith("sfx:")) { playSfx(n.slice(4), sfxVolume); continue; }
      if (n === "haptic-light") { navigator.vibrate?.(20); continue; }
      if (n === "haptic-medium") { navigator.vibrate?.(60); continue; }
      if (SCREEN_FX.has(n)) screen.push(n as ScreenFx);
    }
    if (screen.length === 0) return;
    setVisual((v) => ({ fx: screen, nonce: v.nonce + 1 }));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisual((v) => ({ fx: [], nonce: v.nonce })), FX_DURATION);
  }, []);

  const value = useMemo(() => ({ visual, runFx }), [visual, runFx]);
  return <FxContext.Provider value={value}>{children}</FxContext.Provider>;
}

export function useFx(): FxContextValue {
  const ctx = useContext(FxContext);
  if (!ctx) throw new Error("useFx 必须在 <FxProvider> 内使用");
  return ctx;
}

export { FX_DURATION };
