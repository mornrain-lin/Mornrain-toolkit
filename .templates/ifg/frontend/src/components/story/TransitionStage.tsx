import { AnimatePresence, motion, type Target, type Transition as MotionTransition } from "framer-motion";
import type { ReactNode } from "react";
import type { Transition } from "@/engine/types";

interface Phase { initial: Target; animate: Target; exit: Target; }

function phases(t: Transition): Phase {
  switch (t) {
    case "slide-up": return { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -40 } };
    case "slide-down": return { initial: { opacity: 0, y: -40 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 40 } };
    case "slide-left": return { initial: { opacity: 0, x: 40 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -40 } };
    case "slide-right": return { initial: { opacity: 0, x: -40 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 40 } };
    case "zoom": return { initial: { opacity: 0, scale: 1.08 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.02 } };
    case "blur": return { initial: { opacity: 0, filter: "blur(12px)" }, animate: { opacity: 1, filter: "blur(0px)" }, exit: { opacity: 0, filter: "blur(12px)" } };
    case "glitch": return { initial: { opacity: 0, x: -6 }, animate: { opacity: 1, x: [6, -4, 2, 0] }, exit: { opacity: 0 } };
    case "ripple": return { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.04 } };
    case "none": return { initial: {}, animate: {}, exit: {} };
    case "fade":
    case "fade-black":
    case "fade-white":
    case "dissolve":
    default: return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
  }
}

interface Props {
  nodeId: string;
  transition?: Transition;
  reduced?: boolean;
  children: ReactNode;
}

export function TransitionStage({ nodeId, transition = "dissolve", reduced, children }: Props) {
  const p = reduced ? { initial: {}, animate: {}, exit: {} } : phases(transition);
  const dur: MotionTransition = reduced ? { duration: 0 } : { duration: transition === "zoom" ? 0.9 : 0.45, ease: "easeOut" };
  const flash = !reduced && (transition === "fade-white");
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.div key={nodeId} className="flex min-h-0 flex-1 flex-col"
          initial={p.initial} animate={p.animate} exit={p.exit} transition={dur}>
          {children}
        </motion.div>
      </AnimatePresence>
      {flash && (
        <motion.div className="pointer-events-none absolute inset-0 z-30 bg-white"
          initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.5 }} key={`flash-${nodeId}`} />
      )}
    </div>
  );
}
