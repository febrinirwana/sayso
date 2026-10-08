import { useEffect, useRef, useState } from "react";
import { duck, setMuted as setSoundMuted, useMuted } from "@/sound";
import { driftDecision, PRESENTATION_DELAY_MS } from "./model";

export type VideoSync = { now: () => number | null; startsAtMs: number; endsAtMs: number };
export function useVideoSync(src: string | undefined, sync: VideoSync | undefined, live: boolean) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [soundMuted] = useMuted();
  useEffect(() => {
    const el = video.current;
    if (!el || !src) return;
    let initial = true;
    let alive = true;
    let playPending = false;
    const update = () => {
      if (el.readyState < 1) return;
      const now = sync?.now();
      if (sync && now == null) {
        el.pause();
        duck(false);
        return;
      }
      const elapsed =
        sync && now != null
          ? (now - sync.startsAtMs - PRESENTATION_DELAY_MS) / 1_000
          : el.currentTime;
      const target = Math.min(
        Number.isFinite(el.duration) ? Math.max(0, el.duration - 0.01) : Infinity,
        Math.max(0, elapsed),
      );
      const correction = driftDecision(target, el.currentTime, initial);
      if (correction.seek !== null) el.currentTime = correction.seek;
      initial = false;
      el.playbackRate = correction.rate;
      const playing = sync
        ? elapsed >= 0 && now != null && now < sync.endsAtMs + PRESENTATION_DELAY_MS
        : live;
      if (!playing) {
        el.pause();
        duck(false);
        return;
      }
      if (el.paused && !blocked && !playPending) {
        playPending = true;
        void el
          .play()
          .catch(async () => {
            if (!alive) return;
            el.muted = true;
            setMuted(true);
            try {
              await el.play();
            } catch {
              if (alive) setBlocked(true);
            }
          })
          .finally(() => {
            playPending = false;
          });
      }
      duck(!el.paused && !el.muted);
    };
    el.addEventListener("loadedmetadata", update);
    update();
    const timer = setInterval(update, 200);
    return () => {
      alive = false;
      clearInterval(timer);
      el.removeEventListener("loadedmetadata", update);
      duck(false);
    };
  }, [src, sync, live, blocked]);
  useEffect(() => {
    const el = video.current;
    if (el) {
      el.muted = muted || soundMuted;
      duck(!el.paused && !el.muted);
    }
  }, [muted, soundMuted]);
  return {
    video,
    muted: muted || soundMuted,
    blocked,
    failed,
    setFailed,
    unmute: () => {
      const el = video.current;
      if (!el || (sync && sync.now() === null)) return;
      el.muted = false;
      setSoundMuted(false);
      setMuted(false);
      setBlocked(false);
      void el.play().catch(() => setBlocked(true));
    },
  };
}
