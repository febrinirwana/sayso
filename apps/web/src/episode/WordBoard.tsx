import { useEffect, useRef, useState } from "react";
import { TestnetPill } from "@/ui/TestnetPill";
import { SETTLE_STAGGER, SettleDelayContext } from "./settle";
import { WordCard, type WordCardProps } from "./WordCard";

const layouts = {
  /** Two columns of 132 px cards; the landing demo and any narrow column. */
  compact: "grid-cols-2 auto-rows-[132px] gap-3",
  /**
   * S3: 2×3 on phones, 3×2 on tablets, and on desktop a 2×3 that fills its column's height so the
   * cards grow as large as the studio allows.
   */
  episode:
    "grid-cols-2 auto-rows-[minmax(124px,auto)] gap-x-2.5 gap-y-3.5 min-[400px]:auto-rows-[132px] md:grid-cols-3 md:auto-rows-[156px] md:gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-2 lg:grid-rows-3 lg:auto-rows-auto lg:gap-x-4 lg:gap-y-5",
} as const;

/**
 * The six-word board. Settles as a left-to-right, top-to-bottom wave and announces SAID words to
 * screen readers. The episode variant adds a caption row with the TESTNET label its prices need.
 */
export function WordBoard({
  words,
  variant = "compact",
}: {
  words: readonly WordCardProps[];
  variant?: keyof typeof layouts;
}) {
  const announcement = useSaidAnnouncement(words);
  const grid = (
    <div className={`grid w-full ${layouts[variant]}`}>
      {words.map((card, index) => (
        <SettleDelayContext key={card.word} value={index * SETTLE_STAGGER}>
          <WordCard {...card} />
        </SettleDelayContext>
      ))}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
  if (variant === "compact") return grid;
  return (
    <section aria-label="Word board" className="flex flex-col gap-4 lg:h-full lg:gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-soft lg:text-[12px]">
          The board · tap a word to trade
        </p>
        <TestnetPill />
      </div>
      {grid}
    </section>
  );
}

/** Screen readers hear "PRESSURE was said" when a card flips, not on the first render. */
function useSaidAnnouncement(words: readonly WordCardProps[]): string {
  const [message, setMessage] = useState("");
  const previous = useRef(new Map(words.map((card) => [card.word, card.state])));
  useEffect(() => {
    const flipped = words.filter(
      (card) => card.state === "said" && previous.current.get(card.word) !== "said",
    );
    previous.current = new Map(words.map((card) => [card.word, card.state]));
    if (flipped.length > 0) setMessage(`${flipped.map((card) => card.word).join(", ")} was said`);
  }, [words]);
  return message;
}
