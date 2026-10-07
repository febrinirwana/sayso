export const SOUND_IDS = [
  "tap",
  "sheet",
  "confirm",
  "fill",
  "said",
  "cashout",
  "tick",
  "start",
  "win",
  "lose",
  "redeem",
] as const;

export type SoundId = (typeof SOUND_IDS)[number];

export const MASTER_GAIN = 0.5;
export const DUCKED_GAIN = 0.3;
export const DUCK_RAMP_SECONDS = 0.12;
export const MAX_VOICES = 3;
export const MUTED_STORAGE_KEY = "sayso.muted";
/** A sound that arrives later than this after `play` is dropped: late feedback reads as a glitch. */
export const MAX_START_LATENCY_SECONDS = 0.25;
/** Fade applied to a voice stolen by the voice cap, so the cut never clicks. */
const STEAL_FADE_SECONDS = 0.015;
/** The same sound requested again within this window plays once: simultaneous flips would just sound louder. */
const SAME_SOUND_WINDOW_SECONDS = 0.06;

export interface AudioParamLike {
  value: number;
  cancelScheduledValues(time: number): unknown;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

export interface GainNodeLike {
  readonly gain: AudioParamLike;
  connect(destination: never): unknown;
}

export interface SourceNodeLike {
  buffer: unknown;
  onended: ((event: never) => unknown) | null;
  connect(destination: never): unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly destination: unknown;
  readonly state: string;
  resume(): Promise<void>;
  createGain(): GainNodeLike;
  createBufferSource(): SourceNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): unknown;
  decodeAudioData(data: ArrayBuffer): Promise<unknown>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type EngineDeps = {
  /** Called inside a user gesture; returns null when Web Audio is unavailable. */
  createContext: () => AudioContextLike | null;
  fetchSound: (id: SoundId) => Promise<ArrayBuffer>;
  storage: StorageLike | null;
  log: (message: string, error?: unknown) => void;
};

type Voice = { source: SourceNodeLike; gain: GainNodeLike };

export interface SoundEngine {
  /** Call from a user gesture. Creates the context once, then resumes it after interruptions. */
  unlock(): void;
  isUnlocked(): boolean;
  play(id: SoundId): void;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  duck(active: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function createSoundEngine(deps: EngineDeps): SoundEngine {
  let context: AudioContextLike | null = null;
  let master: GainNodeLike | null = null;
  let muted = readMuted(deps.storage);
  let ducked = false;
  let contextFailed = false;
  const buffers = new Map<SoundId, Promise<unknown>>();
  const voices: Voice[] = [];
  const lastRequested = new Map<SoundId, number>();
  const listeners = new Set<() => void>();

  function targetGain(): number {
    if (muted) return 0;
    return ducked ? DUCKED_GAIN : MASTER_GAIN;
  }

  function rampMaster(): void {
    if (!context || !master) return;
    const now = context.currentTime;
    const param = master.gain;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(targetGain(), now + DUCK_RAMP_SECONDS);
  }

  function load(id: SoundId): Promise<unknown> {
    const cached = buffers.get(id);
    if (cached) return cached;
    const ctx = context;
    const pending = deps
      .fetchSound(id)
      .then((data) => ctx?.decodeAudioData(data) ?? null)
      .catch((error: unknown) => {
        deps.log(`sound "${id}" failed to load`, error);
        return null;
      });
    buffers.set(id, pending);
    return pending;
  }

  function startVoice(buffer: unknown): void {
    if (!context || !master || muted) return;
    while (voices.length >= MAX_VOICES) {
      const oldest = voices.shift();
      if (oldest) fadeOut(oldest, context.currentTime);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.connect(gain as never);
    gain.connect(master as never);
    const voice: Voice = { source, gain };
    source.onended = () => {
      const index = voices.indexOf(voice);
      if (index !== -1) voices.splice(index, 1);
    };
    voices.push(voice);
    source.start(0);
  }

  function fadeOut(voice: Voice, now: number): void {
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + STEAL_FADE_SECONDS);
      voice.source.stop(now + STEAL_FADE_SECONDS);
    } catch {
      // A voice that already ended cannot be stopped; nothing to do.
    }
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  return {
    unlock(): void {
      try {
        if (!context) {
          if (contextFailed) return;
          const ctx = deps.createContext();
          if (!ctx) {
            contextFailed = true;
            return;
          }
          context = ctx;
          master = ctx.createGain();
          master.gain.value = targetGain();
          master.connect(ctx.destination as never);
          // iOS only unlocks output once a source starts inside the gesture.
          const silent = ctx.createBufferSource();
          silent.buffer = ctx.createBuffer(1, 1, 22050);
          silent.connect(ctx.destination as never);
          silent.start(0);
          for (const id of SOUND_IDS) void load(id);
        }
        if (context.state !== "running") {
          context.resume().catch((error: unknown) => deps.log("audio resume failed", error));
        }
      } catch (error) {
        contextFailed = true;
        context = null;
        master = null;
        deps.log("audio unlock failed", error);
      }
    },

    isUnlocked(): boolean {
      return context !== null;
    },

    play(id: SoundId): void {
      try {
        const ctx = context;
        if (!ctx || muted) return;
        const requestedAt = ctx.currentTime;
        const last = lastRequested.get(id);
        if (last !== undefined && requestedAt - last < SAME_SOUND_WINDOW_SECONDS) return;
        lastRequested.set(id, requestedAt);
        void load(id).then((buffer) => {
          try {
            if (buffer === null) return;
            if (ctx.currentTime - requestedAt > MAX_START_LATENCY_SECONDS) return;
            startVoice(buffer);
          } catch (error) {
            deps.log(`sound "${id}" failed to play`, error);
          }
        });
      } catch (error) {
        deps.log(`sound "${id}" failed to play`, error);
      }
    },

    setMuted(next: boolean): void {
      if (next === muted) return;
      muted = next;
      try {
        deps.storage?.setItem(MUTED_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Private mode can refuse storage; the in-memory setting still applies.
      }
      try {
        rampMaster();
      } catch (error) {
        deps.log("audio gain change failed", error);
      }
      notify();
    },

    isMuted(): boolean {
      return muted;
    },

    duck(active: boolean): void {
      if (active === ducked) return;
      ducked = active;
      try {
        rampMaster();
      } catch (error) {
        deps.log("audio gain change failed", error);
      }
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function readMuted(storage: StorageLike | null): boolean {
  try {
    return storage?.getItem(MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
