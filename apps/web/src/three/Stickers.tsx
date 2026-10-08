import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { Voxel } from "@/ui/Voxel";
import { burstLayout, heroLayout } from "./layout";
import { useBoxSize } from "./useBoxSize";

// Static stand-ins for the 3D scenes (reduced motion, no WebGL, chunk still loading). They share
// the scenes' layout, so the picture stays put when one replaces the other. No three.js here.

/** The sticker art has a little air around the object; scale up so it matches the voxel's size. */
const ART_SCALE = 1.12;

const placed = (x: number, y: number, size: number, roll: number) => ({
  left: x,
  top: y,
  transform: `translate(-50%, -50%) rotate(${roll}rad)`,
  width: size * ART_SCALE,
  height: size * ART_SCALE,
});

/** The hero's voxels as static stickers, at the same spots the 3D scene puts them. */
export function HeroStickers({
  className,
  style,
}: {
  className?: string | undefined;
  style?: CSSProperties;
}) {
  const [ref, box] = useBoxSize<HTMLDivElement>();
  return (
    <div ref={ref} className={`relative ${className ?? ""}`} style={style} aria-hidden="true">
      {heroLayout(box.width, box.height).map((piece) => (
        <div
          key={piece.name}
          className="absolute"
          style={placed(piece.x, piece.y, piece.size, -piece.tilt[2])}
        >
          <Voxel name={piece.name} size={piece.size * ART_SCALE} className="size-full" />
        </div>
      ))}
    </div>
  );
}

type BurstStickersProps = {
  className?: string | undefined;
  onShown?: (() => void) | undefined;
};

/** The win halo at rest, faded in over 150 ms (DESIGN section 6), then `onShown`. */
export function BurstStickers({ className, onShown }: BurstStickersProps) {
  const [ref, box] = useBoxSize<HTMLDivElement>();
  return (
    <motion.div
      ref={ref}
      className={`relative ${className ?? ""}`}
      aria-hidden="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onAnimationComplete={() => onShown?.()}
    >
      {burstLayout(box.width, box.height).map((piece) => (
        <div
          key={piece.id}
          className="absolute"
          style={placed(piece.x, piece.y, piece.size, -piece.roll)}
        >
          <Voxel name={piece.name} size={piece.size * ART_SCALE} className="size-full" />
        </div>
      ))}
    </motion.div>
  );
}
