import { Clock3, EyeOff, Lock } from "lucide-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { useVideoSync, type VideoSync } from "@/live/useVideoSync";
import { duck, play } from "@/sound";
import { Voxel } from "@/ui/Voxel";
import { ClipTimeline, type SaidMark } from "./ClipTimeline";
import { type StageMoment, stageCue } from "./cues";
import { formatClock } from "./format";

// Pre-roll hides the frame: a blur of 6 % of the frame's width washes out faces and on-screen
// text at every size; the slight zoom pushes the blur's soft edge out of the frame. Kickoff
// sharpens it in one ease-out (reduced motion: a short unblur, no zoom).
const HIDDEN_FILTER = "blur(6cqw) saturate(1.2)";
const HIDDEN_SCALE = "scale(1.15)";
const REVEAL = "filter 550ms var(--ease-out), transform 550ms var(--ease-out)";
const REDUCED_REVEAL = "filter 150ms var(--ease-out)";

type VideoStageProps = {
  src?: string;
  poster?: string;
  /** Playback stage: shows LIVE and plays the clip. */
  live: boolean;
  /** The clip has finished (episode closed or settled): the LIVE pill and the clock step down. */
  ended?: boolean;
  /** Pre-roll: seconds until the clip starts. Live: seconds left in the clip. */
  secondsLeft?: number | undefined;
  /** Pre-roll: seconds until bets close; undefined once they have closed. */
  betsCloseIn?: number | undefined;
  /** Clip length; with `live` and `secondsLeft` it draws the progress bar. */
  durationSeconds?: number;
  /** Words already SAID and when, as red dots on the progress bar. */
  marks?: readonly SaidMark[];
  /** Overlay content above the frame, below the pills. */
  children?: ReactNode;
  /** A stand-in frame for specimens without a clip file; hidden and revealed like the video. */
  frame?: ReactNode;
  className?: string;
  sync?: VideoSync;
};

/**
 * The 16:9 clip frame: full-bleed with an ink bottom edge on phones, a raised sticker frame from
 * tablet up. LIVE pill and clock ride on top; pre-roll hides the frame under a heavy blur with a
 * big countdown and the bets clock, then sharpens it as playback starts; playback shows the
 * progress bar with SAID dots. Plays `tick` in the last five pre-roll seconds and `start` on go.
 */
export function VideoStage({
  src,
  poster,
  live,
  ended = false,
  secondsLeft,
  betsCloseIn,
  durationSeconds,
  marks,
  children,
  frame,
  className,
  sync,
}: VideoStageProps) {
  const { video, muted, blocked, failed, setFailed, unmute } = useVideoSync(src, sync, live);
  // The src whose first frame has decoded. Until then (slow network, a browser without the codec,
  // a missing file) the stage shows its poster stand instead of an empty ink block.
  const [framed, setFramed] = useState<string>();
  const showsFrame = !!src && framed === src && !failed;
  // Nobody may identify the clip before kickoff: the frame stays blurred until playback starts.
  const hidden = !live && !ended;
  const reduce = useReducedMotion() ?? false;
  const moment = useRef<StageMoment | null>(null);
  useEffect(() => {
    const next = { live, secondsLeft };
    const cue = stageCue(moment.current, next);
    moment.current = next;
    if (cue) play(cue);
  }, [live, secondsLeft]);

  // Unmounting mid-clip must not leave UI sounds ducked.
  useEffect(() => () => duck(false), []);

  return (
    <section
      aria-label="Clip"
      className={`@container relative aspect-video w-full overflow-hidden border-b-2 border-ink md:rounded-card md:border-2 md:shadow-sticker-lg ${showsFrame || poster ? "bg-ink" : "bg-sky-tint"} ${className ?? ""}`}
    >
      {showsFrame || poster || frame ? null : <PosterStand live={live && !failed} />}
      <div
        className="absolute inset-0"
        style={{
          filter: hidden ? HIDDEN_FILTER : "none",
          transform: hidden && !reduce ? HIDDEN_SCALE : "none",
          transition: reduce ? REDUCED_REVEAL : REVEAL,
        }}
      >
        {showsFrame ? null : poster ? (
          <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          frame
        )}
        {src ? (
          // biome-ignore lint/a11y/useMediaCaption: a caption track is the transcript, served ahead of playback it leaks every outcome (CLAUDE.md rule 2).
          <video
            ref={video}
            src={src}
            playsInline
            preload="auto"
            className={`absolute inset-0 size-full object-cover ${showsFrame ? "" : "opacity-0"}`}
            onLoadedData={() => setFramed(src)}
            onPlay={() => duck(!video.current?.muted)}
            onPause={() => duck(false)}
            onEnded={() => duck(false)}
            onError={() => setFailed(true)}
          />
        ) : null}
      </div>
      {children}
      {src && (muted || blocked) && !ended ? (
        <button
          type="button"
          onClick={() => {
            unmute();
          }}
          className="sticker pressable absolute bottom-12 left-3 rounded-full px-4 py-2 text-[13px] font-bold"
        >
          {blocked ? "Tap to play with sound" : "Tap to unmute"}
        </button>
      ) : null}
      {failed ? (
        <p role="status" className="absolute inset-x-4 top-14 rounded-xl bg-card p-3 text-[13px]">
          Clip unavailable. The board still follows the chain.
        </p>
      ) : null}
      {hidden && !failed ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center md:bottom-4">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border-2 border-ink bg-card px-2.5 text-[11px] font-extrabold uppercase leading-none tracking-[0.1em] text-ink md:h-8 md:text-[12px]">
            <EyeOff aria-hidden size={14} strokeWidth={2.75} />
            Clip hidden until kickoff
          </span>
        </p>
      ) : null}
      {!live && secondsLeft !== undefined ? (
        <PreRollCountdown secondsLeft={secondsLeft} betsCloseIn={betsCloseIn} />
      ) : null}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2 md:inset-x-4 md:top-4">
        {ended ? (
          <span className="inline-flex h-8 items-center rounded-full border-2 border-ink bg-card px-3 text-[12px] font-extrabold leading-none tracking-[0.12em] text-ink shadow-sticker">
            CLIP ENDED
          </span>
        ) : live ? (
          <span className="inline-flex h-8 items-center gap-2 rounded-full border-2 border-ink bg-said px-3 text-[13px] font-extrabold leading-none tracking-[0.12em] text-ink shadow-sticker">
            <LiveDot />
            LIVE
          </span>
        ) : (
          <span className="inline-flex h-8 items-center rounded-full border-2 border-ink bg-card px-3 text-[12px] font-extrabold leading-none tracking-[0.12em] text-ink shadow-sticker">
            PRE-ROLL
          </span>
        )}
        {secondsLeft !== undefined && !ended ? (
          <span
            className="tabular inline-flex h-8 items-center gap-1.5 rounded-full border-2 border-ink bg-card px-3 text-[14px] font-bold leading-none text-ink shadow-sticker"
            role="timer"
            aria-label={
              live
                ? `${formatClock(secondsLeft)} left in the clip`
                : `Clip starts in ${formatClock(secondsLeft)}`
            }
          >
            <Clock3 aria-hidden size={15} strokeWidth={2.5} />
            {live ? `${formatClock(secondsLeft)} left` : formatClock(secondsLeft)}
          </span>
        ) : null}
      </div>
      {live && secondsLeft !== undefined && durationSeconds !== undefined ? (
        <div className="absolute inset-x-3 bottom-3 md:inset-x-4 md:bottom-4">
          <ClipTimeline
            durationSeconds={durationSeconds}
            secondsLeft={secondsLeft}
            {...(marks ? { marks } : {})}
          />
        </div>
      ) : null}
    </section>
  );
}

