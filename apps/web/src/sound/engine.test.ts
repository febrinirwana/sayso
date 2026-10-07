import { describe, expect, it, vi } from "vitest";
import {
  type AudioContextLike,
  type AudioParamLike,
  createSoundEngine,
  DUCK_RAMP_SECONDS,
  DUCKED_GAIN,
  MASTER_GAIN,
  MUTED_STORAGE_KEY,
  type SoundId,
  type StorageLike,
} from "./engine";

class FakeParam implements AudioParamLike {
  value = 1;
  ramps: { value: number; time: number }[] = [];
  cancelScheduledValues() {}
  setValueAtTime(value: number) {
    this.value = value;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.ramps.push({ value, time });
  }
}

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  stoppedAt: number | null = null;
  connect() {}
  start() {
    this.started = true;
  }
  stop(when = 0) {
    this.stoppedAt = when;
  }
}

class FakeContext implements AudioContextLike {
  currentTime = 0;
  destination = {};
  state = "suspended";
  gains: { gain: FakeParam; connect(): void }[] = [];
  sources: FakeSource[] = [];
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  createGain() {
    const node = { gain: new FakeParam(), connect() {} };
    this.gains.push(node);
    return node;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  silentBuffer = { silent: true };
  createBuffer() {
    return this.silentBuffer;
  }
  decodeAudioData(data: ArrayBuffer) {
    return Promise.resolve({ decoded: data.byteLength });
  }
  /** Sources started for real sounds, excluding the silent unlock buffer. */
  get played() {
    return this.sources.filter((source) => source.started && source.buffer !== this.silentBuffer);
  }
  get master() {
    const master = this.gains[0];
    if (!master) throw new Error("no master gain");
    return master.gain;
  }
}

class MemoryStorage implements StorageLike {
  values: Record<string, string> = {};
  getItem(key: string) {
    return this.values[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.values[key] = value;
  }
}

function setup(storage = new MemoryStorage()) {
  const context = new FakeContext();
  const fetchSound = vi.fn((_id: SoundId) => Promise.resolve(new ArrayBuffer(8)));
  const log = vi.fn();
  const engine = createSoundEngine({ createContext: () => context, fetchSound, storage, log });
  return { engine, context, fetchSound, log, storage };
}

/** Drains the fetch → decode → play promise chain without real timers. */
async function flush() {
  for (let hop = 0; hop < 10; hop += 1) await Promise.resolve();
}

describe("sound engine", () => {
  it("stays silent until the first gesture unlocks audio", async () => {
    const { engine, context, fetchSound } = setup();
    engine.play("tap");
    await flush();
    expect(fetchSound).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(0);

    engine.unlock();
    engine.play("tap");
    await flush();
    expect(context.state).toBe("running");
    expect(context.played).toHaveLength(1);
  });

  it("blocks playback while muted and remembers the choice across reloads", async () => {
    const { engine, context, storage } = setup();
    engine.unlock();
    engine.setMuted(true);
    engine.play("said");
    await flush();
    expect(context.played).toHaveLength(0);
    expect(storage.getItem(MUTED_STORAGE_KEY)).toBe("1");

    const reloaded = setup(storage);
    expect(reloaded.engine.isMuted()).toBe(true);
    reloaded.engine.setMuted(false);
    expect(setup(storage).engine.isMuted()).toBe(false);
  });

  it("notifies subscribers when mute changes", () => {
    const { engine } = setup();
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);
    engine.setMuted(true);
    engine.setMuted(true);
    unsubscribe();
    engine.setMuted(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("ducks the master gain under clip audio and restores it", () => {
    const { engine, context } = setup();
    engine.unlock();
    expect(context.master.value).toBe(MASTER_GAIN);

    context.currentTime = 2;
    engine.duck(true);
    expect(context.master.ramps.at(-1)).toEqual({
      value: DUCKED_GAIN,
      time: 2 + DUCK_RAMP_SECONDS,
    });

    engine.duck(false);
    expect(context.master.ramps.at(-1)?.value).toBe(MASTER_GAIN);
  });

  it("never plays more than three voices, fading out the oldest", async () => {
    const { engine, context } = setup();
    engine.unlock();
    for (const id of ["tap", "fill", "said", "cashout"] as const) engine.play(id);
    await flush();

    const [first, ...rest] = context.played;
    expect(context.played).toHaveLength(4);
    expect(first?.stoppedAt).not.toBeNull();
    expect(rest.every((source) => source.stoppedAt === null)).toBe(true);

    rest[0]?.onended?.();
    engine.play("tap");
    await flush();
    expect(rest.slice(1).every((source) => source.stoppedAt === null)).toBe(true);
  });

  it("drops a sound that loaded too late to match its moment", async () => {
    const { engine, context, fetchSound } = setup();
    // The web lib targets es2023, which has no Promise.withResolvers.
    let release: (data: ArrayBuffer) => void = () => {};
    const late = new Promise<ArrayBuffer>((resolve) => {
      release = resolve;
    });
    fetchSound.mockImplementation((id) =>
      id === "start" ? late : Promise.resolve(new ArrayBuffer(8)),
    );
    engine.unlock();
    engine.play("start");
    context.currentTime = 1;
    release(new ArrayBuffer(8));
    await flush();
    expect(context.played).toHaveLength(0);
  });

  it("keeps playing other sounds when one file fails, logging the failure once", async () => {
    const { engine, context, fetchSound, log } = setup();
    fetchSound.mockImplementation((id) =>
      id === "win" ? Promise.reject(new Error("404")) : Promise.resolve(new ArrayBuffer(8)),
    );
    engine.unlock();
    engine.play("win");
    engine.play("win");
    engine.play("tap");
    await flush();
    expect(log).toHaveBeenCalledTimes(1);
    expect(context.played).toHaveLength(1);
  });
});
