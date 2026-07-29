import type { ItemDef } from "@/engine/types";
import { Package } from "lucide-react";

export function InventoryBar({ items, inventory }: { items: ItemDef[]; inventory: string[] }) {
  const owned = items.filter((it) => inventory.includes(it.id));
  if (owned.length === 0) return null;
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2 px-8 py-2">
      {owned.map((it) => (
        <div
          key={it.id}
          title={it.name}
          className="group flex cursor-default items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] font-medium backdrop-blur-md transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5"
          style={{
            background: "var(--ifg-item-bg)",
            border: "1px solid var(--ifg-item-border)",
            color: "var(--ifg-item-fg)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
          }}
        >
          <span
            className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-inset ring-white/10"
            style={{ background: "color-mix(in srgb, var(--ifg-accent) 26%, transparent)" }}
          >
            {it.image ? (
              <img src={it.image} alt="" className="size-full object-cover" />
            ) : (
              <Package className="size-3.5" style={{ color: "var(--ifg-accent)" }} />
            )}
          </span>
          <span className="whitespace-nowrap">{it.name}</span>
        </div>
      ))}
    </div>
  );
}
