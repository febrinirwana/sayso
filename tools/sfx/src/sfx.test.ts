import { describe, expect, it } from "vitest";
import {
  AIR_HZ,
  bandShareDb,
  correction,
  dominantHz,
  endSeconds,
  longTermSpectrum,
  type Measurement,
  parseEbur128,
  scaleInterval,
  signalStats,
  snapToScale,
  spectralCentroid,
  verdict,
} from "./audio";
import { parseArgs, parseConfig, type SoundSpec } from "./config";

const RATE = 44100;

function sine(hz: number, seconds: number, amplitude = 0.5): Float32Array {
  return Float32Array.from(
    { length: Math.round(RATE * seconds) },
    (_, n) => amplitude * Math.sin((2 * Math.PI * hz * n) / RATE),
  );
}

describe("parseArgs", () => {
  it("reads ids and candidate count after the bun script separator", () => {
    expect(parseArgs(["generate", "--", "--only", "said,win", "--candidates", "1"])).toEqual({
      command: "generate",
      only: ["said", "win"],
      candidates: 1,
    });
    expect(parseArgs(["generate"]).candidates).toBe(3);
  });

  it("refuses candidate counts that would burn free-plan credits", () => {
    expect(() => parseArgs(["generate", "--candidates", "9"])).toThrow(/1 to 4/);
  });

  it("shows help for --help on any command", () => {
    expect(parseArgs(["measure", "--help"]).command).toBe("help");
  });
});

describe("parseConfig", () => {
  const bell = {
    id: "bell",
    prompt: "ding",
    duration_seconds: 0.6,
    prompt_influence: 0.7,
    tune: "C6",
  };
  const flap = { id: "flap", prompt: "clack", duration_seconds: 0.5, prompt_influence: 0.7 };
  const config = (sounds: unknown[], sources: unknown[] = [bell, flap]) =>
    parseConfig({ sources, sounds });

  it("gates short sounds on RMS and longer ones on LUFS, defaulting to one plain layer", () => {
    const { sounds } = config([
      { id: "tap", max_seconds: 0.15, target_rms_db: -19, parts: [{ source: "flap" }] },
      {
        id: "said",
        max_seconds: 0.9,
        target_lufs: -16,
        parts: [
          { source: "flap" },
          { source: "bell", layers: [{ steps: 2, delay_ms: 60, gain_db: -2 }] },
        ],
      },
    ]);
    expect(sounds[0]?.loudness).toEqual({ kind: "rms", target: -19 });
    expect(sounds[0]?.parts[0]?.layers).toEqual([{ semitones: 0, delay_ms: 0, gain_db: 0 }]);
    expect(sounds[1]?.loudness).toEqual({ kind: "lufs", target: -16 });
    expect(sounds[1]?.parts[1]?.layers).toEqual([{ steps: 2, delay_ms: 60, gain_db: -2 }]);
  });

  it("rejects a LUFS target on a sound too short to measure it", () => {
    expect(() =>
      config([{ id: "tap", max_seconds: 0.15, target_lufs: -18, parts: [{ source: "flap" }] }]),
    ).toThrow(/target_rms_db/);
  });

  it("rejects requests shorter than ElevenLabs accepts", () => {
    expect(() => config([], [{ ...flap, duration_seconds: 0.2 }])).toThrow(/0.5/);
  });

  it("rejects unknown sources and scale steps on an untuned source", () => {
    const sound = { id: "tap", max_seconds: 0.15, target_rms_db: -19 };
    expect(() => config([{ ...sound, parts: [{ source: "harp" }] }])).toThrow(/unknown source/);
    expect(() =>
      config([
        { ...sound, parts: [{ source: "flap", layers: [{ steps: 1, delay_ms: 0, gain_db: 0 }] }] },
      ]),
    ).toThrow(/tuned source/);
  });
});

describe("spectrum", () => {
  it("puts a pure tone's centroid and pitch on its frequency", () => {
    const spectrum = longTermSpectrum(sine(1000, 0.3), RATE);
    expect(spectralCentroid(spectrum)).toBeGreaterThan(950);
    expect(spectralCentroid(spectrum)).toBeLessThan(1050);
    expect(dominantHz(spectrum)).toBeCloseTo(1000, -1);
  });

  it("measures the share of energy above 10 kHz", () => {
    const low = sine(1000, 0.3);
    const mixed = sine(12000, 0.3).map((value, n) => value + (low[n] ?? 0));
    expect(bandShareDb(longTermSpectrum(low, RATE), AIR_HZ)).toBeLessThan(-60);
    expect(bandShareDb(longTermSpectrum(mixed, RATE), AIR_HZ)).toBeCloseTo(-3, 0);
  });
});

