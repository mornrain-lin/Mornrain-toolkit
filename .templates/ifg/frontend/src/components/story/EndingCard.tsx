import type { EndingType } from "@/engine/types";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export function EndingCard({ endingType, text, locked }: { endingType: EndingType; text?: string; locked?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className="relative w-full max-w-lg overflow-hidden rounded-2xl px-8 py-10 text-center backdrop-blur-md"
      style={{
        background: "var(--ifg-ending-bg)",
        border: "1px solid var(--ifg-ending-border)",
        color: "var(--ifg-ending-fg)",
        boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
      }}
    >
      {/* 顶部 accent 装饰线 */}
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: "linear-gradient(90deg, transparent, var(--ifg-accent), transparent)" }}
      />
      <Badge
        className="mb-4 px-3 py-1 text-[13px] tracking-widest"
        style={{ background: "var(--ifg-accent)", borderColor: "transparent", color: "#0b0b0b" }}
      >
        {t(`ending.${endingType}`)}
      </Badge>
      <p className="text-lg leading-loose">{locked ? t("ending.locked") : text}</p>
    </div>
  );
}
