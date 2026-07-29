import { useEffect } from "react";
import { motion, useAnimationControls } from "framer-motion";
import type { ReactNode } from "react";
import { useFx } from "@/engine/fx";

/**
 * 打击感特效包裹层：对内容施加 shake/zoom-punch/slowmo，并在顶层渲染 flash/vignette/sparkle。
 * 由 FxProvider 的 useFx().visual 驱动。
 */
export function StageFx({ children }: { children: ReactNode }) {
  const { visual } = useFx();
  const controls = useAnimationControls();
  const fx = visual.fx;

  useEffect(() => {
    if (fx.length === 0) return;
    if (fx.includes("shake-heavy")) controls.start({ x: [0, -14, 12, -8, 6, 0], y: [0, 8, -6, 4, 0, 0], transition: { duration: 0.5 } });
    else if (fx.includes("shake-light")) controls.start({ x: [0, -6, 5, -3, 0], transition: { duration: 0.35 } });
    if (fx.includes("zoom-punch")) controls.start({ scale: [1, 1.06, 1], transition: { duration: 0.35 } });
    if (fx.includes("slowmo")) controls.start({ filter: ["saturate(1)", "saturate(1.4)", "saturate(1)"], transition: { duration: 0.6 } });
  }, [visual.nonce, fx, controls]);

  return (
    <motion.div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" animate={controls}>
      {children}
      {fx.includes("flash") && (
        <motion.div key={`flash-${visual.nonce}`} className="pointer-events-none absolute inset-0 z-40 bg-white"
          initial={{ opacity: 0.85 }} animate={{ opacity: 0 }} transition={{ duration: 0.4 }} />
      )}
      {fx.includes("vignette") && (
        <motion.div key={`vig-${visual.nonce}`} className="pointer-events-none absolute inset-0 z-40"
          style={{ boxShadow: "inset 0 0 160px 60px rgba(0,0,0,0.7)" }}
          initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 0.7 }} />
      )}
      {fx.includes("sparkle") && (
        <div key={`spk-${visual.nonce}`} className="pointer-events-none absolute inset-0 z-40">
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.span key={i} className="absolute h-1.5 w-1.5 rounded-full bg-amber-300"
              style={{ left: `${10 + Math.random() * 80}%`, top: `${20 + Math.random() * 60}%` }}
              initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1.4, 0] }}
              transition={{ duration: 0.6, delay: Math.random() * 0.2 }} />
          ))}
        </div>
      )}
    </motion.div>
  );
}
