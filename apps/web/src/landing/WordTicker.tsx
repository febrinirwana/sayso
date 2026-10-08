import { motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { nextTicker, TICKER_WORDS } from "./ticker";

/** Seconds between flips; the board resets after `TICKER_SAID_MAX` words are said. */
const STEP_MS = 1500;

/**
 * Hero's sample board: word chips that flip to SAID one at a time, like a round in fast-forward.
 * `onSaid` fires on each flip (the mascot "says" the word). Pauses off-screen; under reduced
 * motion the flip is a 150 ms crossfade.
 */
export function WordTicker({ onSaid }: { onSaid?: (word: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduced = useReducedMotion() === true;
  const [said, setSaid] = useState<readonly number[]>([]);
  const board = useRef({ said: [] as readonly number[], round: 0 });
  const saidRef = useRef(onSaid);
  useEffect(() => {
    saidRef.current = onSaid;
  }, [onSaid]);

  useEffect(() => {
    if (!inView || reduced) return;
    const id = window.setInterval(() => {
      const b = board.current;
      const next = nextTicker(b.said, b.round);
      if (next.length === 0) b.round++;
      const flipped = next.find((i) => !b.said.includes(i));
      b.said = next;
      setSaid(next);
      const word = flipped === undefined ? undefined : TICKER_WORDS[flipped];
      if (word) saidRef.current?.(word);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [inView, reduced]);

  return (
    <div ref={ref} className="flex flex-wrap gap-2" aria-hidden="true">
      {TICKER_WORDS.map((word, i) => (
        <Chip key={word} word={word} said={said.includes(i)} reduced={reduced} />
      ))}
    </div>
  );
}

function Chip({ word, said, reduced }: { word: string; said: boolean; reduced: boolean }) {
  const face =
    "absolute inset-0 flex items-center justify-center gap-1.5 rounded-full border-2 border-ink [backface-visibility:hidden]";
  return (
    <div
      className="relative h-11 [perspective:400px]"
      style={{ minWidth: `${word.length * 0.72 + 2.4}em` }}
    >
      <motion.div
        className="relative size-full [transform-style:preserve-3d]"
        initial={false}
        animate={reduced ? { rotateX: 0 } : { rotateX: said ? -180 : 0 }}
        transition={{ type: "spring", duration: 0.45, bounce: 0.25 }}
      >
        <motion.span
          className={`${face} bg-card font-headline text-[15px] tracking-[-0.01em] shadow-sticker`}
          animate={{ opacity: reduced && said ? 0 : 1 }}
          transition={{ duration: 0.15 }}
        >
          {word}
        </motion.span>
        <motion.span
          className={`${face} bg-said font-headline text-[15px] tracking-[-0.01em] text-ink shadow-sticker`}
          style={reduced ? {} : { rotateX: 180 }}
          initial={false}
          animate={{ opacity: reduced ? (said ? 1 : 0) : 1 }}
          transition={{ duration: 0.15 }}
        >
          {word}
          <span className="rounded-full bg-ink px-1.5 py-0.5 text-[10px] leading-none tracking-[0.08em] text-said">
            SAID
          </span>
        </motion.span>
      </motion.div>
    </div>
  );
}
