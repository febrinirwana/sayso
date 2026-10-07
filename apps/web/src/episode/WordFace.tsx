import { motion, useReducedMotion } from "motion/react";
import { formatShares } from "./format";
import { RollingCents } from "./RollingCents";
import { EASE_OUT, SETTLE_DURATION } from "./settle";
import type { WordCardProps, WordState } from "./WordCard";

/** Inner padding of a card face in px; the word fit subtracts it on both sides. */
export const FACE_INSET = 12;

const faceTone: Record<WordState, string> = {
  open: "bg-card text-ink",
  said: "bg-said text-ink",
  yes: "bg-card text-ink",
  no: "bg-paper text-ink-soft",
};

type WordFaceProps = Pick<WordCardProps, "word" | "priceCents" | "position"> & {
  state: WordState;
  fontSize: number;
  /** Set when this face is arriving through a settle; delays the YES stamp to the card's wave slot. */
  settleDelay?: number;
};

/**
 * One full face of a word card. The top half holds price, own position and state tag; the
 * bottom half holds only the word, so the split-flap seam never cuts through a glyph.
 */
export function WordFace({
  word,
  priceCents,
  position,
  state,
  fontSize,
  settleDelay,
}: WordFaceProps) {
  return (
    <span
      className={`absolute inset-0 flex flex-col justify-between ${faceTone[state]}`}
      style={{ padding: FACE_INSET }}
    >
      {/* The split-flap hinge, visible at rest so the flip has somewhere to happen. */}
      <span
        className={`absolute inset-x-0 top-1/2 h-px ${state === "said" ? "bg-ink/15" : "bg-line"}`}
      />
      <span className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col items-start gap-1">
          <RollingCents
            cents={priceCents}
            className={`tabular text-xl font-bold leading-6 ${state === "yes" ? "text-gain" : ""}`}
          />
          {position ? <PositionChip position={position} /> : null}
        </span>
        <StateTag state={state} settleDelay={settleDelay} />
      </span>
      <span
        className={`font-display-condensed block overflow-hidden text-ellipsis whitespace-nowrap uppercase leading-[0.92] ${state === "no" ? "text-no" : ""}`}
        style={{ fontSize }}
      >
        {word}
      </span>
    </span>
  );
}

function PositionChip({ position }: { position: NonNullable<WordCardProps["position"]> }) {
  return (
    <span className="tabular inline-flex h-5 items-center gap-1 rounded-full border-2 border-current px-1.5 text-[11px] font-bold leading-none">
      <span className="font-medium">You</span>
      {formatShares(position.shares)} {position.side.toUpperCase()}
    </span>
  );
}

function StateTag({ state, settleDelay }: { state: WordState; settleDelay: number | undefined }) {
  const reduce = useReducedMotion() ?? false;
  if (state === "said") {
    return (
      <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-ink px-2.5 text-[11px] font-bold leading-none tracking-[0.08em] text-paper">
        SAID
      </span>
    );
  }
  if (state === "no") {
    return (
      <span className="inline-flex h-6 shrink-0 items-center rounded-full border-2 border-no px-2 text-[11px] font-bold leading-none tracking-[0.08em]">
        NO
      </span>
    );
  }
  if (state === "yes") {
    const stamping = settleDelay !== undefined && !reduce;
    return (
      <motion.span
        className="font-display-wide inline-flex h-8 shrink-0 items-center rounded-lg border-[2.5px] border-gain bg-card px-2 text-lg leading-none text-gain"
        initial={stamping ? { opacity: 0, scale: 1.35, rotate: -16 } : false}
        animate={{ opacity: 1, scale: 1, rotate: -8 }}
        transition={{ duration: SETTLE_DURATION, delay: (settleDelay ?? 0) + 0.08, ease: EASE_OUT }}
      >
        YES
      </motion.span>
    );
  }
  return null;
}
