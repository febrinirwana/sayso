/** Sounds at or under this length are gated on RMS and peak: EBU R128 needs 400 ms blocks. */
export const SHORT_SOUND_SECONDS = 0.4;
/** Phone speakers and Bluetooth codecs add overshoot; 1.5 dB keeps the loud set clear of it. */
export const MAX_TRUE_PEAK_DBTP = -1.5;
export const LUFS_TOLERANCE = 1;
export const RMS_TOLERANCE_DB = 1.5;
/** ElevenLabs refuses shorter requests; shorter sounds are generated at this length and trimmed. */
export const MIN_GENERATION_SECONDS = 0.5;
/**
 * Spectral centroid band. Under it a UI sound reads dull or muffled on a phone speaker (which rolls
 * off below about 300 Hz); over it the sound turns into fizz and sibilance.
 */
export const CENTROID_MIN_HZ = 1200;
export const CENTROID_MAX_HZ = 5000;
/** Energy above 10 kHz relative to the whole band; more than this reads as hiss or glassy harshness. */
export const MAX_AIR_SHARE_DB = -18;
/** C major pentatonic (C D E G A): every tuned source snaps to one of these so the set shares a key. */
export const SCALE_PITCH_CLASSES: readonly number[] = [0, 2, 4, 7, 9];
/** Pitch detection window for tuned sources: the range bells, plucks and bubbles sing in. */
export const PITCH_MIN_HZ = 250;
export const PITCH_MAX_HZ = 4000;

export type Loudness = { kind: "lufs"; target: number } | { kind: "rms"; target: number };

/** One ElevenLabs request, generated as N candidates and shared by every sound that uses it. */
export interface SourceSpec {
  id: string;
  prompt: string;
  duration_seconds: number;
  prompt_influence: number;
  /**
   * Home register as a MIDI note, from a name like "C6": the loudest partial snaps to the nearest
   * C major pentatonic note, moved by octaves to within six semitones of home, before layering.
   * Null for untuned sources (noises, flaps, coins).
   */
  tune: number | null;
  /** Candidate number to use instead of the automatic pick. */
  pick?: number;
}

/**
 * A copy of a source, delayed and scaled. Tuned sources move in C major pentatonic `steps` from
 * their tuned note, so every figure stays in key whichever candidate wins; untuned sources move
 * in plain `semitones`.
 */
export type Layer = { delay_ms: number; gain_db: number } & (
  | { semitones: number }
  | { steps: number }
);

export interface Part {
  source: string;
  layers: Layer[];
}

export interface SoundSpec {
  id: string;
  max_seconds: number;
  loudness: Loudness;
  /** Mastering low-pass that takes fizz off bright sources (coins, flaps, sparkles). */
  lowpass_hz?: number;
  /** Exponential decay to the tail floor over the last N ms, so sustained notes end like struck ones. */
  decay_ms?: number;
  /** Mixed in order; the model cannot sequence notes, so figures are built from layered copies. */
  parts: Part[];
}

