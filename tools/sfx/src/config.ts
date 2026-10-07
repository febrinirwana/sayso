/** Sounds at or under this length are gated on RMS and peak: EBU R128 needs 400 ms blocks. */
export const SHORT_SOUND_SECONDS = 0.4;
export const MAX_TRUE_PEAK_DBTP = -3;
export const LUFS_TOLERANCE = 1;
export const RMS_TOLERANCE_DB = 1.5;
/** ElevenLabs refuses shorter requests; shorter sounds are generated at this length and trimmed. */
export const MIN_GENERATION_SECONDS = 0.5;

export type Loudness = { kind: "lufs"; target: number } | { kind: "rms"; target: number };

export interface SoundSpec {
  id: string;
  prompt: string;
  duration_seconds: number;
  prompt_influence: number;
  max_seconds: number;
  loudness: Loudness;
  /** Mastering low-pass that takes fizz off bright sources (coins, paper, clacks) so they stay warm. */
  lowpass_hz?: number;
  /**
   * Rebuilds the sound from copies of the generation, each re-pitched and delayed. The model
   * cannot sequence notes, so a two-note figure is played from one generated note.
   */
  layers?: Layer[];
  /** Candidate number to ship instead of the automatic pick. */
  pick?: number;
}

export interface Layer {
  semitones: number;
  delay_ms: number;
  gain_db: number;
}

export interface CliOptions {
  command: "generate" | "measure" | "help";
  only: string[] | null;
  candidates: number;
}

export const HELP = `SAYSO interface sounds (DESIGN section 10)

Usage:
  bun run --cwd tools/sfx generate -- [--only id,id] [--candidates N]
  bun run --cwd tools/sfx measure
  bun run --cwd tools/sfx help

generate  Ensures N raw candidates per sound in tools/sfx/.cache/<id>/ (default 2; only missing
          candidates call ElevenLabs), masters every candidate with ffmpeg, picks the best by
          measurement (or the sound's "pick"), and writes apps/web/public/sfx/<id>.mp3.
measure   Prints duration, true peak, loudness, crest, high-frequency share, lead silence and size
          for every shipped file; exits 1 when any file misses a target.

Env:      ELEVEN_LABS_API_KEY (read from the environment or the repo-root .env; never printed).
Needs:    ffmpeg and ffprobe 8.x on PATH.

sounds.json, one entry per sound:
  id, prompt, duration_seconds (>= 0.5), prompt_influence (0..1), max_seconds,
  target_lufs (max_seconds > 0.4) or target_rms_db (max_seconds <= 0.4),
  optional lowpass_hz (mastering low-pass), optional layers ([{semitones, delay_ms, gain_db}]:
  plays re-pitched, delayed copies of one generated note to build a figure the model cannot
  sequence), optional pick (candidate number to ship).

Mastering: mono 44.1 kHz, 80 Hz high-pass, optional low-pass, leading silence under -50 dBFS
trimmed, tail cut once it decays 45 dB under its loudest 10 ms (never past max_seconds), 5 ms
fade-in, 30 ms fade-out, gain to target, 4x oversampled limiter so true peak <= -3 dBTP,
MP3 128 kbps.`;

export function parseArgs(argv: readonly string[]): CliOptions {
  const [command = "help", ...rest] = argv.filter((arg) => arg !== "--");
  if (command !== "generate" && command !== "measure" && command !== "help") {
    throw new Error(`unknown command "${command}"`);
  }
  const options: CliOptions = { command, only: null, candidates: 2 };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (flag === "--help" || flag === "-h") return { ...options, command: "help" };
    if (flag === "--only" && value) {
      options.only = value.split(",").filter(Boolean);
      index += 1;
    } else if (flag === "--candidates" && value) {
      const count = Number(value);
      if (!Number.isInteger(count) || count < 1 || count > 4) {
        throw new Error("--candidates must be an integer from 1 to 4");
      }
      options.candidates = count;
      index += 1;
    } else {
      throw new Error(`unknown or incomplete option "${flag}"`);
    }
  }
  return options;
}

export function parseSounds(raw: unknown): SoundSpec[] {
  if (!isRecord(raw) || !Array.isArray(raw.sounds))
    throw new Error("sounds.json needs a sounds array");
  const seen = new Set<string>();
  return raw.sounds.map((entry: unknown, index) => {
    if (!isRecord(entry)) throw new Error(`sounds[${index}] is not an object`);
    const id = text(entry, "id", index);
    if (!/^[a-z]+$/.test(id) || seen.has(id))
      throw new Error(`sounds[${index}] id "${id}" is invalid or repeated`);
    seen.add(id);
    const duration = number(entry, "duration_seconds", id);
    const influence = number(entry, "prompt_influence", id);
    const max = number(entry, "max_seconds", id);
    if (duration < MIN_GENERATION_SECONDS || duration > 30)
      throw new Error(`${id}: duration_seconds must be 0.5..30`);
    if (influence < 0 || influence > 1) throw new Error(`${id}: prompt_influence must be 0..1`);
    const short = max <= SHORT_SOUND_SECONDS;
    const key = short ? "target_rms_db" : "target_lufs";
    const other = short ? "target_lufs" : "target_rms_db";
    if (other in entry) throw new Error(`${id}: use ${key}, not ${other}, for max_seconds ${max}`);
    const spec: SoundSpec = {
      id,
      prompt: text(entry, "prompt", index),
      duration_seconds: duration,
      prompt_influence: influence,
      max_seconds: max,
      loudness: { kind: short ? "rms" : "lufs", target: number(entry, key, id) },
    };
    if ("lowpass_hz" in entry) spec.lowpass_hz = number(entry, "lowpass_hz", id);
    if ("layers" in entry) {
      if (!Array.isArray(entry.layers) || entry.layers.length < 2)
        throw new Error(`${id}: layers needs two or more entries`);
      spec.layers = entry.layers.map((layer: unknown) => {
        if (!isRecord(layer)) throw new Error(`${id}: each layer must be an object`);
        return {
          semitones: number(layer, "semitones", id),
          delay_ms: number(layer, "delay_ms", id),
          gain_db: number(layer, "gain_db", id),
        };
      });
    }
    if ("pick" in entry) spec.pick = number(entry, "pick", id);
    return spec;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(entry: Record<string, unknown>, key: string, index: number): string {
  const value = entry[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`sounds[${index}].${key} must be a string`);
  return value;
}

function number(entry: Record<string, unknown>, key: string, id: string): number {
  const value = entry[key];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${id}: ${key} must be a number`);
  return value;
}
