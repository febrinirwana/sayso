import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { VoxelName } from "@/assets/voxels/names";
import { Voxel } from "@/ui/Voxel";
import { FACE_INSET } from "./WordFace";

/** Tall voxels perch on the card's top edge; wide speech bubbles ride its seam. */
const PERCHERS: readonly VoxelName[] = ["star", "zap"];
const BUBBLES: readonly VoxelName[] = ["omg-message", "like-message", "wtf-message"];

/** Px a pressed, hovered or selected card lifts its face; the seam leaves room for it. */
const LIFT_PX = 3;
const GAP_PX = 3;
/** WordFace's word box is a 0.92 em line plus 0.06 em of descender room. */
const WORD_BOX_EM = 0.98;

/**
 * Where each sticker lands and how it gets there; `from` is the start offset in % of the sticker's
 * own size, pointing back at the card. The game information never moves, so neither do the slots:
 * a star or zap perches on the top edge, left of the "You hold" label and above the price; two
 * speech bubbles ride the split-flap seam between the price row and the word, the last poking
 * 22 px out of the right edge, inside the board gap (10 px or more) and the neighbour's 16 px face
 * inset, short of an open neighbour's chance meter. Paths stay inside those zones: bubbles travel
 * sideways only, the perch rises into place, and every sticker leaves by fading where it stands.
 * Tilt and overshoot stay small enough that a sticker's rotated box keeps clear too.
 */
const PERCH = { rotate: -6, from: { x: "20%", y: "30%" } } as const;
const SEAM = [
  { place: { left: "54%", translate: "-50% -50%" }, rotate: 5, from: { x: "-30%", y: "0%" } },
  { place: { right: "-22px", translate: "0 -50%" }, rotate: -4, from: { x: "-70%", y: "0%" } },
] as const;

const POP = { type: "spring", duration: 0.55, bounce: 0.3 } as const;

/**
 * Voxel reaction stickers that pop out of a card the moment its word is SAID (DESIGN section 6).
 * They never cover the price, the SAID tag, the word or the holding label, and never take a tap.
 * Shown while `show` is true; `burstKey` reshuffles the reactions. `wordPx` is the card's fitted
 * word size, which decides how tall the seam is.
 */
export function ReactionBurst({
  word,
  burstKey,
  show,
  wordPx,
}: {
  word: string;
  burstKey: number;
  show: boolean;
  wordPx: number;
}) {
  const reduce = useReducedMotion() ?? false;
  let hash = burstKey;
  for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const percher = PERCHERS[hash % PERCHERS.length] ?? "star";
  // Two different bubbles from a word-seeded start.
  const bubbles = SEAM.map((_, i) => BUBBLES[(hash + i) % BUBBLES.length] ?? "omg-message");
  const pop = (i: number, rotate: number, from: { x: string; y: string }) => ({
    initial: reduce
      ? { opacity: 0, rotate }
      : { opacity: 0, scale: 0.45, x: from.x, y: from.y, rotate: 0 },
    animate: { opacity: 1, scale: 1, x: "0%", y: "0%", rotate },
    exit: reduce
      ? { opacity: 0, transition: { duration: 0.15 } }
      : { opacity: 0, scale: 0.9, transition: { duration: 0.25 } },
    transition: reduce ? { duration: 0.15 } : { ...POP, delay: 0.16 + i * 0.07 },
  });

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-30">
      <AnimatePresence>
        {show ? (
          <motion.span
            key={`${burstKey}-perch`}
            className="absolute -top-[25px] -left-3 block size-[34px] drop-shadow-[0_4px_0_rgb(10_10_10/0.18)]"
            {...pop(0, PERCH.rotate, PERCH.from)}
          >
            <Voxel name={percher} size={64} className="size-full" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      {/* The seam: below the price row (44, 48 or 54 px with the border, by card width) and
          above the word, less the face's lift. */}
      <div
        className="absolute inset-x-0 top-12 @min-[200px]:top-[52px] @min-[260px]:top-[58px]"
        style={{ bottom: FACE_INSET + wordPx * WORD_BOX_EM + LIFT_PX + GAP_PX }}
      >
        <AnimatePresence>
          {show
            ? SEAM.map((slot, i) => (
                <motion.span
                  key={`${burstKey}-seam-${bubbles[i]}`}
                  className="absolute top-1/2 block aspect-[5/4] h-[92%] max-h-24 overflow-hidden drop-shadow-[0_4px_0_rgb(10_10_10/0.18)]"
                  style={slot.place}
                  {...pop(i + 1, slot.rotate, slot.from)}
                >
                  {/* The bubble art sits in a square with empty bands above and below; cover
                      crops them so the bubble itself fills the seam. */}
                  <Voxel
                    name={bubbles[i] ?? "omg-message"}
                    size={128}
                    className="size-full object-cover"
                  />
                </motion.span>
              ))
            : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
