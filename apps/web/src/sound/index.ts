import { useSyncExternalStore } from "react";
import { createSoundEngine, type SoundId, type StorageLike } from "./engine";

export type { SoundId } from "./engine";

const loggedOnce = new Set<string>();

const engine = createSoundEngine({
  createContext: () => {
    if (typeof window === "undefined") return null;
    const Ctor =
      window.AudioContext ??
      ("webkitAudioContext" in window ? (window.webkitAudioContext as typeof AudioContext) : null);
    return Ctor ? new Ctor({ latencyHint: "interactive" }) : null;
  },
  fetchSound: async (id) => {
    const response = await fetch(`${import.meta.env.BASE_URL}sfx/${id}.mp3`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.arrayBuffer();
  },
  storage: safeStorage(),
  log: (message, error) => {
    if (loggedOnce.has(message)) return;
    loggedOnce.add(message);
    console.warn(`[sound] ${message}`, error);
  },
  random: Math.random,
});

if (typeof window !== "undefined") {
  const unlock = () => engine.unlock();
  const options = { capture: true, passive: true } as const;
  window.addEventListener("pointerdown", unlock, options);
  window.addEventListener("keydown", unlock, options);
  // Older iOS only honours audio unlock on touchend.
  window.addEventListener("touchend", unlock, options);
}

/** Plays a UI sound. Silent before the first gesture, while muted, or if the file fails. */
export function play(id: SoundId): void {
  engine.play(id);
}

export function setMuted(muted: boolean): void {
  engine.setMuted(muted);
}

export function isMuted(): boolean {
  return engine.isMuted();
}

/** Lowers UI sounds while the clip's own audio plays. */
export function duck(active: boolean): void {
  engine.duck(active);
}

export function useMuted(): readonly [boolean, (muted: boolean) => void] {
  const muted = useSyncExternalStore(engine.subscribe, engine.isMuted, engine.isMuted);
  return [muted, setMuted] as const;
}

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
