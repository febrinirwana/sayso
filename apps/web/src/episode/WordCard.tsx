import {
  type AnimationPlaybackControlsWithThen,
  animate,
  cancelFrame,
  frame,
  type MotionValue,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { play } from "@/sound";
import { formatCents, formatShares } from "./format";
import { EASE_OUT, REDUCED_FADE, SETTLE_DURATION, SettleDelayContext } from "./settle";
import { useFitText } from "./useFitText";
import { FACE_INSET, WordFace } from "./WordFace";

export type WordState = "open" | "said" | "yes" | "no";

export type WordCardProps = {
  word: string;
  priceCents: number;
  state: WordState;
  position?: { side: "yes" | "no"; shares: number };
  onPress?: () => void;
};

const FLIP = { type: "spring", duration: 0.45, bounce: 0.25 } as const;
const PRESS = { duration: 0.12, ease: EASE_OUT } as const;
const WORD_MIN_PX = 14;
const WORD_MAX_PX = 34;

const stateLabel: Record<WordState, string> = {
  open: "open",
  said: "said",
  yes: "settled yes",
  no: "settled no",
};

/** A word market card. Flips split-flap style into SAID; settles with a stamp or a fade. */
export function WordCard({ word, priceCents, state, position, onPress }: WordCardProps) {
  const reduce = useReducedMotion() ?? false;
  const settleDelay = useContext(SettleDelayContext);
  const { size, boxRef, probeRef } = useFitText(word, {
    min: WORD_MIN_PX,
    max: WORD_MAX_PX,
    inset: FACE_INSET,
  });

  // The face on screen and, while a transition runs, the face it is leaving.
  const [shown, setShown] = useState(state);
  const [from, setFrom] = useState<WordState | null>(null);
  if (state !== shown) {
    setFrom(shown);
    setShown(state);
  }
  const flipping = from !== null && shown === "said" && from !== "said" && !reduce;

  const progress = useMotionValue(1);
  const press = useMotionValue(0);
  const fold = useTransform(progress, (p) => Math.sin(Math.PI * clamp01(p)));
  const sink = useTransform([fold, press], ([f, s]) => Math.max(f as number, s as number));
  const y = useTransform(sink, (s) => s * 2);
  const shadowY = useTransform(sink, (s) => 3 - 2 * s);
  const boxShadow = useMotionTemplate`0 ${shadowY}px 0 currentColor`;
  const scale = useTransform(press, (s) => 1 - 0.03 * s);

  // Layout effect: progress must read 0 before the first flipping frame paints. The spring starts
  // inside the next frame so a slow commit cannot swallow the first half of the fold.
  useLayoutEffect(() => {
    if (!flipping) return;
    let alive = true;
    let controls: AnimationPlaybackControlsWithThen | undefined;
    progress.set(0);
    const start = () => {
      controls = animate(progress, 1, FLIP);
      void controls.then(() => {
        if (alive) setFrom(null);
      });
    };
    frame.update(start);
    return () => {
      alive = false;
      cancelFrame(start);
      controls?.stop();
      progress.set(1);
    };
  }, [flipping, progress]);

  // Sound and haptic only on a real transition into SAID, never on first render.
  const previous = useRef(state);
  useEffect(() => {
    if (state === "said" && previous.current !== "said") {
      play("said");
      navigator.vibrate?.(12);
    }
    previous.current = state;
  }, [state]);

  const settling = shown === "yes" || shown === "no";
  const faceProps = { word, priceCents, fontSize: size, ...(position ? { position } : {}) };
  const label = [
    word,
    formatCents(priceCents),
    stateLabel[shown],
    position ? `you hold ${formatShares(position.shares)} ${position.side.toUpperCase()}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const content = (
    <>
      <span
        ref={probeRef}
        aria-hidden
        className="font-display-condensed pointer-events-none invisible absolute top-0 left-0 whitespace-nowrap uppercase"
      >
        {word}
      </span>
      <span aria-hidden>
        {from === null ? (
          <WordFace {...faceProps} state={shown} />
        ) : flipping ? (
          <SplitFlap progress={progress} back={from} front={shown} faceProps={faceProps} />
        ) : (
          <>
            <WordFace {...faceProps} state={from} />
            <motion.span
              key={`${from}-${shown}`}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{
                duration: reduce ? REDUCED_FADE : SETTLE_DURATION,
                delay: settling ? settleDelay : 0,
                ease: EASE_OUT,
              }}
              onAnimationComplete={() => setFrom(null)}
            >
              <WordFace {...faceProps} state={shown} {...(settling ? { settleDelay } : {})} />
            </motion.span>
          </>
        )}
      </span>
      {onPress ? (
        <button
          type="button"
          aria-label={label}
          onClick={onPress}
          className="absolute inset-0 cursor-pointer touch-manipulation rounded-[18px] focus-visible:-outline-offset-4"
        />
      ) : null}
    </>
  );

  // One element type whether or not the card is pressable, so gaining or losing `onPress` mid-flip
  // (open cards buy, SAID cards cash out) never remounts the faces.
  return (
    <motion.div
      ref={(node: HTMLDivElement | null) => {
        boxRef.current = node;
      }}
      {...(onPress ? {} : { role: "group", "aria-label": label })}
      className={`relative h-32 w-full select-none overflow-hidden rounded-card border-2 border-current transition-colors duration-240 ease-out ${
        shown === "no" ? "text-no" : "text-ink"
      }`}
      style={{ y, scale, boxShadow, transitionDelay: settling ? `${settleDelay}s` : "0s" }}
      {...(onPress
        ? {
            onTapStart: () => animate(press, 1, PRESS),
            onTap: () => animate(press, 0, PRESS),
            onTapCancel: () => animate(press, 0, PRESS),
          }
        : {})}
    >
      {content}
    </motion.div>
  );
}

type FaceProps = Omit<Parameters<typeof WordFace>[0], "state">;

/**
 * Split-flap turn: the old top half folds down over the hinge, revealing the new top; the new
 * bottom half falls from the hinge and lands, spring overshoot tipping it slightly past flat.
 */
function SplitFlap({
  progress,
  back,
  front,
  faceProps,
}: {
  progress: MotionValue<number>;
  back: WordState;
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
        <WordFace {...faceProps} state={back} />
        <Shade opacity={coveredShade} />
      </Half>
      <Half side="top" rotateX={topRotate} visibility={topVisibility}>
        <WordFace {...faceProps} state={back} />
        <Shade opacity={topShade} />
      </Half>
      <Half side="bottom" rotateX={bottomRotate} visibility={bottomVisibility}>
        <WordFace {...faceProps} state={front} />
        <Shade opacity={bottomShade} />
      </Half>
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink/30" />
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
        transformPerspective: 520,
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
