import { useEffect, useRef, useState } from "react";
import { duck, setMuted as setSoundMuted, useMuted } from "@/sound";
import { driftDecision, PRESENTATION_DELAY_MS } from "./model";

export type VideoSync = { now: () => number | null; startsAtMs: number; endsAtMs: number };
export type PlaybackObserver = (playheadMs: number | null) => void;
export function useVideoSync(
  src: string | undefined,
  sync: VideoSync | undefined,
  live: boolean,
  onPlayback?: PlaybackObserver,
) {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [soundMuted] = useMuted();
  const [source, setSource] = useState(src);
  if (source !== src) {
    setSource(src);
    setBlocked(false);
    setFailed(false);
  }
  useEffect(() => {
    const el = video.current;
    if (!el || !src || failed || blocked) {
      onPlayback?.(null);
      return;
    }
    let initial = true;
    let alive = true;
    let playPending = false;
    let hasPlayed = !el.paused && el.readyState >= 2;
    let buffering = el.paused || el.readyState < 2;
    let playhead: number | null = null;
    const sample = () => {
      // A seek target is not audio already heard. Freeze the last playable sample during
      // seeking/buffering; the presentation model bounds this hold to keep cash-out reachable.
      if (hasPlayed && !buffering && !el.paused && !el.seeking && el.readyState >= 2) {
        playhead = el.currentTime * 1_000;
      }
      onPlayback?.(playhead);
    };
    const playing = () => {
      hasPlayed = true;
      buffering = false;
      sample();
    };
    const waiting = () => {
      buffering = true;
      sample();
    };
    const update = () => {
      sample();
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
      if (correction.seek !== null && !el.seeking) el.currentTime = correction.seek;
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
    el.addEventListener("playing", playing);
    el.addEventListener("timeupdate", sample);
    el.addEventListener("waiting", waiting);
    el.addEventListener("seeking", waiting);
    el.addEventListener("pause", waiting);
    update();
    const timer = setInterval(update, 200);
    return () => {
      alive = false;
      clearInterval(timer);
      el.removeEventListener("loadedmetadata", update);
      el.removeEventListener("playing", playing);
      el.removeEventListener("timeupdate", sample);
      el.removeEventListener("waiting", waiting);
      el.removeEventListener("seeking", waiting);
      el.removeEventListener("pause", waiting);
      onPlayback?.(null);
      duck(false);
    };
  }, [src, sync, live, blocked, failed, onPlayback]);
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
