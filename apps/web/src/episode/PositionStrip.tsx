import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";
import { formatAusdChange, formatShares } from "./format";
import type { Side } from "./quote";
import { RollingAusd } from "./RollingAusd";

export type Holding = { word: string; side: Side; shares: number };

export type PositionStripProps = {
  /** Words the player holds YES or NO on, in board order. */
  holdings: readonly Holding[];
  /** What those positions cost, 6-decimal AUSD units. */
  costMicro: bigint;
  /** What they are worth at current prices, 6-decimal AUSD units. */
  valueMicro: bigint;
  className?: string;
};

/**
 * The player's whole-episode position at a glance: value (counts when it moves), cost, change and
 * one chip per held word. Lays itself out by its own width, so it reads as a strip on phones and
 * as a compact card in the desktop dock, where it stretches to match the ticket alongside it.
 */
export function PositionStrip({ holdings, costMicro, valueMicro, className }: PositionStripProps) {
  if (holdings.length === 0) {
    return (
      <section
        aria-label="Your position"
        className={`@container flex items-center gap-3 rounded-card border-2 border-dashed border-ink/45 px-4 py-3 ${className ?? ""}`}
      >
        <div className="flex w-full items-center gap-3 @min-[300px]:gap-4 @max-[299px]:flex-col @max-[299px]:text-center">
          <Voxel name="mystery-box" size={64} className="size-14 shrink-0 -rotate-6" />
          <div className="min-w-0 flex-1">
            <p className="font-headline text-[17px] leading-6">No position yet</p>
            <p className="text-[14px] leading-5 text-ink-soft">Tap a word to pick YES or NO.</p>
          </div>
          <TestnetPill />
        </div>
      </section>
    );
  }
  const change = valueMicro - costMicro;
  const words = holdings.length;
  return (
    <section
      aria-label="Your position"
      className={`@container sticker flex flex-col justify-center gap-3 px-4 py-3.5 ${className ?? ""}`}
    >
      <p className="text-[11px] font-extrabold uppercase leading-4 tracking-[0.12em] text-ink-soft">
        Your position · {words} {words === 1 ? "word" : "words"}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <p className="flex items-center gap-2">
          <span className="flex items-baseline gap-1.5">
            <RollingAusd
              micro={valueMicro}
              className="font-headline tabular text-[30px] leading-none @min-[420px]:text-[36px]"
            />
            <span className="text-[13px] font-bold text-ink-soft">AUSD</span>
          </span>
          <TestnetPill />
        </p>
        <p className="flex items-center gap-2 text-[13px] leading-5">
          <span className="tabular text-ink-soft">
            Cost <RollingAusd micro={costMicro} />
          </span>
          <span
            className={`tabular inline-flex h-7 items-center rounded-full px-2.5 text-[13px] font-bold ${change > 0n ? "bg-gain-tint text-gain" : "bg-line/70 text-ink-soft"}`}
          >
            {formatAusdChange(change)}
          </span>
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Held words">
        {holdings.map((holding) => (
          <li
            key={holding.word}
            className="tabular inline-flex h-7 items-center gap-1.5 rounded-full border-2 border-ink bg-paper pr-2.5 pl-1 text-[12px] leading-none"
          >
            <span
              className={`inline-flex h-5 items-center rounded-full px-1.5 text-[10px] font-extrabold tracking-[0.08em] ${holding.side === "yes" ? "bg-ink text-paper" : "bg-line text-ink"}`}
            >
              {holding.side.toUpperCase()}
            </span>
            <span className="font-bold uppercase">{holding.word}</span>
            <span className="text-ink-soft">{formatShares(holding.shares)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
