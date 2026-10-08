import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Ref } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { Voxel } from "@/ui/Voxel";
import type { DemoCard as Card } from "./demo";

type DemoCardProps = {
  word: string;
  card: Card;
  priceCents: number;
  /** Reaction sticker that pops out when the card flips SAID. */
  reaction: VoxelName;
  onPress?: (() => void) | undefined;
  ref?: Ref<HTMLButtonElement>;
};

const face =
  "absolute inset-0 flex flex-col items-start justify-between rounded-[20px] border-2 border-ink p-3 [backface-visibility:hidden] md:p-4";

/**
 * One word on the demo board. Open cards are pickable; SAID flips on X like a split-flap and lands
 * red with a reaction sticker; settled cards stamp YES in green or fade to NO.
 */
export function DemoCard({ word, card, priceCents, reaction, onPress, ref }: DemoCardProps) {
  const reduced = useReducedMotion() === true;
  const flipped = card.state !== "open";
  const settled = card.state === "yes" || card.state === "no";
  const label = `${word}, ${
    card.state === "open"
      ? `${priceCents} cents${card.picked ? ", picked" : ""}`
      : card.state === "said"
        ? "said"
        : card.state === "yes"
          ? "settled yes"
          : "settled no"
  }`;

  return (
    <div className="relative h-[120px] [perspective:700px] md:h-[124px]">
      <motion.button
        ref={ref}
        type="button"
        aria-label={label}
        aria-pressed={card.picked}
        disabled={!onPress}
        onClick={onPress}
        className="group relative size-full rounded-[20px] text-left [transform-style:preserve-3d] disabled:cursor-default"
        initial={false}
        animate={reduced ? {} : { rotateX: flipped ? -180 : 0 }}
        whileTap={onPress ? { scale: 0.97, y: 2 } : {}}
        transition={{ type: "spring", duration: 0.45, bounce: 0.25 }}
      >
        {/* Front: open */}
        <motion.span
          className={`${face} shadow-sticker transition-colors duration-150 ${
            card.picked ? "bg-sun-tint" : "bg-card group-hover:bg-paper"
          }`}
          animate={{ opacity: reduced && flipped ? 0 : 1 }}
          transition={{ duration: 0.15 }}
        >
          <span className="w-full font-headline text-[19px] leading-none md:text-[22px]">
            {word}
          </span>
          <span className="flex w-full items-center justify-between gap-2">
            <span className="tabular font-headline text-[28px] leading-none md:text-[34px]">
              {priceCents}¢
            </span>
            {card.picked ? (
              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-sun">
                <Check aria-hidden size={14} strokeWidth={3} />
              </span>
            ) : (
              <span className="inline-flex h-6 shrink-0 items-center rounded-full border-2 border-ink px-2 text-[11px] font-bold">
                Pick
              </span>
            )}
          </span>
        </motion.span>

        {/* Back: SAID, then settled */}
        <motion.span
          className={`${face} shadow-sticker ${
            card.state === "no"
              ? "bg-line text-ink-soft"
              : card.state === "yes"
                ? "bg-gain-tint"
                : "bg-said"
          }`}
          style={reduced ? {} : { rotateX: 180 }}
          animate={{ opacity: reduced ? (flipped ? 1 : 0) : 1 }}
          transition={{ duration: 0.15 }}
        >
          <span className="w-full font-headline text-[19px] leading-none md:text-[22px]">
            {word}
          </span>
          <span className="flex w-full flex-wrap items-center justify-between gap-2">
            {settled ? (
              <motion.span
                className={`inline-flex h-8 items-center rounded-lg border-2 px-2.5 font-headline text-lg leading-none ${
                  card.state === "yes" ? "border-gain text-gain" : "border-no text-ink-soft"
                }`}
                initial={reduced ? false : { scale: 1.6, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: -6, opacity: 1 }}
                transition={{ type: "spring", duration: 0.3, bounce: 0.4 }}
              >
                {card.state === "yes" ? "YES 100¢" : "NO 0¢"}
              </motion.span>
            ) : (
              <span className="inline-flex h-8 items-center rounded-full bg-ink px-3 font-headline text-lg leading-none tracking-[0.04em] text-white">
                SAID
              </span>
            )}
            {card.picked && (
              <span className="inline-flex h-6 shrink-0 items-center rounded-full border-2 border-ink bg-card px-2 text-[11px] font-bold text-ink">
                {card.state === "no" ? "Lost" : "+98¢"}
              </span>
            )}
          </span>
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {card.state === "said" && !reduced && (
          <motion.div
            key="reaction"
            aria-hidden="true"
            className="pointer-events-none absolute -top-9 -right-5 z-10"
            initial={{ opacity: 0, scale: 0.5, rotate: -25, y: 20 }}
            animate={{ opacity: 1, scale: 1, rotate: 10, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: -10, transition: { duration: 0.2 } }}
            transition={{ type: "spring", duration: 0.6, bounce: 0.55, delay: 0.18 }}
          >
            <Voxel name={reaction} size={72} className="size-16 md:size-[72px]" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
