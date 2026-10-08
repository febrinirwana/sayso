import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { VoxelName } from "@/assets/voxels/names";
import { Voxel } from "@/ui/Voxel";

const REACTIONS: readonly VoxelName[] = [
  "omg-message",
  "star",
  "like-message",
  "zap",
  "wtf-message",
];

/**
 * Where each sticker lands around its card, in % of the card box, and how it gets there: `from` is
 * the start offset in % of the sticker's own size, pointing back at the card's centre.
 */
const SLOTS = [
  { left: "-14%", top: "-34%", width: "48%", rotate: -14, from: { x: "60%", y: "70%" } },
  { left: "60%", top: "-42%", width: "42%", rotate: 12, from: { x: "-50%", y: "80%" } },
  { left: "70%", top: "38%", width: "38%", rotate: -9, from: { x: "-90%", y: "-10%" } },
] as const;

const POP = { type: "spring", duration: 0.6, bounce: 0.45 } as const;

/**
 * Voxel reaction stickers that pop out of a card the moment its word is SAID (DESIGN section 6).
 * Shown while `show` is true; `burstKey` reshuffles which three of the five reactions appear.
 */
export function ReactionBurst({
  word,
  burstKey,
  show,
}: {
  word: string;
  burstKey: number;
  show: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  let hash = burstKey;
  for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  // Every second reaction from a word-seeded start: three distinct stickers out of five.
  const picks = SLOTS.map((_, i) => REACTIONS[(hash + i * 2) % REACTIONS.length] ?? "star");

  return (
    <AnimatePresence>
      {show
        ? SLOTS.map((slot, i) => (
            <motion.span
              key={`${burstKey}-${slot.left}`}
              aria-hidden
              className="pointer-events-none absolute z-30 block aspect-square drop-shadow-[0_6px_0_rgb(10_10_10/0.18)]"
              style={{ left: slot.left, top: slot.top, width: slot.width }}
              initial={
                reduce
                  ? { opacity: 0, rotate: slot.rotate }
                  : { opacity: 0, scale: 0.45, x: slot.from.x, y: slot.from.y, rotate: 0 }
              }
              animate={{ opacity: 1, scale: 1, x: "0%", y: "0%", rotate: slot.rotate }}
              exit={
                reduce
                  ? { opacity: 0, transition: { duration: 0.15 } }
                  : { opacity: 0, y: "-28%", scale: 0.9, transition: { duration: 0.3 } }
              }
              transition={reduce ? { duration: 0.15 } : { ...POP, delay: 0.16 + i * 0.07 }}
            >
              <Voxel name={picks[i] ?? "star"} size={128} className="size-full" />
            </motion.span>
          ))
        : null}
    </AnimatePresence>
  );
}
