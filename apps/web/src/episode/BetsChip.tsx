import { Clock3, Lock } from "lucide-react";
import type { BetsView } from "./bets";

const tone: Record<BetsView["tone"], string> = {
  open: "bg-card",
  closing: "bg-sun",
  locked: "bg-paper",
};

/**
 * The bets window as an outlined label (not pressable): a countdown while bets are open, sun in
 * the last ten seconds, a lock once they close.
 */
export function BetsChip({ view, className }: { view: BetsView; className?: string }) {
  const Icon = view.tone === "locked" ? Lock : Clock3;
  return (
    <p
      className={`tabular inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border-2 border-ink px-2.5 text-[11px] font-extrabold uppercase leading-none tracking-[0.1em] text-ink transition-colors duration-180 ease-out lg:h-8 lg:text-[12px] ${tone[view.tone]} ${className ?? ""}`}
    >
      <Icon aria-hidden size={14} strokeWidth={2.75} className="shrink-0" />
      <span className="truncate">{view.caption}</span>
    </p>
  );
}
