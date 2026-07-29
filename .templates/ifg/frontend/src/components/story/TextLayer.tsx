import { useEffect, useState } from "react";
import type { Settings, TextStyle } from "@/engine/types";
import "./skins.css";

const SPEED_MS: Record<Settings["textSpeed"], number> = { slow: 60, normal: 30, fast: 12, instant: 0 };

interface Props {
  text?: string;
  speed: Settings["textSpeed"];
  textStyle?: TextStyle;
  speaker?: string;
}

export function TextLayer({ text, speed, textStyle = "banner", speaker }: Props) {
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (!text) { setShown(""); return; }
    if (speed === "instant") { setShown(text); return; }
    setShown("");
    let i = 0;
    const timer = setInterval(() => {
      i += 1; setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(timer);
    }, SPEED_MS[speed]);
    return () => clearInterval(timer);
  }, [text, speed]);

  if (!text) return null;
  const nameplate = speaker ? <span className="ifg-nameplate">{speaker}</span> : null;

  // bubble：对白气泡卡（左对齐，铭牌置于卡片顶）
  if (textStyle === "bubble") {
    return (
      <div className="px-8 py-3">
        {nameplate && <div className="mb-1.5">{nameplate}</div>}
        <div className="ifg-dialogue text-base">{shown}</div>
      </div>
    );
  }

  // banner / centered：影视字幕——居中、限制阅读宽度、强投影贴合底部渐变，去掉逐行底块保持通透
  const align = speaker ? "text-left" : "text-center";
  const size = textStyle === "centered" ? "text-xl md:text-2xl" : "text-[17px] md:text-lg";
  return (
    <div className="px-6 pb-2">
      <div className={`mx-auto max-w-3xl ${align}`}>
        {nameplate && <div className="mb-1.5">{nameplate}</div>}
        <p
          className={`whitespace-pre-line text-balance leading-relaxed ${size} [text-shadow:_0_1px_2px_rgba(0,0,0,0.95),_0_0_16px_rgba(0,0,0,0.7)]`}
          style={{ color: "var(--ifg-text-fg)" }}
        >
          {shown}
        </p>
      </div>
    </div>
  );
}
