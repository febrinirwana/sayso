import { TestnetPill } from "@/ui/TestnetPill";
import { formatAusd, formatAusdChange } from "./format";

type PositionStripProps = {
  /** Words the player holds YES or NO on. */
  words: number;
  /** What those positions cost, 6-decimal AUSD units. */
  costMicro: bigint;
  /** What they are worth at current prices, 6-decimal AUSD units. */
  valueMicro: bigint;
};

/** S3 bottom strip: the player's whole-episode position at a glance. */
export function PositionStrip({ words, costMicro, valueMicro }: PositionStripProps) {
  if (words === 0) {
    return (
      <section
        aria-label="Your position"
        className="flex items-center justify-between gap-3 rounded-card border-2 border-dashed border-ink/40 px-4 py-3"
      >
        <p className="text-sm text-ink-soft">No position yet. Tap a word to pick YES or NO.</p>
        <TestnetPill />
      </section>
    );
  }
  const change = valueMicro - costMicro;
  return (
    <section
      aria-label="Your position"
      className="sticker flex items-center justify-between gap-3 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-soft">
          Your position · {words} {words === 1 ? "word" : "words"}
        </p>
        <p className="tabular font-display-wide text-[22px] leading-7">{formatAusd(valueMicro)}</p>
        <p className="tabular text-[13px] leading-5 text-ink-soft">Cost {formatAusd(costMicro)}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <TestnetPill />
        <p
          className={`tabular text-[15px] font-semibold leading-5 ${change > 0n ? "text-gain" : "text-ink-soft"}`}
        >
          {formatAusdChange(change)}
        </p>
      </div>
    </section>
  );
}
