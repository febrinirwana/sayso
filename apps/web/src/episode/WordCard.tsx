import {
  type AnimationPlaybackControlsWithThen,
  animate,
  cancelFrame,
  frame,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { play } from "@/sound";
import { HoldingChip, PriceDelta } from "./CardBadges";
import { useEpisodeFx, wordAnchor } from "./EpisodeFx";
import { formatCents, formatHolding } from "./format";
import { ReactionBurst } from "./ReactionBurst";
import { SplitFlap } from "./SplitFlap";
import { EASE_OUT, REDUCED_FADE, SETTLE_DURATION, SettleDelayContext } from "./settle";
import { useFitText } from "./useFitText";
import { FACE_INSET, WordFace } from "./WordFace";

export type WordState = "open" | "said" | "yes" | "no";

export type WordCardProps = {
  word: string;
  /** YES price in whole cents, 0..100. */
  priceCents: number;
  state: WordState;
  /** The player's holding on this word, shown as a "You hold 40 YES" label. */
  position?: { side: "yes" | "no"; shares: number };
  /** Open cards open the ticket; SAID cards open cash out. Omit for a read-only card. */
  onPress?: () => void;
  /** The ticket is open for this word: the card lifts and wears the focus-blue outline. */
  selected?: boolean;
};

const FLIP = { type: "spring", duration: 0.45, bounce: 0.25 } as const;
const PRESS = { duration: 0.14, ease: EASE_OUT } as const;
const WORD_MIN_PX = 14;
const WORD_MAX_PX = 64;
/** The word may be at most this share of the card height; it lives in the bottom half. */
const WORD_HEIGHT_SHARE = 0.3;
/** How long reaction stickers stay out after a word is said. */
const BURST_MS = 1500;

const stateLabel: Record<WordState, string> = {
  open: "open",
  said: "said",
  yes: "settled yes",
  no: "settled no",
};

/**
 * A word market card. Flips split-flap style into SAID with reaction stickers, a wobble, a phone
 * shake, the `said` sound and a haptic tick; pulses when its price moves; settles with a stamp or
 * a fade. Fills its grid cell, so the board decides the size.
 */
export function WordCard({ word, priceCents, state, position, onPress, selected }: WordCardProps) {
  const reduce = useReducedMotion() ?? false;
  const settleDelay = useContext(SettleDelayContext);
  const fx = useEpisodeFx();
  const card = useRef<HTMLDivElement | null>(null);
  const anchorRef = fx.anchor(wordAnchor(word));
  const cardRef = useCallback(
    (node: HTMLDivElement | null) => {
      card.current = node;
      anchorRef(node);
    },
    [anchorRef],
  );
  const { size, boxRef, probeRef } = useFitText(word, {
    min: WORD_MIN_PX,
    max: WORD_MAX_PX,
    inset: FACE_INSET,
    heightShare: WORD_HEIGHT_SHARE,
  });

  // The face on screen and, while a transition runs, the face it is leaving at the price it had,
  // so a word jumping to the 98¢ bid as it flips never shows 98¢ on its open face.
  const [shown, setShown] = useState(state);
  const [from, setFrom] = useState<WordState | null>(null);
  const [fromPrice, setFromPrice] = useState(priceCents);
  const [committedPrice, setCommittedPrice] = useState(priceCents);
  if (state !== shown) {
    setFrom(shown);
    setFromPrice(committedPrice);
    setShown(state);
  }
  if (priceCents !== committedPrice) setCommittedPrice(priceCents);
  const flipping = from !== null && shown === "said" && from !== "said" && !reduce;

  const progress = useMotionValue(1);
  const press = useMotionValue(0);
  const hover = useMotionValue(0);
  const lift = useMotionValue(selected ? 1 : 0);
  const fold = useTransform(progress, (p) => Math.sin(Math.PI * Math.min(1, Math.max(0, p))));
  const sink = useTransform([fold, press], ([f, s]) => Math.max(f as number, s as number));
  const raise = useTransform([sink, hover, lift], ([s, h, l]) => {
    const down = s as number;
    return 2 * (h as number) * (1 - down) + 3 * (l as number) - 3 * down;
  });
  const y = useTransform(raise, (r) => -r);
  const shadowY = useTransform(raise, (r) => 4 + r);
  const boxShadow = useMotionTemplate`0 ${shadowY}px 0 currentColor`;
  const scale = useTransform(press, (s) => 1 - 0.03 * s);

  useEffect(() => {
    const controls = animate(lift, selected ? 1 : 0, PRESS);
    return () => controls.stop();
  }, [selected, lift]);

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

  // The SAID moment, only on a real transition, never on first render: sound, haptic, shake,
  // reaction stickers and a landing wobble.
  const [burst, setBurst] = useState({ key: 0, show: false });
  const previous = useRef(state);
  useEffect(() => {
    const was = previous.current;
    previous.current = state;
    if (state !== "said" || was === "said") return;
    play("said");
    navigator.vibrate?.(12);
    fx.shake();
    setBurst((b) => ({ key: b.key + 1, show: true }));
    if (!reduce && card.current) {
      animate(
        card.current,
        { scale: [1, 1.06, 0.985, 1], rotate: [0, -1.8, 0.8, 0] },
        { duration: 0.55, delay: 0.2, ease: "easeOut" },
      );
    }
  }, [state, fx, reduce]);

  useEffect(() => {
    if (!burst.show) return;
    const timer = setTimeout(() => setBurst((b) => ({ ...b, show: false })), BURST_MS);
    return () => clearTimeout(timer);
  }, [burst.show]);

  // Price moves on an open card: digits roll (RollingCents), the card glows and bumps.
  const [pulse, setPulse] = useState({ key: 0, delta: 0 });
  const lastPrice = useRef(priceCents);
  useEffect(() => {
    const delta = priceCents - lastPrice.current;
    lastPrice.current = priceCents;
    if (delta === 0 || state !== "open") return;
    setPulse((p) => ({ key: p.key + 1, delta }));
    if (!reduce && card.current) {
      animate(card.current, { scale: [1, 1.025, 1] }, { duration: 0.22, ease: "easeOut" });
    }
  }, [priceCents, state, reduce]);

  const settling = shown === "yes" || shown === "no";
  const faceProps = { word, priceCents, fontSize: size };
  const label = [
    word,
    formatCents(priceCents),
    stateLabel[shown],
    position ? formatHolding(position).toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div
      ref={cardRef}
      className="relative h-full min-h-0 w-full"
      style={{ zIndex: burst.show ? 20 : undefined }}
    >
      {/* One element type whether or not the card is pressable, so gaining or losing `onPress`
          mid-flip (open cards buy, SAID cards cash out) never remounts the faces. */}
      <motion.div
        ref={(node: HTMLDivElement | null) => {
          boxRef.current = node;
        }}
        {...(onPress ? {} : { role: "group", "aria-label": label })}
        className={`@container relative h-full w-full select-none overflow-hidden rounded-card border-2 border-current transition-[color,outline-color] duration-240 ease-out ${
          shown === "no" ? "text-no" : "text-ink"
        } ${selected ? "outline-3 outline-offset-3 outline-sky" : "outline-0 outline-transparent"}`}
        style={{ y, scale, boxShadow, transitionDelay: settling ? `${settleDelay}s` : "0s" }}
        {...(onPress
          ? {
              onTapStart: () => animate(press, 1, PRESS),
              onTap: () => animate(press, 0, PRESS),
              onTapCancel: () => animate(press, 0, PRESS),
              onHoverStart: () => animate(hover, 1, PRESS),
              onHoverEnd: () => animate(hover, 0, PRESS),
            }
          : {})}
      >
        <span
          ref={probeRef}
          aria-hidden
          className="font-headline pointer-events-none invisible absolute top-0 left-0 whitespace-nowrap uppercase"
        >
          {word}
        </span>
        <span aria-hidden>
          {from === null ? (
            <WordFace {...faceProps} state={shown} />
          ) : flipping ? (
            <SplitFlap
              progress={progress}
              back={from}
              backPrice={fromPrice}
              front={shown}
              faceProps={faceProps}
            />
          ) : (
            <>
              <WordFace {...faceProps} priceCents={fromPrice} state={from} />
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
        {pulse.key > 0 ? (
          <motion.span
            key={pulse.key}
            aria-hidden
            className={`pointer-events-none absolute inset-0 block mix-blend-multiply ${pulse.delta > 0 ? "bg-gain-tint" : "bg-sun-tint"}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.18, delay: 0.5, ease: EASE_OUT }}
          />
        ) : null}
        {onPress ? (
          <button
            type="button"
            aria-label={label}
            aria-haspopup="dialog"
            onClick={onPress}
            className="absolute inset-0 cursor-pointer touch-manipulation rounded-[22px] focus-visible:-outline-offset-4"
          />
        ) : null}
      </motion.div>
      <HoldingChip position={position} state={shown} />
      {shown === "open" ? <PriceDelta delta={pulse.delta} pulseKey={pulse.key} /> : null}
      <ReactionBurst word={word} burstKey={burst.key} show={burst.show} />
    </div>
  );
}