describe("tuning", () => {
  it("snaps to the nearest C major pentatonic note", () => {
    expect(snapToScale(1046.5, 84)).toMatchObject({ midi: 84, note: "C6" });
    // F5 (698 Hz) sits between E5 and G5; it lands on E5, one semitone down.
    const f5 = snapToScale(698.46, 76);
    expect(f5.note).toBe("E5");
    expect(f5.semitones).toBeCloseTo(-1, 2);
    // A sharp tone is pulled down by its few cents.
    expect(snapToScale(445, 69).semitones).toBeCloseTo(-12 * Math.log2(445 / 440), 4);
  });

  it("moves a candidate by octaves into the source's home register", () => {
    // A bell generated at C7 plays its figures from C6 when home is C6.
    const high = snapToScale(2093, 84);
    expect(high.note).toBe("C6");
    expect(high.semitones).toBeCloseTo(-12, 2);
    // Within six semitones of home stays put; further moves by an octave.
    expect(snapToScale(1318.5, 84).note).toBe("E6");
    expect(snapToScale(1568, 84).note).toBe("G5");
  });

  it("counts scale steps so every figure stays in key", () => {
    expect(scaleInterval(72, 2)).toBe(4); // C -> E
    expect(scaleInterval(79, 2)).toBe(5); // G -> C
    expect(scaleInterval(72, 5)).toBe(12); // one octave
    expect(scaleInterval(72, -1)).toBe(-3); // C -> A below
    expect(() => scaleInterval(77, 1)).toThrow(/pentatonic/);
  });
});

describe("parseEbur128", () => {
  it("reads integrated loudness and true peak from the summary", () => {
    const stderr = `[Parsed_ebur128_1 @ 0x1] Summary:

  Integrated loudness:
    I:         -21.7 LUFS
    Threshold: -32.0 LUFS

  True peak:
    Peak:       -3.4 dBFS`;
    expect(parseEbur128(stderr)).toEqual({ lufs: -21.7, truePeakDbtp: -3.4 });
  });

  it("reports no loudness when every block is gated out", () => {
    const stderr = "Summary:\n I: -70.0 LUFS\n True peak:\n Peak: -12.0 dBFS";
    expect(parseEbur128(stderr).lufs).toBeNull();
  });
});

describe("signalStats", () => {
  it("measures lead silence, level and the tail after the loudest moment", () => {
    const rate = 1000;
    const samples = new Float32Array(500);
    samples.fill(0.5, 100, 200);
    samples.fill(0.1, 200, 500);
    const stats = signalStats(samples, rate);
    expect(stats.leadSeconds).toBeCloseTo(0.1);
    expect(stats.peakDb).toBeCloseTo(20 * Math.log10(0.5));
    expect(stats.tailSeconds).toBeCloseTo(0.4);
  });
});

describe("endSeconds", () => {
  const rate = 1000;

  it("cuts a long low tail once it falls 45 dB under the loudest moment", () => {
    const samples = new Float32Array(1000);
    samples.fill(0.5, 0, 200);
    samples.fill(0.001, 200, 1000); // -54 dB under the hit: inaudible ringing
    expect(endSeconds(samples, rate, 2)).toBeCloseTo(0.2 + 0.03);
  });

  it("keeps an audible decay and never runs past the maximum length", () => {
    const samples = new Float32Array(1000);
    samples.fill(0.5, 0, 200);
    samples.fill(0.05, 200, 1000); // -20 dB: still part of the sound
    expect(endSeconds(samples, rate, 2)).toBeCloseTo(1);
    expect(endSeconds(samples, rate, 0.6)).toBeCloseTo(0.59);
  });
});

describe("mastering", () => {
  const spec: SoundSpec = {
    id: "said",
    max_seconds: 0.9,
    loudness: { kind: "lufs", target: -16 },
    parts: [{ source: "bell", layers: [{ steps: 0, delay_ms: 0, gain_db: 0 }] }],
  };

  it("raises gain toward target and lowers the ceiling when true peak overshoots", () => {
    const next = correction(spec.loudness, { lufs: -19, rmsDb: -19, truePeakDbtp: -1 }, 3, -2.5);
    expect(next?.gainDb).toBeCloseTo(6);
    expect(next?.limitDb).toBeCloseTo(-3.3);
  });

  it("stops once loudness is within half the tolerance and peak is under the ceiling", () => {
    expect(
      correction(spec.loudness, { lufs: -16.2, rmsDb: -19, truePeakDbtp: -1.8 }, 3, -2.5),
    ).toBeNull();
  });

  const good: Measurement = {
    durationSeconds: 0.75,
    truePeakDbtp: -1.7,
    lufs: -16.1,
    rmsDb: -18,
    peakDb: -2,
    crestDb: 14,
    centroidHz: 2400,
    airShareDb: -26,
    leadSeconds: 0,
    tailSeconds: 0.5,
    bytes: 12000,
    sampleRate: 44100,
    channels: 1,
    bitRate: 128000,
  };

  it("fails a file that runs past its maximum length or clips the ceiling", () => {
    expect(verdict(spec, good).ok).toBe(true);
    expect(
      verdict(spec, { ...good, durationSeconds: 0.91, truePeakDbtp: -1.4 }).failures,
    ).toHaveLength(2);
  });

  it("fails a dull or fizzy file", () => {
    expect(verdict(spec, { ...good, centroidHz: 800 }).failures).toEqual(["centroid 800 Hz"]);
    expect(verdict(spec, { ...good, centroidHz: 6500 }).ok).toBe(false);
    expect(verdict(spec, { ...good, airShareDb: -12 }).failures).toEqual([">10k -12.0 dB"]);
  });
});
