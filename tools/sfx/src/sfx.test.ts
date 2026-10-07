import { describe, expect, it } from "vitest";
import {
  correction,
  endSeconds,
  type Measurement,
  parseEbur128,
  signalStats,
  verdict,
} from "./audio";
import { parseArgs, parseSounds, type SoundSpec } from "./config";

describe("parseArgs", () => {
  it("reads ids and candidate count after the bun script separator", () => {
    expect(parseArgs(["generate", "--", "--only", "said,win", "--candidates", "1"])).toEqual({
      command: "generate",
      only: ["said", "win"],
      candidates: 1,
    });
  });

  it("refuses candidate counts that would burn free-plan credits", () => {
    expect(() => parseArgs(["generate", "--candidates", "9"])).toThrow(/1 to 4/);
  });

  it("shows help for --help on any command", () => {
    expect(parseArgs(["measure", "--help"]).command).toBe("help");
  });
});

describe("parseSounds", () => {
  const base = { id: "tap", prompt: "click", duration_seconds: 0.5, prompt_influence: 0.6 };

  it("gates short sounds on RMS and longer ones on LUFS", () => {
    const [tap, said] = parseSounds({
      sounds: [
        { ...base, max_seconds: 0.15, target_rms_db: -22 },
        { ...base, id: "said", max_seconds: 0.8, target_lufs: -22 },
      ],
    });
    expect(tap?.loudness).toEqual({ kind: "rms", target: -22 });
    expect(said?.loudness).toEqual({ kind: "lufs", target: -22 });
  });

  it("rejects a LUFS target on a sound too short to measure it", () => {
    expect(() =>
      parseSounds({ sounds: [{ ...base, max_seconds: 0.15, target_lufs: -22 }] }),
    ).toThrow(/target_rms_db/);
  });

  it("rejects requests shorter than ElevenLabs accepts", () => {
    expect(() =>
      parseSounds({
        sounds: [{ ...base, duration_seconds: 0.2, max_seconds: 0.15, target_rms_db: -22 }],
      }),
    ).toThrow(/0.5/);
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
    prompt: "ding",
    duration_seconds: 0.8,
    prompt_influence: 0.6,
    max_seconds: 0.8,
    loudness: { kind: "lufs", target: -22 },
  };

  it("raises gain toward target and lowers the ceiling when true peak overshoots", () => {
    expect(correction(spec.loudness, { lufs: -25, rmsDb: -25, truePeakDbtp: -2.5 }, 3, -4)).toEqual(
      {
        gainDb: 6,
        limitDb: -4.8,
      },
    );
  });

  it("stops once loudness is within half the tolerance and peak is under the ceiling", () => {
    expect(
      correction(spec.loudness, { lufs: -22.2, rmsDb: -25, truePeakDbtp: -3.5 }, 3, -4),
    ).toBeNull();
  });

  it("fails a file that runs past its maximum length or clips the ceiling", () => {
    const good: Measurement = {
      durationSeconds: 0.75,
      truePeakDbtp: -3.2,
      lufs: -22.1,
      rmsDb: -24,
      peakDb: -4,
      crestDb: 14,
      highShareDb: -20,
      leadSeconds: 0,
      tailSeconds: 0.5,
      bytes: 12000,
      sampleRate: 44100,
      channels: 1,
      bitRate: 128000,
    };
    expect(verdict(spec, good).ok).toBe(true);
    expect(
      verdict(spec, { ...good, durationSeconds: 0.81, truePeakDbtp: -2.9 }).failures,
    ).toHaveLength(2);
  });
});
