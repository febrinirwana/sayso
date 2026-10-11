import { animate, type Easing, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RollingAusd } from "@/episode/RollingAusd";
import { EASE_OUT } from "@/episode/settle";
import { CoinFlights, type Flight } from "@/landing/CoinFlight";
import { play } from "@/sound";
import { Voxel } from "@/ui/Voxel";
import { claimCelebration, type RedeemConfirmation } from "./celebration";

/** The AppShell balance chip the coins land in. */
const BALANCE_CHIP = "[data-balance-chip]";
/** Pop in, count up while the coins fly (0.8 s, DESIGN section 6), hold, then fade back to the card. */
const DURATION = 1.4;
const TIMES = [0, 0.14, 0.8, 1];
// One easing per segment: a single curve would warp the whole timeline and cut the hold short.
const EASES: Easing[] = [EASE_OUT, "easeOut", "easeIn"];

/**
 * The moment a redeem is confirmed on chain: a "+amount AUSD TESTNET" sticker pops over the card and
 * counts up while coins arc into the balance chip, then everything fades to the card's calm Redeemed
 * state. Overlays its positioned parent without taking space or taps; plays once per confirmation.
 * Reduced motion keeps only a fade and a slight scale, with the final amount shown at once.
 */
export function RedeemCelebration({ confirmation }: { confirmation: RedeemConfirmation }) {
  const reduce = useReducedMotion() ?? false;
  const [active, setActive] = useState(() => claimCelebration(confirmation));
  const [shown, setShown] = useState(() => (reduce ? confirmation.amount : 0n));
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const sticker = useRef<HTMLDivElement>(null);
  // Strict Mode replays effects; the sound and the coins must still start only once.
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    play("redeem");
    setShown(confirmation.amount);
    const from = sticker.current?.getBoundingClientRect();
    const to = document.querySelector(BALANCE_CHIP)?.getBoundingClientRect();
    if (!reduce && from && to) setFlights([{ id: confirmation.id, from, to }]);
  }, [active, reduce, confirmation]);

  if (!active) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-4"
    >
      <motion.div
        ref={sticker}
        className="flex -rotate-3 items-center gap-2.5 rounded-full border-2 border-ink bg-card py-2 pr-5 pl-2 shadow-sticker-lg"
        initial={{ opacity: 0, scale: reduce ? 0.96 : 0.82, y: reduce ? 0 : 10 }}
        animate={{
          opacity: [0, 1, 1, 0],
          scale: reduce ? [0.96, 1, 1, 1] : [0.82, 1.06, 1, 0.94],
          y: reduce ? 0 : [10, 0, 0, -12],
        }}
        transition={{ duration: DURATION, times: TIMES, ease: EASES }}
        onAnimationComplete={() => setActive(false)}
      >
        <Voxel name="money-1" size={48} className="size-12" />
        <span className="font-headline text-[34px] leading-none whitespace-nowrap tabular">
          +<RollingAusd micro={shown} duration={0.6} />
        </span>
        <span className="flex flex-col text-[11px] leading-tight font-bold tracking-[0.08em]">
          <span>AUSD</span>
          <span className="text-ink-soft">TESTNET</span>
        </span>
      </motion.div>
      <CoinFlights
        flights={flights}
        onLanded={() => {
          const chip = document.querySelector(BALANCE_CHIP);
          if (chip) animate(chip, { scale: [1, 1.08, 1] }, { duration: 0.2, ease: "easeOut" });
        }}
        onDone={() => setFlights([])}
      />
    </div>
  );
}
