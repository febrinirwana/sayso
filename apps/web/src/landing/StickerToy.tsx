import { motion } from "motion/react";
import type { RefObject } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { play } from "@/sound";
import { Voxel } from "@/ui/Voxel";

type StickerToyProps = {
  name: VoxelName;
  /** Rendered size in px. */
  size: number;
  /** Resting tilt in degrees. */
  tilt?: number;
  /** The box the sticker can be dragged around in. */
  bounds: RefObject<HTMLElement | null>;
  className?: string;
};

/**
 * A voxel sticker from the sticker book that players can peel off and toss around its section.
 * Decorative: hidden from assistive tech; pops on grab and drop.
 */
export function StickerToy({ name, size, tilt = 0, bounds, className }: StickerToyProps) {
  return (
    <motion.div
      aria-hidden="true"
      className={`absolute z-[3] cursor-grab touch-none select-none active:cursor-grabbing ${className ?? ""}`}
      style={{ width: size, height: size, rotate: tilt }}
      drag
      dragConstraints={bounds}
      dragElastic={0.35}
      dragTransition={{ bounceStiffness: 420, bounceDamping: 18 }}
      whileHover={{ scale: 1.06, rotate: tilt + 6 }}
      whileDrag={{
        scale: 1.14,
        rotate: tilt - 8,
        filter: "drop-shadow(0 18px 18px rgb(10 10 10 / 0.25))",
      }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
      onDragStart={() => play("pop")}
      onDragEnd={() => play("pop")}
    >
      <Voxel name={name} size={size} className="pointer-events-none size-full" />
    </motion.div>
  );
}
