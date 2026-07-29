import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Point, StoryNode } from "@/engine/types";

/** 手势交互层：完成手势后回调 onComplete。渲染在媒体内容框内，坐标 0~1 相对该框。 */
export function InteractionLayer({ node, onComplete }: { node: StoryNode; onComplete: () => void }) {
  const { t } = useTranslation();
  const kind = node.interaction ?? "tap";
  const done = useRef(false);
  const finish = useCallback(() => { if (!done.current) { done.current = true; onComplete(); } }, [onComplete]);

  switch (kind) {
    case "longpress": return <LongPress prompt={node.prompt ?? t("interaction.longpress")} duration={node.duration ?? 1200} onDone={finish} />;
    case "hold-release": return <HoldRelease prompt={node.prompt ?? t("interaction.holdRelease")} duration={node.duration ?? 1500} onDone={finish} />;
    case "swipe": return <Swipe prompt={node.prompt ?? t("interaction.swipe")} direction={node.direction ?? "up"} onDone={finish} />;
    case "drag": return <Drag prompt={node.prompt ?? t("interaction.drag")} target={node.target ?? { x: 0.5, y: 0.3 }} radius={node.tolerance ?? 0.12} onDone={finish} />;
    case "rotate": return <Rotate prompt={node.prompt ?? t("interaction.rotate")} angle={node.angle ?? 180} tolerance={node.tolerance ?? 15} onDone={finish} />;
    case "rapidtap": return <RapidTap prompt={node.prompt ?? t("interaction.rapidtap")} count={node.count ?? 10} decay={node.decay ?? 0.02} onDone={finish} />;
    case "rhythm": return <Rhythm prompt={node.prompt ?? t("interaction.rhythm")} beats={node.beats ?? [600, 1200, 1800]} window={node.window ?? 320} onDone={finish} />;
    case "trace": return <Trace prompt={node.prompt ?? t("interaction.trace")} points={node.points ?? [{ x: 0.25, y: 0.4 }, { x: 0.75, y: 0.6 }]} tolerance={node.tolerance ?? 0.1} onDone={finish} />;
    case "tap":
    default: return <Tap prompt={node.prompt ?? t("interaction.tap")} onDone={finish} />;
  }
}

/* ---------- 通用 UI ---------- */
function Prompt({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-black/50 px-4 py-1.5 text-sm text-amber-100">
      {text}
    </div>
  );
}
function Ring({ p }: { p: number }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" className="pointer-events-none">
      <circle cx="42" cy="42" r={r} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth="6" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="#c9a24b" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 42 42)" />
    </svg>
  );
}
function useContainerRect() {
  const ref = useRef<HTMLDivElement>(null);
  const rectOf = useCallback((): DOMRect | null => ref.current?.getBoundingClientRect() ?? null, []);
  return { ref, rectOf };
}
const rel = (e: { clientX: number; clientY: number }, rect: DOMRect): Point => ({
  x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height,
});
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/* ---------- 控件 ---------- */
function Tap({ prompt, onDone }: { prompt?: string; onDone: () => void }) {
  return (
    <button type="button" className="pointer-events-auto absolute inset-0 flex items-center justify-center" onClick={onDone}>
      <Prompt text={prompt} />
    </button>
  );
}

function LongPress({ prompt, duration, onDone }: { prompt?: string; duration: number; onDone: () => void }) {
  const [p, setP] = useState(0);
  const raf = useRef(0); const start = useRef(0);
  const stop = () => { cancelAnimationFrame(raf.current); };
  const tick = () => {
    const v = Math.min(1, (performance.now() - start.current) / duration);
    setP(v);
    if (v >= 1) { stop(); onDone(); return; }
    raf.current = requestAnimationFrame(tick);
  };
  const begin = () => { start.current = performance.now(); raf.current = requestAnimationFrame(tick); };
  const end = () => { stop(); setP(0); };
  useEffect(() => stop, []);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center"
      onPointerDown={begin} onPointerUp={end} onPointerLeave={end}>
      <Prompt text={prompt} />
      <Ring p={p} />
    </div>
  );
}

function HoldRelease({ prompt, duration, onDone }: { prompt?: string; duration: number; onDone: () => void }) {
  const [p, setP] = useState(0);
  const raf = useRef(0); const start = useRef(0); const held = useRef(false);
  const tick = () => {
    const v = Math.min(1, (performance.now() - start.current) / duration);
    setP(v); if (held.current) raf.current = requestAnimationFrame(tick);
  };
  const begin = () => { held.current = true; start.current = performance.now(); raf.current = requestAnimationFrame(tick); };
  const end = () => {
    held.current = false; cancelAnimationFrame(raf.current);
    if (p >= 0.8 && p <= 1) onDone(); else setP(0);
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3"
      onPointerDown={begin} onPointerUp={end} onPointerLeave={end}>
      <Prompt text={prompt} />
      <div className="h-3 w-56 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full transition-[width] duration-75"
          style={{ width: `${p * 100}%`, background: p >= 0.8 ? "#7bd88f" : "#c9a24b" }} />
      </div>
    </div>
  );
}

function Swipe({ prompt, direction, onDone }: { prompt?: string; direction: string; onDone: () => void }) {
  const start = useRef<Point | null>(null);
  const TH = 60;
  const down = (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY }; };
  const up = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dx = e.clientX - start.current.x, dy = e.clientY - start.current.y;
    const ok =
      direction === "any" ? Math.hypot(dx, dy) > TH :
      direction === "up" ? -dy > TH && Math.abs(dy) > Math.abs(dx) :
      direction === "down" ? dy > TH && Math.abs(dy) > Math.abs(dx) :
      direction === "left" ? -dx > TH && Math.abs(dx) > Math.abs(dy) :
      dx > TH && Math.abs(dx) > Math.abs(dy);
    start.current = null;
    if (ok) onDone();
  };
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center" onPointerDown={down} onPointerUp={up}>
      <Prompt text={prompt} />
    </div>
  );
}

