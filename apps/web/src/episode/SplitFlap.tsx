import { type MotionValue, motion, useTransform } from "motion/react";
import type { ReactNode } from "react";
import type { WordState } from "./WordCard";
import { WordFace } from "./WordFace";

type FaceProps = Omit<Parameters<typeof WordFace>[0], "state">;

/**
 * Split-flap turn driven by `progress` 0 → 1 (a spring, so it overshoots past 1): the old top half
 * folds down over the hinge, revealing the new top; the new bottom half falls from the hinge and
 * lands, the overshoot tipping it slightly past flat.
 */
export function SplitFlap({
  progress,
  back,
  backPrice,
  front,
  faceProps,
}: {
  progress: MotionValue<number>;
  back: WordState;
  /** The leaving face's price; `faceProps.priceCents` is the arriving face's. */
  backPrice: number;
  front: WordState;
  faceProps: FaceProps;
}) {
  const topRotate = useTransform(progress, (p) => -90 * clamp01(p * 2));
  // Past 1 the spring's overshoot becomes a rebound: the flap hits its stop and lifts back toward
  // the viewer, amplified 3× so the 3 % overshoot reads as a visible bounce.
  const bottomRotate = useTransform(progress, (p) =>
    p <= 1 ? Math.min(90, 180 - 180 * p) : 3 * 180 * (p - 1),
  );
  const topVisibility = useTransform(progress, (p) => (p < 0.5 ? "visible" : "hidden"));
  const bottomVisibility = useTransform(progress, (p) => (p >= 0.5 ? "visible" : "hidden"));
  // Once the flap is all but flat the old bottom is swapped for the new one underneath, so the
  // rebound lifts the flap over its own face instead of exposing the old word.
  const coveredVisibility = useTransform(progress, (p) => (p < 0.85 ? "visible" : "hidden"));
  // Flat ink shade, no gradients: a flap darkens as it turns away from the light.
  const topShade = useTransform(progress, (p) => 0.22 * clamp01(p * 2));
  const revealedShade = useTransform(progress, (p) => 0.14 * (1 - clamp01(p * 2)));
  const coveredShade = useTransform(progress, (p) => 0.08 * clamp01(p * 2));
  const bottomShade = useTransform(progress, (p) => 0.2 * (1 - clamp01((p - 0.5) * 2)));

  return (
    <>
      <Half side="top">
        <WordFace {...faceProps} state={front} />
        <Shade opacity={revealedShade} />
      </Half>
      <Half side="bottom">
        <WordFace {...faceProps} state={front} />
      </Half>
      <Half side="bottom" visibility={coveredVisibility}>
        <WordFace {...faceProps} priceCents={backPrice} state={back} />
        <Shade opacity={coveredShade} />
      </Half>
      <Half side="top" rotateX={topRotate} visibility={topVisibility}>
        <WordFace {...faceProps} priceCents={backPrice} state={back} />
        <Shade opacity={topShade} />
      </Half>
      <Half side="bottom" rotateX={bottomRotate} visibility={bottomVisibility}>
        <WordFace {...faceProps} state={front} />
        <Shade opacity={bottomShade} />
      </Half>
      <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-ink/40" />
    </>
  );
}

function Half({
  side,
  rotateX,
  visibility,
  children,
}: {
  side: "top" | "bottom";
  rotateX?: MotionValue<number>;
  visibility?: MotionValue<"visible" | "hidden">;
  children: ReactNode;
}) {
  return (
    <motion.span
      className="absolute inset-0 block"
      style={{
        clipPath: side === "top" ? "inset(0 0 50% 0)" : "inset(50% 0 0 0)",
        transformPerspective: 640,
        ...(rotateX ? { rotateX } : {}),
        ...(visibility ? { visibility } : {}),
      }}
    >
      {children}
    </motion.span>
  );
}

function Shade({ opacity }: { opacity: MotionValue<number> }) {
  return <motion.span className="absolute inset-0 block bg-ink" style={{ opacity }} />;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
