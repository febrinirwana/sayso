import { motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { play } from "@/sound";
import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";
import { formatAusd, formatAusdAmount } from "./format";

type ResultCardProps = {
  /** Episode profit or loss, 6-decimal AUSD units. */
  changeMicro: bigint;
  /** Words the player called right, out of the words they traded. */
  called: number;
  traded: number;
  /** What the player can redeem now, 6-decimal AUSD units. */
  redeemMicro: bigint;
  onRedeem?: () => void;
  /** Play `win` or `lose` on mount: the moment the result is revealed. */
  announce?: boolean;
};

const STICKERS: Record<"win" | "lose", readonly { name: VoxelName; className: string }[]> = {
  win: [
    { name: "star", className: "-top-10 -left-3 w-20 -rotate-12 md:-left-8 md:w-24" },
    { name: "money-2", className: "-top-8 -right-2 w-16 rotate-12 md:-right-6 md:w-20" },
    { name: "like-message", className: "-bottom-8 -right-3 w-24 -rotate-6 md:-right-10 md:w-28" },
  ],
  lose: [
    { name: "ghost", className: "-top-9 -left-3 w-16 -rotate-12 md:-left-7 md:w-20" },
    { name: "smiley-face", className: "-bottom-8 -right-2 w-16 rotate-12 md:-right-6 md:w-20" },
  ],
};

/**
 * End-of-episode result (S5 preview): a win is a sun card with a gain figure and stickers; a loss
 * is neutral paper, never red. Redeem plays `redeem` through the button press.
 */
export function ResultCard({
  changeMicro,
  called,
  traded,
  redeemMicro,
  onRedeem,
  announce = false,
}: ResultCardProps) {
  const reduce = useReducedMotion() ?? false;
  const win = changeMicro > 0n;
  useEffect(() => {
    if (announce) play(win ? "win" : "lose");
  }, [announce, win]);

  const stickers = STICKERS[win ? "win" : "lose"];
  return (
    <motion.section
      aria-label="Episode result"
      className={`sticker relative mx-auto w-full max-w-[440px] px-6 pt-7 pb-6 text-center shadow-sticker-lg ${win ? "bg-sun-tint" : "bg-paper"}`}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
    >
      {stickers.map((sticker, i) => (
        <motion.span
          key={sticker.name}
          aria-hidden
          className={`pointer-events-none absolute block aspect-square ${sticker.className}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", duration: 0.6, bounce: 0.45, delay: 0.15 + i * 0.08 }}
        >
          <Voxel name={sticker.name} size={128} className="size-full" />
        </motion.span>
      ))}
      <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-ink-soft">
        {win ? "You called it" : "Not this time"}
      </p>
      <p
        className={`font-headline tabular mt-2 text-[56px] leading-none ${win ? "text-gain" : "text-ink-soft"}`}
      >
        {win ? "+" : changeMicro < 0n ? "\u2212" : ""}
        {formatAusdAmount(changeMicro < 0n ? -changeMicro : changeMicro)}
      </p>
      <p className="mt-2 flex items-center justify-center gap-2 text-[14px] font-bold">
        AUSD <TestnetPill />
      </p>
      <p className="mt-4 text-[15px] leading-6 text-ink-soft">
        {called} of {traded} {traded === 1 ? "call" : "calls"} right.{" "}
        {win ? "Settled from both transcripts." : "Every clip is a new board."}
      </p>
      {redeemMicro > 0n && onRedeem ? (
        <button
          type="button"
          onClick={() => {
            play("redeem");
            onRedeem();
          }}
          className="sticker pressable font-headline mt-5 inline-flex h-14 w-full items-center justify-center rounded-full bg-ink px-6 text-[17px] text-paper"
        >
          Redeem {formatAusd(redeemMicro)}
        </button>
      ) : null}
    </motion.section>
  );
}