function Drag({ prompt, target, radius, onDone }: { prompt?: string; target: Point; radius: number; onDone: () => void }) {
  const { ref, rectOf } = useContainerRect();
  const [pos, setPos] = useState<Point>({ x: 0.5, y: 0.85 });
  const dragging = useRef(false);
  const move = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const rect = rectOf(); if (!rect) return;
    const p = rel(e, rect);
    setPos({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) });
    if (dist(p, target) <= radius) { dragging.current = false; setPos(target); onDone(); }
  };
  return (
    <div ref={ref} className="pointer-events-auto absolute inset-0"
      onPointerMove={move} onPointerUp={() => { dragging.current = false; }}>
      <Prompt text={prompt} />
      <div className="absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-300"
        style={{ left: `${target.x * 100}%`, top: `${target.y * 100}%` }} />
      <div className="absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full bg-amber-400/80"
        style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
        onPointerDown={(e) => { dragging.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); }} />
    </div>
  );
}

function Rotate({ prompt, angle, tolerance, onDone }: { prompt?: string; angle: number; tolerance: number; onDone: () => void }) {
  const { ref, rectOf } = useContainerRect();
  const [deg, setDeg] = useState(0);
  const active = useRef(false);
  const move = (e: React.PointerEvent) => {
    if (!active.current) return;
    const rect = rectOf(); if (!rect) return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let a = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
    if (a < 0) a += 360;
    setDeg(a);
    if (Math.abs(a - angle) <= tolerance) { active.current = false; onDone(); }
  };
  return (
    <div ref={ref} className="pointer-events-auto absolute inset-0 flex items-center justify-center"
      onPointerMove={move} onPointerUp={() => { active.current = false; }}>
      <Prompt text={prompt} />
      <div className="h-24 w-24 touch-none rounded-full border-2 border-amber-300/60"
        onPointerDown={(e) => { active.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); }}>
        <div className="mx-auto h-12 w-1 origin-bottom bg-amber-300" style={{ transform: `rotate(${deg}deg)`, marginTop: 0 }} />
      </div>
    </div>
  );
}

function RapidTap({ prompt, count, decay, onDone }: { prompt?: string; count: number; decay: number; onDone: () => void }) {
  const [p, setP] = useState(0);
  const pr = useRef(0);
  useEffect(() => {
    const id = setInterval(() => { pr.current = Math.max(0, pr.current - decay); setP(pr.current); }, 100);
    return () => clearInterval(id);
  }, [decay]);
  const tap = () => {
    pr.current = Math.min(1, pr.current + 1 / count); setP(pr.current);
    if (pr.current >= 1) onDone();
  };
  return (
    <button type="button" className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3" onPointerDown={tap}>
      <Prompt text={prompt} />
      <div className="h-3 w-56 overflow-hidden rounded-full bg-white/20">
        <div className="h-full rounded-full bg-amber-400" style={{ width: `${p * 100}%` }} />
      </div>
    </button>
  );
}

function Rhythm({ prompt, beats, window: win, onDone }: { prompt?: string; beats: number[]; window: number; onDone: () => void }) {
  const t0 = useRef(performance.now());
  const hits = useRef<Set<number>>(new Set());
  const [n, setN] = useState(0);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    t0.current = performance.now();
    const timers = beats.map((b) => window.setTimeout(() => { setPulse(true); window.setTimeout(() => setPulse(false), 180); }, b));
    return () => timers.forEach((t) => clearTimeout(t));
  }, [beats]);
  const tap = () => {
    const t = performance.now() - t0.current;
    const idx = beats.findIndex((b, i) => !hits.current.has(i) && Math.abs(t - b) <= win);
    if (idx >= 0) {
      hits.current.add(idx); setN(hits.current.size);
      if (hits.current.size >= beats.length) onDone();
    }
  };
  return (
    <button type="button" className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3" onPointerDown={tap}>
      <Prompt text={prompt} />
      <div className={`h-16 w-16 rounded-full border-4 ${pulse ? "border-amber-300 scale-110" : "border-white/30"} transition-all`} />
      <div className="text-sm text-amber-100">{n} / {beats.length}</div>
    </button>
  );
}

function Trace({ prompt, points, tolerance, onDone }: { prompt?: string; points: Point[]; tolerance: number; onDone: () => void }) {
  const { ref, rectOf } = useContainerRect();
  const [idx, setIdx] = useState(0);
  const active = useRef(false);
  const move = (e: React.PointerEvent) => {
    if (!active.current || idx >= points.length) return;
    const rect = rectOf(); if (!rect) return;
    if (dist(rel(e, rect), points[idx]) <= tolerance) {
      const next = idx + 1; setIdx(next);
      if (next >= points.length) { active.current = false; onDone(); }
    }
  };
  return (
    <div ref={ref} className="pointer-events-auto absolute inset-0 touch-none"
      onPointerDown={() => { active.current = true; }} onPointerUp={() => { active.current = false; }} onPointerMove={move}>
      <Prompt text={prompt} />
      {points.map((pt, i) => (
        <div key={i}
          className={`absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${i < idx ? "border-green-400 bg-green-400/40" : "border-amber-300"}`}
          style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }}>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white">{i + 1}</span>
        </div>
      ))}
    </div>
  );
}
