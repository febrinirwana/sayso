import {
  type Loudness,
  LUFS_TOLERANCE,
  MAX_TRUE_PEAK_DBTP,
  RMS_TOLERANCE_DB,
  SHORT_SOUND_SECONDS,
  type SoundSpec,
} from "./config";

export const FADE_IN_SECONDS = 0.005;
export const FADE_OUT_SECONDS = 0.03;
export const SILENCE_DB = -50;
/** Safety margin under max_seconds for MP3 frame padding. */
const LENGTH_MARGIN_SECONDS = 0.01;
/** MP3 encoding adds inter-sample peaks; aim the limiter this far under the ceiling. */
export const LIMITER_HEADROOM_DB = 1;

export interface Measurement {
  durationSeconds: number;
  truePeakDbtp: number;
  /** Integrated loudness; null when the file is too short for an EBU R128 block. */
  lufs: number | null;
  rmsDb: number;
  peakDb: number;
  crestDb: number;
  /** RMS above 8 kHz relative to full-band RMS; higher reads as harsher. */
  highShareDb: number;
  /** Silence before the first sample over -50 dBFS. */
  leadSeconds: number;
  /** Time from the loudest 10 ms to the end; long tails blur into the clip's speech. */
  tailSeconds: number;
  bytes: number;
  sampleRate: number;
  channels: number;
  bitRate: number;
}

export interface Verdict {
  ok: boolean;
  failures: string[];
}

/** A tail is cut once it falls this far under the loudest 10 ms; quieter decay is inaudible on a phone. */
export const TAIL_FLOOR_DB = -45;
const WINDOW_SECONDS = 0.01;

/**
 * Stage 1: mono 44.1 kHz float, optional re-pitched layers, rumble and fizz filtered, leading
 * silence under -50 dBFS removed.
 */
export function shapeFilter(spec: Pick<SoundSpec, "lowpass_hz" | "layers">): string {
  const lead = `silenceremove=start_periods=1:start_threshold=${SILENCE_DB}dB:start_silence=0.002:detection=peak`;
  const chain = [
    "highpass=f=80:poles=2",
    // Two cascaded 12 dB/oct sections: steep enough to take coin fizz off without dulling the ring below.
    ...(spec.lowpass_hz
      ? [`lowpass=f=${spec.lowpass_hz}:poles=2`, `lowpass=f=${spec.lowpass_hz}:poles=2`]
      : []),
    lead,
  ].join(",");
  // Leading silence also goes before layering so each layer's onset lands exactly at its delay.
  const input = `aresample=44100,aformat=sample_fmts=flt:channel_layouts=mono,${lead}`;
  const layers = spec.layers;
  if (!layers) return `${input},${chain}`;
  // asetrate re-pitches by playing the samples faster, so higher notes also decay faster, like a shorter bar.
  const voices = layers.map(
    (layer, index) =>
      `[l${index}]asetrate=${(44100 * 2 ** (layer.semitones / 12)).toFixed(2)},aresample=44100,` +
      `adelay=${layer.delay_ms}:all=1,volume=${layer.gain_db}dB[v${index}]`,
  );
  const split = `${input},asplit=${layers.length}${layers.map((_, index) => `[l${index}]`).join("")}`;
  const mix = `${layers.map((_, index) => `[v${index}]`).join("")}amix=inputs=${layers.length}:normalize=0:duration=longest`;
  return [split, ...voices, `${mix},${chain}`].join(";");
}

/** Where the shaped sound should end: its decay under TAIL_FLOOR_DB, never past max_seconds. */
export function endSeconds(samples: Float32Array, sampleRate: number, maxSeconds: number): number {
  const window = Math.max(1, Math.round(sampleRate * WINDOW_SECONDS));
  const energies: number[] = [];
  for (let start = 0; start < samples.length; start += window) {
    let energy = 0;
    const stop = Math.min(samples.length, start + window);
    for (let index = start; index < stop; index += 1) energy += (samples[index] ?? 0) ** 2;
    energies.push(energy / (stop - start));
  }
  const floor = Math.max(...energies, 0) * 10 ** (TAIL_FLOOR_DB / 10);
  let last = energies.length - 1;
  while (last > 0 && (energies[last] ?? 0) < floor) last -= 1;
  const decayEnd = ((last + 1) * window) / sampleRate + FADE_OUT_SECONDS;
  return Math.min(decayEnd, samples.length / sampleRate, maxSeconds - LENGTH_MARGIN_SECONDS);
}

/** Stage 2: cut and fade, gain, then a 4x oversampled lookahead limiter as the true-peak ceiling. */
export function masterFilter(end: number, gainDb: number, limitDb: number): string {
  const limit = Math.min(1, Math.max(0.0625, 10 ** (limitDb / 20)));
  return [
    `atrim=end=${end.toFixed(4)}`,
    "asetpts=PTS-STARTPTS",
    `afade=t=in:d=${FADE_IN_SECONDS}`,
    // Reversing lets the fade-out run without knowing the exact decoded length.
    "areverse",
    `afade=t=in:d=${FADE_OUT_SECONDS}`,
    "areverse",
    `volume=${gainDb.toFixed(2)}dB`,
    "aresample=176400",
    `alimiter=limit=${limit.toFixed(4)}:attack=0.5:release=40:level=false:latency=true`,
    "aresample=44100",
  ].join(",");
}

export function encodeArgs(input: string, filter: string, output: string): string[] {
  return [
    "-hide_banner",
    "-nostats",
    "-y",
    "-i",
    input,
    "-af",
    filter,
    "-ac",
    "1",
    "-ar",
    "44100",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    "-map_metadata",
    "-1",
    "-write_xing",
    "1",
    output,
  ];
}

