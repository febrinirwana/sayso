import { motion, useReducedMotion } from "motion/react";
import { RollingCents } from "./RollingCents";
import { EASE_OUT, SETTLE_DURATION } from "./settle";
import type { WordState } from "./WordCard";

/** Inner padding of a card face in px; the word fit subtracts it on both sides. */
export const FACE_INSET = 14;

const faceTone: Record<WordState, string> = {
  open: "bg-card text-ink",
  said: "bg-said text-ink",
  yes: "bg-gain-tint text-ink",
  no: "bg-paper text-ink-soft",
  void: "bg-paper text-ink-soft",
};

const hingeTone: Record<WordState, string> = {
  open: "bg-line",
  said: "bg-ink/20",
  yes: "bg-gain/15",
  no: "bg-line",
  void: "bg-line",
};

type WordFaceProps = {
  word: string;
  priceCents: number;
  priceAvailable?: boolean;
  state: WordState;
  fontSize: number;
  /** Set when this face is arriving through a settle; delays the YES stamp to the card's wave slot. */
  settleDelay?: number;
};

/**
 * One full face of a word card. The top half holds the price, the state tag and, while open, a
 * chance meter that fills to the price; the bottom half holds only the word, so the split-flap
 * seam never cuts through a glyph. Sizes follow the card's own width (container queries).
 */
export function WordFace({
  word,
  priceCents,
  priceAvailable = true,
  state,
  fontSize,
  settleDelay,
}: WordFaceProps) {
  return (
    <span className={`absolute inset-0 block ${faceTone[state]}`}>
      {/* The split-flap hinge, visible at rest so the flip has somewhere to happen. */}
      <span className={`absolute inset-x-0 top-1/2 h-px ${hingeTone[state]}`} />
      <span
        className="absolute inset-x-0 top-0 flex h-1/2 flex-col justify-between"
        style={{ padding: `${FACE_INSET}px ${FACE_INSET}px 10px` }}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="flex items-baseline gap-1.5">
            {priceAvailable ? (
              <RollingCents
                cents={priceCents}
                className={`font-headline tabular text-[24px] leading-none @min-[200px]:text-[32px] @min-[260px]:text-[38px] ${state === "yes" ? "text-gain" : ""}`}
              />
            ) : (
              <span className="font-headline text-[24px]">–</span>
            )}
            {state === "open" ? (
              <span className="text-[11px] font-bold leading-none tracking-[0.08em] text-ink-soft @min-[200px]:text-[12px]">
                YES
              </span>
            ) : null}
          </span>
          <StateTag state={state} settleDelay={settleDelay} />
        </span>
        {state === "open" ? (
          <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-line @min-[200px]:h-2">
            <span
              className="absolute inset-y-0 left-0 block rounded-full bg-ink transition-[width] duration-180 ease-out"
              style={{ width: `${priceCents}%` }}
            />
          </span>
        ) : null}
      </span>
      <span
        className="absolute inset-x-0 bottom-0 flex h-1/2 items-end"
        style={{ padding: `0 ${FACE_INSET}px ${FACE_INSET - 2}px` }}
      >
        <span
          className="font-headline block overflow-hidden whitespace-nowrap pb-[0.06em] uppercase leading-[0.92]"
          style={{ fontSize }}
        >
          {word}
        </span>
      </span>
    </span>
  );
}

function StateTag({ state, settleDelay }: { state: WordState; settleDelay: number | undefined }) {
  const reduce = useReducedMotion() ?? false;
  if (state === "said") {
    return (
      <span className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-ink px-2.5 text-[12px] font-extrabold leading-none tracking-[0.1em] text-paper @min-[200px]:h-8 @min-[200px]:px-3 @min-[200px]:text-[13px]">
        <span aria-hidden className="size-1.5 rounded-full bg-said" />
        SAID
      </span>
    );
  }
  if (state === "no" || state === "void") {
    return (
      <span className="inline-flex h-7 shrink-0 items-center rounded-full border-2 border-no px-2.5 text-[12px] font-bold leading-none tracking-[0.1em]">
        {state === "void" ? "VOID" : "NO"}
      </span>
    );
  }
  if (state === "yes") {
    const stamping = settleDelay !== undefined && !reduce;
    return (
      <motion.span
        className="font-headline inline-flex h-9 shrink-0 items-center rounded-xl border-[3px] border-gain bg-card px-2.5 text-xl leading-none text-gain shadow-[0_3px_0_var(--color-gain)] @min-[200px]:h-11 @min-[200px]:px-3 @min-[200px]:text-2xl"
        initial={stamping ? { opacity: 0, scale: 1.6, rotate: -18 } : false}
        animate={{ opacity: 1, scale: 1, rotate: -8 }}
        transition={{ duration: SETTLE_DURATION, delay: (settleDelay ?? 0) + 0.08, ease: EASE_OUT }}
      >
        YES
      </motion.span>
    );
  }
  return null;
}
