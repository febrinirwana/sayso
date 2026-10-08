import {
  CENTROID_MAX_HZ,
  CENTROID_MIN_HZ,
  type Loudness,
  LUFS_TOLERANCE,
  MAX_AIR_SHARE_DB,
  MAX_TRUE_PEAK_DBTP,
  PITCH_MAX_HZ,
  PITCH_MIN_HZ,
  RMS_TOLERANCE_DB,
  SCALE_PITCH_CLASSES,
  type SoundSpec,
} from "./config";

export const FADE_IN_SECONDS = 0.005;
export const FADE_OUT_SECONDS = 0.03;
export const SILENCE_DB = -50;
/** Safety margin under max_seconds for MP3 frame padding. */
const LENGTH_MARGIN_SECONDS = 0.01;
/** MP3 encoding adds inter-sample peaks; aim the limiter this far under the ceiling. */
export const LIMITER_HEADROOM_DB = 1;
/** Energy above this frequency counts as "air": hiss, fizz and glassy edge. */
export const AIR_HZ = 10000;
const FFT_SIZE = 2048;

export interface Measurement {
  durationSeconds: number;
  truePeakDbtp: number;
  /** Integrated loudness; null when the file is too short for an EBU R128 block. */
  lufs: number | null;
  rmsDb: number;
  peakDb: number;
  crestDb: number;
  /** Magnitude-weighted mean frequency; low reads dull, high reads harsh. */
  centroidHz: number;
  /** Energy above 10 kHz relative to the whole band; higher reads as hiss or fizz. */
  airShareDb: number;
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

/** One part as ffmpeg sees it: an input index and its copies, each shifted by tuning plus interval. */
export interface ShapePart {
  input: number;
  layers: readonly { semitones: number; delay_ms: number; gain_db: number }[];
}

/** A tail is cut once it falls this far under the loudest 10 ms; quieter decay is inaudible on a phone. */
export const TAIL_FLOOR_DB = -45;
const WINDOW_SECONDS = 0.01;

/**
 * Stage 1: every part mono 44.1 kHz float with its leading silence removed, each layer re-pitched
 * (tuning plus layer semitones), delayed and scaled, all mixed, then rumble and fizz filtered and
 * leading silence removed once more.
 */
export function shapeFilter(parts: readonly ShapePart[], lowpassHz?: number): string {
  const lead = `silenceremove=start_periods=1:start_threshold=${SILENCE_DB}dB:start_silence=0.002:detection=peak`;
  const chain = [
    "highpass=f=80:poles=2",
    // Two cascaded 12 dB/oct sections: steep enough to take fizz off without dulling the ring below.
    ...(lowpassHz ? [`lowpass=f=${lowpassHz}:poles=2`, `lowpass=f=${lowpassHz}:poles=2`] : []),
    lead,
  ].join(",");
  const graph: string[] = [];
  const voices: string[] = [];
  for (const [p, part] of parts.entries()) {
    const splits = part.layers.map((_, l) => `[p${p}l${l}]`).join("");
    // Leading silence goes before layering so each layer's onset lands exactly at its delay.
    graph.push(
      `[${part.input}:a]aresample=44100,aformat=sample_fmts=flt:channel_layouts=mono,${lead},asplit=${part.layers.length}${splits}`,
    );
    for (const [l, layer] of part.layers.entries()) {
      const rate = 44100 * 2 ** (layer.semitones / 12);
      // asetrate re-pitches by playing the samples faster, so higher notes also decay faster, like a shorter bar.
      graph.push(
        `[p${p}l${l}]asetrate=${rate.toFixed(2)},aresample=44100,adelay=${layer.delay_ms}:all=1,volume=${layer.gain_db}dB[p${p}v${l}]`,
      );
      voices.push(`[p${p}v${l}]`);
    }
  }
  const mix =
    voices.length > 1
      ? `${voices.join("")}amix=inputs=${voices.length}:normalize=0:duration=longest,`
      : `${voices.join("")}`;
  graph.push(`${mix}${chain}`);
  return graph.join(";");
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

/**
 * Stage 2: cut, optional exponential decay, fades, gain, then a 4x oversampled lookahead limiter
 * as the true-peak ceiling. The decay falls linearly in dB to TAIL_FLOOR_DB over its last
 * `decaySeconds`, so a sustained synth or bell ends like a struck note instead of a cut beep.
 */
export function masterFilter(
  end: number,
  gainDb: number,
  limitDb: number,
  decaySeconds = 0,
): string {
  const limit = Math.min(1, Math.max(0.0625, 10 ** (limitDb / 20)));
  const decayStart = Math.max(0, end - decaySeconds);
  return [
    `atrim=end=${end.toFixed(4)}`,
    "asetpts=PTS-STARTPTS",
    ...(decaySeconds > 0
      ? [
          `aeval=exprs='val(0)*if(lt(t,${decayStart.toFixed(4)}),1,pow(10,${(TAIL_FLOOR_DB / 20).toFixed(3)}*(t-${decayStart.toFixed(4)})/${decaySeconds.toFixed(4)}))':channel_layout=mono`,
        ]
      : []),
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
  if (m.centroidHz < CENTROID_MIN_HZ || m.centroidHz > CENTROID_MAX_HZ)
    failures.push(`centroid ${m.centroidHz.toFixed(0)} Hz`);
  if (m.airShareDb > MAX_AIR_SHARE_DB) failures.push(`>10k ${m.airShareDb.toFixed(1)} dB`);
  if (m.leadSeconds > 0.01) failures.push(`lead silence ${(m.leadSeconds * 1000).toFixed(0)} ms`);
  if (m.channels !== 1 || m.sampleRate !== 44100)
    failures.push(`${m.channels} ch ${m.sampleRate} Hz`);
  if (Math.abs(m.bitRate - 128000) > 8000) failures.push(`bit rate ${m.bitRate}`);
  return { ok: failures.length === 0, failures };
}

/**
 * Lower is better. Penalises fizz above 10 kHz, a centroid drifting toward either edge of the
 * band (dull or harsh), spiky transients and long tails, the things that make a UI sound tiring
 * on repeat; a sound that misses a target always loses.
 */
export function harshnessScore(spec: SoundSpec, m: Measurement): number {
  const fails = verdict(spec, m).ok ? 0 : 100;
  const air = Math.max(0, m.airShareDb + 28) * 1.5;
  // Distance in octaves from the band's geometric middle (about 2.4 kHz), free within ±0.5 octave.
  const middle = Math.sqrt(CENTROID_MIN_HZ * CENTROID_MAX_HZ);
  const centroid = Math.max(0, Math.abs(Math.log2(Math.max(1, m.centroidHz) / middle)) - 0.5) * 10;
  const crest = Math.max(0, m.crestDb - 18);
  const tail = Math.max(0, m.tailSeconds / spec.max_seconds - 0.7) * 10;
  return fails + air + centroid + crest + tail;
}

/**
 * Score cost of re-pitching a candidate onto its home note. Up to 1.5 semitones is free (snapping
 * to the scale); beyond that resampling changes the source's character, so natural candidates win.
 */
export function tuningPenalty(semitones: number): number {
  return Math.max(0, Math.abs(semitones) - 1.5) * 0.4;
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

/** Long-term spectrum: Hann-windowed 2048-point frames at 50 % overlap, summed. */
export interface Spectrum {
  binHz: number;
  /** Summed magnitude per bin, for the centroid. */
  magnitude: Float64Array;
  /** Summed power per bin, for band energy shares and pitch. */
  power: Float64Array;
}

export function longTermSpectrum(samples: Float32Array, sampleRate: number): Spectrum {
  const bins = FFT_SIZE / 2;
  const magnitude = new Float64Array(bins);
  const power = new Float64Array(bins);
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  const hann = Float64Array.from(
    { length: FFT_SIZE },
    (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / FFT_SIZE),
  );
  const hop = FFT_SIZE / 2;
  for (let start = 0; start === 0 || start < samples.length; start += hop) {
    for (let n = 0; n < FFT_SIZE; n += 1) {
      re[n] = (samples[start + n] ?? 0) * (hann[n] ?? 0);
      im[n] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k += 1) {
      const p = (re[k] ?? 0) ** 2 + (im[k] ?? 0) ** 2;
      power[k] = (power[k] ?? 0) + p;
      magnitude[k] = (magnitude[k] ?? 0) + Math.sqrt(p);
    }
  }
  return { binHz: sampleRate / FFT_SIZE, magnitude, power };
}

/** In-place iterative radix-2 FFT; length must be a power of two. */
function fft(re: Float64Array, im: Float64Array): void {
  const size = re.length;
  for (let i = 1, j = 0; i < size; i += 1) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    for (let start = 0; start < size; start += length) {
      for (let k = 0; k < length / 2; k += 1) {
        const wr = Math.cos(angle * k);
        const wi = Math.sin(angle * k);
        const a = start + k;
        const b = a + length / 2;
        const xr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const xi = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
      }
    }
  }
}

/** Centroid over the audible band (from 20 Hz), so DC and sub-rumble never pull it down. */
export function spectralCentroid(spectrum: Spectrum): number {
  let weighted = 0;
  let total = 0;
  for (let k = Math.ceil(20 / spectrum.binHz); k < spectrum.magnitude.length; k += 1) {
    const value = spectrum.magnitude[k] ?? 0;
    weighted += value * k * spectrum.binHz;
    total += value;
  }
  return total > 0 ? weighted / total : 0;
}

/** Power at or above `fromHz` relative to all power, in dB. */
export function bandShareDb(spectrum: Spectrum, fromHz: number): number {
  let above = 0;
  let total = 0;
  for (let k = 0; k < spectrum.power.length; k += 1) {
    const value = spectrum.power[k] ?? 0;
    total += value;
    if (k * spectrum.binHz >= fromHz) above += value;
  }
  return above > 0 && total > 0 ? 10 * Math.log10(above / total) : Number.NEGATIVE_INFINITY;
}

/** Strongest partial between PITCH_MIN_HZ and PITCH_MAX_HZ, refined by parabolic interpolation. */
export function dominantHz(spectrum: Spectrum): number {
  const from = Math.ceil(PITCH_MIN_HZ / spectrum.binHz);
  const to = Math.min(spectrum.power.length - 2, Math.floor(PITCH_MAX_HZ / spectrum.binHz));
  let best = from;
  for (let k = from; k <= to; k += 1) {
    if ((spectrum.power[k] ?? 0) > (spectrum.power[best] ?? 0)) best = k;
  }
  const left = Math.log((spectrum.power[best - 1] ?? 0) + 1e-20);
  const centre = Math.log((spectrum.power[best] ?? 0) + 1e-20);
  const right = Math.log((spectrum.power[best + 1] ?? 0) + 1e-20);
  const curve = left - 2 * centre + right;
  const offset = curve < 0 ? (0.5 * (left - right)) / curve : 0;
  return (best + offset) * spectrum.binHz;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;

/** A C major pentatonic note (MIDI number, name) and the shift from the measured pitch onto it. */
export interface ScaleNote {
  midi: number;
  semitones: number;
  note: string;
}

/**
 * Nearest C major pentatonic note to a frequency, moved by whole octaves to within six semitones
 * of `home` so every candidate of a source plays its figures in the same register.
 */
export function snapToScale(hz: number, home: number): ScaleNote {
  const exact = 69 + 12 * Math.log2(hz / 440);
  // The widest pentatonic gap is three semitones, so a scale note is always within two.
  let midi = Math.round(exact);
  for (let n = Math.floor(exact) - 2; n <= Math.ceil(exact) + 2; n += 1) {
    const better =
      Math.abs(n - exact) < Math.abs(midi - exact) ||
      !SCALE_PITCH_CLASSES.includes(pitchClass(midi));
    if (SCALE_PITCH_CLASSES.includes(pitchClass(n)) && better) midi = n;
  }
  midi += 12 * Math.round((home - midi) / 12);
  return {
    midi,
    semitones: midi - exact,
    note: `${NOTE_NAMES[pitchClass(midi)]}${Math.floor(midi / 12) - 1}`,
  };
}

/** Semitones from a scale note to the note `steps` pentatonic steps away (5 steps = one octave). */
export function scaleInterval(rootMidi: number, steps: number): number {
  const size = SCALE_PITCH_CLASSES.length;
  const rootIndex = SCALE_PITCH_CLASSES.indexOf(pitchClass(rootMidi));
  if (rootIndex === -1) throw new Error(`MIDI ${rootMidi} is not in C major pentatonic`);
  const index = rootIndex + steps;
  const octave = Math.floor(index / size);
  const target = SCALE_PITCH_CLASSES[((index % size) + size) % size] ?? 0;
  return octave * 12 + target - pitchClass(rootMidi);
}