/** Next gain and limiter ceiling from a measured master; null once both targets are met. */
export function correction(
  loudness: Loudness,
  measured: Pick<Measurement, "lufs" | "rmsDb" | "truePeakDbtp">,
  gainDb: number,
  limitDb: number,
): { gainDb: number; limitDb: number } | null {
  const level = loudness.kind === "lufs" ? measured.lufs : measured.rmsDb;
  const tolerance = loudness.kind === "lufs" ? LUFS_TOLERANCE / 2 : RMS_TOLERANCE_DB / 2;
  const loudnessError = level === null ? 0 : loudness.target - level;
  const peakOver = measured.truePeakDbtp - MAX_TRUE_PEAK_DBTP;
  if (Math.abs(loudnessError) <= tolerance && peakOver <= -0.1) return null;
  return {
    gainDb: gainDb + loudnessError,
    limitDb: peakOver > -0.1 ? limitDb - peakOver - 0.3 : limitDb,
  };
}

export function verdict(spec: SoundSpec, m: Measurement): Verdict {
  const failures: string[] = [];
  if (m.durationSeconds > spec.max_seconds)
    failures.push(`length ${m.durationSeconds.toFixed(3)} s > ${spec.max_seconds}`);
  if (m.truePeakDbtp > MAX_TRUE_PEAK_DBTP)
    failures.push(`true peak ${m.truePeakDbtp.toFixed(1)} dBTP`);
  if (spec.loudness.kind === "lufs") {
    if (m.lufs === null || Math.abs(m.lufs - spec.loudness.target) > LUFS_TOLERANCE) {
      failures.push(`loudness ${m.lufs?.toFixed(1) ?? "n/a"} LUFS, target ${spec.loudness.target}`);
    }
  } else if (Math.abs(m.rmsDb - spec.loudness.target) > RMS_TOLERANCE_DB) {
    failures.push(`RMS ${m.rmsDb.toFixed(1)} dB, target ${spec.loudness.target}`);
  }
  if (m.leadSeconds > 0.01) failures.push(`lead silence ${(m.leadSeconds * 1000).toFixed(0)} ms`);
  if (m.channels !== 1 || m.sampleRate !== 44100)
    failures.push(`${m.channels} ch ${m.sampleRate} Hz`);
  if (Math.abs(m.bitRate - 128000) > 8000) failures.push(`bit rate ${m.bitRate}`);
  return { ok: failures.length === 0, failures };
}

/**
 * Lower is better. Penalises harsh top end, spiky transients and long tails, the three things that
 * make a UI sound tiring on repeat; a sound that misses a target always loses.
 */
export function harshnessScore(spec: SoundSpec, m: Measurement): number {
  const fails = verdict(spec, m).ok ? 0 : 100;
  const high = Math.max(0, m.highShareDb + 18) * 1.5;
  const crest = Math.max(0, m.crestDb - 18);
  const tail = Math.max(0, m.tailSeconds / spec.max_seconds - 0.7) * 10;
  return fails + high + crest + tail;
}

export function isShort(spec: Pick<SoundSpec, "max_seconds">): boolean {
  return spec.max_seconds <= SHORT_SOUND_SECONDS;
}

export function parseEbur128(stderr: string): { lufs: number | null; truePeakDbtp: number } {
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const integrated = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(summary)?.[1];
  const peak = /True peak:\s+Peak:\s+(-?[\d.]+|-inf)\s+dBFS/.exec(summary)?.[1];
  if (integrated === undefined || peak === undefined) throw new Error("ebur128 summary not found");
  const lufs = Number(integrated);
  return {
    lufs: Number.isFinite(lufs) && lufs > -70 ? lufs : null,
    truePeakDbtp: peak === "-inf" ? Number.NEGATIVE_INFINITY : Number(peak),
  };
}

export interface SignalStats {
  rmsDb: number;
  peakDb: number;
  crestDb: number;
  leadSeconds: number;
  tailSeconds: number;
}

const TAIL_WINDOW_SECONDS = 0.01;

/** Level statistics of decoded mono samples (sample peak, not true peak). */
export function signalStats(samples: Float32Array, sampleRate: number): SignalStats {
  const threshold = 10 ** (SILENCE_DB / 20);
  const window = Math.max(1, Math.round(sampleRate * TAIL_WINDOW_SECONDS));
  let sumSquares = 0;
  let peak = 0;
  let firstLoud = -1;
  let loudestWindow = 0;
  let loudestEnergy = -1;
  let windowEnergy = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    const square = sample * sample;
    sumSquares += square;
    windowEnergy += square;
    const magnitude = Math.abs(sample);
    if (magnitude > peak) peak = magnitude;
    if (firstLoud === -1 && magnitude > threshold) firstLoud = index;
    if ((index + 1) % window === 0 || index === samples.length - 1) {
      if (windowEnergy > loudestEnergy) {
        loudestEnergy = windowEnergy;
        loudestWindow = Math.floor(index / window);
      }
      windowEnergy = 0;
    }
  }
  const toDb = (value: number) => (value > 0 ? 20 * Math.log10(value) : Number.NEGATIVE_INFINITY);
  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  return {
    rmsDb: toDb(rms),
    peakDb: toDb(peak),
    crestDb: rms > 0 ? toDb(peak / rms) : 0,
    leadSeconds: firstLoud === -1 ? samples.length / sampleRate : firstLoud / sampleRate,
    tailSeconds: Math.max(0, samples.length / sampleRate - loudestWindow * TAIL_WINDOW_SECONDS),
  };
}