export interface SfxConfig {
  family: string;
  sources: SourceSpec[];
  sounds: SoundSpec[];
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

generate  Ensures N raw candidates (default 3) of every source the chosen sounds use in
          tools/sfx/.cache/sources/<source>/ (only missing candidates call ElevenLabs), masters
          every candidate combination per sound with ffmpeg, picks the lowest harshness score and
          writes apps/web/public/sfx/<id>.mp3. A source shared by several sounds keeps the
          candidate its first sound chose, so the family stays one timbre; "pick" pins it.
measure   Prints duration, true peak, loudness, crest, spectral centroid, energy above 10 kHz,
          lead silence, tail and size for every shipped file; exits 1 when any file misses a target.

Env:      ELEVEN_LABS_API_KEY (read from the environment or the repo-root .env; never printed).
Needs:    ffmpeg and ffprobe 8.x on PATH.

sounds.json:
  sources: [{ id, prompt, duration_seconds (>= 0.5), prompt_influence (0..1), optional tune
             (home note like "C6": snap to C major pentatonic near it), optional pick }]
  sounds:  [{ id, max_seconds, target_lufs (max_seconds > 0.4) or target_rms_db (<= 0.4),
             optional lowpass_hz, optional decay_ms, parts: [{ source, optional layers:
             [{ steps (pentatonic steps from a tuned source's note) or semitones, delay_ms,
             gain_db }] }] }]

Mastering: mono 44.1 kHz, parts tuned and layered, 80 Hz high-pass, optional low-pass, leading
silence under -50 dBFS trimmed, tail cut once it decays 45 dB under its loudest 10 ms (never past
max_seconds), optional exponential decay to -45 dB over the last decay_ms, 5 ms fade-in, 30 ms
fade-out, gain to target, 4x oversampled limiter so true peak <= ${MAX_TRUE_PEAK_DBTP} dBTP, MP3
128 kbps. Gates: centroid ${CENTROID_MIN_HZ}..${CENTROID_MAX_HZ} Hz, energy above 10 kHz <= ${MAX_AIR_SHARE_DB} dB.`;

export function parseArgs(argv: readonly string[]): CliOptions {
  const [command = "help", ...rest] = argv.filter((arg) => arg !== "--");
  if (command !== "generate" && command !== "measure" && command !== "help") {
    throw new Error(`unknown command "${command}"`);
  }
  const options: CliOptions = { command, only: null, candidates: 3 };
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

export function parseConfig(raw: unknown): SfxConfig {
  if (!isRecord(raw) || !Array.isArray(raw.sources) || !Array.isArray(raw.sounds))
    throw new Error("sounds.json needs sources and sounds arrays");
  const sources = raw.sources.map((entry: unknown, index) => parseSource(entry, index));
  uniqueIds(sources, "sources");
  const tuned = new Map(sources.map((source) => [source.id, source.tune !== null]));
  const sounds = raw.sounds.map((entry: unknown, index) => parseSound(entry, index, tuned));
  uniqueIds(sounds, "sounds");
  return { family: typeof raw.family === "string" ? raw.family : "", sources, sounds };
}

function parseSource(entry: unknown, index: number): SourceSpec {
  if (!isRecord(entry)) throw new Error(`sources[${index}] is not an object`);
  const id = text(entry, "id", `sources[${index}]`);
  if (!/^[a-z][a-z-]*$/.test(id)) throw new Error(`sources[${index}] id "${id}" is invalid`);
  const duration = number(entry, "duration_seconds", id);
  const influence = number(entry, "prompt_influence", id);
  if (duration < MIN_GENERATION_SECONDS || duration > 30)
    throw new Error(`${id}: duration_seconds must be 0.5..30`);
  if (influence < 0 || influence > 1) throw new Error(`${id}: prompt_influence must be 0..1`);
  const source: SourceSpec = {
    id,
    prompt: text(entry, "prompt", id),
    duration_seconds: duration,
    prompt_influence: influence,
    tune: "tune" in entry ? noteToMidi(text(entry, "tune", id), id) : null,
  };
  if ("pick" in entry) {
    const pick = number(entry, "pick", id);
    if (!Number.isInteger(pick) || pick < 1 || pick > 4)
      throw new Error(`${id}: pick must be 1 to 4`);
    source.pick = pick;
  }
  return source;
}

const NOTE_OFFSETS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C6" -> 84 (MIDI, C4 = 60). */
export function noteToMidi(name: string, id: string): number {
  const match = /^([A-G])(#?)(\d)$/.exec(name);
  const offset = NOTE_OFFSETS[match?.[1] ?? ""];
  if (!match || offset === undefined) throw new Error(`${id}: tune must be a note like "C6"`);
  return 12 * (Number(match[3]) + 1) + offset + (match[2] ? 1 : 0);
}

function parseSound(entry: unknown, index: number, tuned: ReadonlyMap<string, boolean>): SoundSpec {
  if (!isRecord(entry)) throw new Error(`sounds[${index}] is not an object`);
  const id = text(entry, "id", `sounds[${index}]`);
  if (!/^[a-z]+$/.test(id)) throw new Error(`sounds[${index}] id "${id}" is invalid`);
  const max = number(entry, "max_seconds", id);
  const short = max <= SHORT_SOUND_SECONDS;
  const key = short ? "target_rms_db" : "target_lufs";
  const other = short ? "target_lufs" : "target_rms_db";
  if (other in entry) throw new Error(`${id}: use ${key}, not ${other}, for max_seconds ${max}`);
  if (!Array.isArray(entry.parts) || entry.parts.length === 0)
    throw new Error(`${id}: parts needs one or more entries`);
  const sound: SoundSpec = {
    id,
    max_seconds: max,
    loudness: { kind: short ? "rms" : "lufs", target: number(entry, key, id) },
    parts: entry.parts.map((part: unknown) => parsePart(part, id, tuned)),
  };
  if ("lowpass_hz" in entry) sound.lowpass_hz = number(entry, "lowpass_hz", id);
  if ("decay_ms" in entry) {
    const decay = number(entry, "decay_ms", id);
    if (decay <= 0 || decay > max * 1000) throw new Error(`${id}: decay_ms must be 1..max_seconds`);
    sound.decay_ms = decay;
  }
  return sound;
}

function parsePart(part: unknown, id: string, tuned: ReadonlyMap<string, boolean>): Part {
  if (!isRecord(part)) throw new Error(`${id}: each part must be an object`);
  const source = text(part, "source", id);
  const isTuned = tuned.get(source);
  if (isTuned === undefined) throw new Error(`${id}: unknown source "${source}"`);
  if (!("layers" in part)) return { source, layers: [{ semitones: 0, delay_ms: 0, gain_db: 0 }] };
  if (!Array.isArray(part.layers) || part.layers.length === 0)
    throw new Error(`${id}: layers needs one or more entries`);
  return {
    source,
    layers: part.layers.map((layer: unknown): Layer => {
      if (!isRecord(layer)) throw new Error(`${id}: each layer must be an object`);
      const delay_ms = number(layer, "delay_ms", id);
      if (delay_ms < 0) throw new Error(`${id}: delay_ms must be >= 0`);
      const gain_db = number(layer, "gain_db", id);
      if ("steps" in layer === "semitones" in layer)
        throw new Error(`${id}: each layer needs exactly one of steps or semitones`);
      if (!("steps" in layer))
        return { semitones: number(layer, "semitones", id), delay_ms, gain_db };
      if (!isTuned) throw new Error(`${id}: steps need a tuned source, "${source}" is not`);
      const steps = number(layer, "steps", id);
      if (!Number.isInteger(steps)) throw new Error(`${id}: steps must be whole scale steps`);
      return { steps, delay_ms, gain_db };
    }),
  };
}

function uniqueIds(entries: readonly { id: string }[], label: string): Set<string> {
  const seen = new Set<string>();
  for (const { id } of entries) {
    if (seen.has(id)) throw new Error(`${label}: id "${id}" is repeated`);
    seen.add(id);
  }
  return seen;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(entry: Record<string, unknown>, key: string, where: string): string {
  const value = entry[key];
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${where}: ${key} must be a string`);
  return value;
}

function number(entry: Record<string, unknown>, key: string, id: string): number {
  const value = entry[key];
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${id}: ${key} must be a number`);
  return value;
}