function LiveDot() {
  const reduce = useReducedMotion() ?? false;
  return (
    <span aria-hidden className="relative flex size-2.5">
      {reduce ? null : (
        <motion.span
          className="absolute inset-0 rounded-full bg-ink"
          animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
          transition={{ duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
        />
      )}
      <span className="relative size-2.5 rounded-full bg-ink" />
    </span>
  );
}

/**
 * Big sticker countdown over the hidden frame with the bets clock beneath it; the last five
 * seconds pop in step with `tick`.
 */
function PreRollCountdown({
  secondsLeft,
  betsCloseIn,
}: {
  secondsLeft: number;
  betsCloseIn: number | undefined;
}) {
  const reduce = useReducedMotion() ?? false;
  const shown = Math.ceil(secondsLeft);
  const final = shown <= 5 && shown > 0;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="sticker flex -rotate-2 flex-col items-center px-5 pt-2 pb-3 shadow-sticker-lg md:px-8 md:pt-3 md:pb-4">
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-ink-soft md:text-[13px]">
          CLIP STARTS IN
        </span>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={final ? shown : "clock"}
            className="font-headline tabular text-[44px] leading-none md:text-[72px] lg:text-[88px]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ type: "spring", duration: 0.35, bounce: 0.4 }}
          >
            {final ? shown : formatClock(secondsLeft)}
          </motion.span>
        </AnimatePresence>
        <span
          className={`tabular mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold text-ink transition-colors duration-180 ease-out md:text-[14px] ${betsCloseIn !== undefined && betsCloseIn <= 10 ? "bg-sun" : "bg-line"}`}
        >
          {betsCloseIn === undefined ? (
            <>
              <Lock aria-hidden size={13} strokeWidth={2.75} />
              Bets locked — watch
            </>
          ) : (
            `Bets close in ${formatClock(betsCloseIn)}`
          )}
        </span>
      </div>
    </div>
  );
}

const PROPS: readonly { name: VoxelName; className: string; size: number; delay: number }[] = [
  { name: "music-blue", className: "left-[9%] top-[22%] w-[13%]", size: 128, delay: 0 },
  { name: "star", className: "right-[10%] top-[16%] w-[14%]", size: 128, delay: 0.6 },
  { name: "cd-player", className: "right-[16%] bottom-[18%] w-[12%]", size: 128, delay: 1.1 },
  { name: "globe", className: "left-[15%] bottom-[16%] w-[11%]", size: 128, delay: 1.7 },
];

/** No clip yet: a studio backdrop with bobbing voxel props instead of a fake video frame. */
function PosterStand({ live }: { live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useInView(ref);
  const reduce = useReducedMotion() ?? false;
  const bob = !reduce && visible;
  return (
    <div
      ref={ref}
      className="absolute inset-0 bg-[radial-gradient(circle,rgb(79_82_232/0.16)_1.5px,transparent_1.6px)] bg-size-[18px_18px]"
    >
      {PROPS.map((prop) => (
        <motion.span
          key={prop.name}
          className={`absolute block aspect-square ${prop.className}`}
          animate={bob ? { y: [0, -8, 0], rotate: [-4, 4, -4] } : { y: 0, rotate: 0 }}
          transition={
            bob
              ? {
                  duration: 3.2,
                  delay: prop.delay,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: "easeInOut",
                }
              : { duration: 0.2 }
          }
        >
          <Voxel name={prop.name} size={prop.size} className="size-full" />
        </motion.span>
      ))}
      {live ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Voxel name="computer" size={128} className="h-auto w-[26%] max-w-[180px]" />
          <p className="rounded-full bg-card px-3 py-1 text-[13px] font-semibold text-ink-soft">
            Loading the clip…
          </p>
        </div>
      ) : null}
    </div>
  );
}
