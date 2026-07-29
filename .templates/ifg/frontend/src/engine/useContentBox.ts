import { useEffect, useState, type RefObject } from "react";

export interface ContentBox { left: number; top: number; width: number; height: number; }

/**
 * 计算 object-contain 媒体在容器内实际渲染出的内容框（相对容器左上角，px）。
 * mediaRatio = 宽/高。未知时返回整框（占位态兜底）。
 */
export function useContentBox(
  containerRef: RefObject<HTMLElement | null>,
  mediaRatio: number | null,
): ContentBox {
  const [box, setBox] = useState<ContentBox>({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!mediaRatio || mediaRatio <= 0) { setBox({ left: 0, top: 0, width: cw, height: ch }); return; }
      const containerRatio = cw / ch;
      let w = cw, h = ch;
      if (containerRatio > mediaRatio) { h = ch; w = ch * mediaRatio; }
      else { w = cw; h = cw / mediaRatio; }
      setBox({ left: (cw - w) / 2, top: (ch - h) / 2, width: w, height: h });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, mediaRatio]);

  return box;
}
