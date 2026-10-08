import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { voxelUrl } from "@/ui/Voxel";

export type Flight = { id: number; from: DOMRect; to: DOMRect };

/** Coin ids per flight; the last one landing ends the flight. */
const COINS = [0, 1, 2, 3, 4] as const;
const SIZE = 36;

/**
 * Coins arc from a card into the balance (DESIGN section 6: 0.8 s). Rendered in a fixed layer on
 * `document.body`, above the 3D stage; `onLanded` fires as the first coin arrives.
 */
export function CoinFlights({
  flights,
  onLanded,
  onDone,
}: {
  flights: readonly Flight[];
  onLanded: (id: number) => void;
  onDone: (id: number) => void;
}) {
  if (flights.length === 0) return null;
  const url = voxelUrl("money-1", 128);
  return createPortal(
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40">
      {flights.map((flight) => {
        const sx = flight.from.left + flight.from.width / 2 - SIZE / 2;
        const sy = flight.from.top + flight.from.height / 2 - SIZE / 2;
        const dx = flight.to.left + flight.to.width / 2 - SIZE / 2 - sx;
        const dy = flight.to.top + flight.to.height / 2 - SIZE / 2 - sy;
        const lift = Math.min(160, Math.abs(dx) * 0.4 + 80);
        return COINS.map((i) => (
          <motion.img
            key={`${flight.id}-${i}`}
            src={url}
            alt=""
            width={SIZE}
            height={SIZE}
            className="absolute"
            style={{ left: sx, top: sy }}
            initial={{ x: 0, y: 0, scale: 0.7, rotate: 0, opacity: 1 }}
            animate={{
              x: [0, dx * 0.45 + (i - 2) * 14, dx],
              y: [0, Math.min(0, dy) - lift + i * 6, dy],
              scale: [0.7, 1.15, 0.6],
              rotate: [0, 180 + i * 40, 360],
              opacity: [1, 1, 0],
            }}
            transition={{
              duration: 0.8,
              ease: [0.33, 0, 0.2, 1],
              delay: i * 0.06,
              times: [0, 0.45, 1],
            }}
            onAnimationComplete={() => {
              if (i === 0) onLanded(flight.id);
              if (i === COINS.length - 1) onDone(flight.id);
            }}
          />
        ));
      })}
    </div>,
    document.body,
  );
}
