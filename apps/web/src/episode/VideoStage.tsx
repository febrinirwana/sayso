import { Clock3 } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { duck } from "@/sound";
import { Voxel } from "@/ui/Voxel";
import { formatClock } from "./format";

type VideoStageProps = {
  src?: string;
  poster?: string;
  /** Playback stage: shows LIVE and plays the clip. */
  live: boolean;
  /** Pre-roll: seconds until the clip starts. Live: seconds left in the clip. */
  secondsLeft?: number;
  /** Overlay content above the frame, below the pills. */
  children?: ReactNode;
};

/** The 16:9 clip frame at the top of S3, full-bleed with an ink bottom edge. */
export function VideoStage({ src, poster, live, secondsLeft, children }: VideoStageProps) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (live) {
      // Autoplay with sound can be refused before the first gesture; the poster stays up then.
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [live]);

  // Unmounting mid-clip must not leave UI sounds ducked.
  useEffect(() => () => duck(false), []);

  return (
    <section
      aria-label="Clip"
      className={`relative aspect-video w-full overflow-hidden border-b-2 border-ink ${src || poster ? "bg-ink" : "bg-card"}`}
    >
      {src ? (
        // biome-ignore lint/a11y/useMediaCaption: a caption track is the transcript, served ahead of playback it leaks every outcome (CLAUDE.md rule 2).
        <video
          ref={video}
          src={src}
          poster={poster}
          playsInline
          preload="auto"
          className="absolute inset-0 size-full object-cover"
          onPlay={() => duck(true)}
          onPause={() => duck(false)}
          onEnded={() => duck(false)}
        />
      ) : poster ? (
        <img src={poster} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <PosterStand live={live} />
      )}
      {children}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        {live ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border-2 border-ink bg-said px-2.5 text-[12px] font-bold leading-none tracking-[0.08em] text-ink shadow-sticker">
            <span aria-hidden className="size-2 rounded-full bg-ink" />
            LIVE
          </span>
        ) : (
          <span />
        )}
        {secondsLeft !== undefined ? (
          <span
            className="tabular inline-flex h-7 items-center gap-1.5 rounded-full border-2 border-ink bg-card px-2.5 text-[13px] font-semibold leading-none text-ink shadow-sticker"
            role="timer"
            aria-label={
              live
                ? `${formatClock(secondsLeft)} left in the clip`
                : `Clip starts in ${formatClock(secondsLeft)}`
            }
          >
            <Clock3 aria-hidden size={14} strokeWidth={2.5} />
            {live ? formatClock(secondsLeft) : `Starts in ${formatClock(secondsLeft)}`}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** No clip yet: a paper stage with voxel props instead of a fake video frame. */
function PosterStand({ live }: { live: boolean }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
      <div className="relative flex items-end">
        <Voxel name="music-blue" size={44} className="-mr-2 mb-1 -rotate-12" />
        <Voxel name="computer" size={96} />
        <Voxel name="star" size={40} className="-ml-3 mb-10 rotate-12" />
      </div>
      <p className="text-sm font-medium text-ink-soft">
        {live ? "Loading the clip…" : "The clip rolls when the countdown ends."}
      </p>
    </div>
  );
}
