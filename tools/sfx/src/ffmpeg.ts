import {
  AIR_HZ,
  bandShareDb,
  correction,
  dominantHz,
  encodeArgs,
  endSeconds,
  LIMITER_HEADROOM_DB,
  longTermSpectrum,
  type Measurement,
  masterFilter,
  parseEbur128,
  type ScaleNote,
  type ShapePart,
  shapeFilter,
  signalStats,
  snapToScale,
  spectralCentroid,
} from "./audio";
import { MAX_TRUE_PEAK_DBTP, SHORT_SOUND_SECONDS, type SoundSpec } from "./config";

const SAMPLE_RATE = 44100;
const MAX_PASSES = 6;

async function run(
  args: string[],
  command = "ffmpeg",
): Promise<{ stdout: ArrayBuffer; stderr: string }> {
  const proc = Bun.spawn([command, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${command} exited ${code}: ${stderr.slice(-600)}`);
  return { stdout, stderr };
}

async function decode(path: string, filter?: string): Promise<Float32Array> {
  const args = ["-v", "error", "-i", path];
  if (filter) args.push("-af", filter);
  args.push("-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-");
  return new Float32Array((await run(args)).stdout);
}

/**
 * Full measurement of one file. Loudness pads to one 400 ms EBU block so sounds just under it
 * still get an integrated value; padding is silence, which the absolute gate ignores.
 */
export async function measureFile(path: string): Promise<Measurement> {
  const [ebur, samples, probe] = await Promise.all([
    run([
      "-hide_banner",
      "-nostats",
      "-i",
      path,
      "-af",
      `apad=whole_dur=${SHORT_SOUND_SECONDS},ebur128=peak=true:framelog=verbose`,
      "-f",
      "null",
      "-",
    ]),
    decode(path),
    run(
      ["-v", "error", "-show_entries", "stream=sample_rate,channels,bit_rate", "-of", "json", path],
      "ffprobe",
    ),
  ]);
  const spectrum = longTermSpectrum(samples, SAMPLE_RATE);
  return {
    ...parseEbur128(ebur.stderr),
    ...signalStats(samples, SAMPLE_RATE),
    durationSeconds: samples.length / SAMPLE_RATE,
    centroidHz: spectralCentroid(spectrum),
    airShareDb: bandShareDb(spectrum, AIR_HZ),
    bytes: Bun.file(path).size,
    ...parseProbe(new TextDecoder().decode(probe.stdout)),
  };
}

/** Pitch of a raw generation and the shift onto C major pentatonic near the `home` MIDI note. */
export async function pitchOf(path: string, home: number): Promise<{ hz: number } & ScaleNote> {
  const hz = dominantHz(longTermSpectrum(await decode(path), SAMPLE_RATE));
  return { hz, ...snapToScale(hz, home) };
}

function parseProbe(json: string): Pick<Measurement, "sampleRate" | "channels" | "bitRate"> {
  const parsed: { streams?: { sample_rate?: string; channels?: number; bit_rate?: string }[] } =
    JSON.parse(json);
  const stream = parsed.streams?.[0];
  return {
    sampleRate: Number(stream?.sample_rate ?? 0),
    channels: stream?.channels ?? 0,
    bitRate: Number(stream?.bit_rate ?? 0),
  };
}

/**
 * Tunes, layers and shapes the parts, cuts the tail where the decay goes inaudible, then iterates
 * gain and the limiter ceiling against the encoded MP3 until loudness and true peak both land,
 * because encoding moves both. `inputs[n]` is the raw file behind ShapePart input n.
 */
export async function master(
  spec: SoundSpec,
  inputs: readonly string[],
  parts: readonly ShapePart[],
  out: string,
): Promise<Measurement> {
  const shaped = out.replace(/\.mp3$/, ".shaped.wav");
  await run([
    "-hide_banner",
    "-v",
    "error",
    "-y",
    ...inputs.flatMap((input) => ["-i", input]),
    "-filter_complex",
    shapeFilter(parts, spec.lowpass_hz),
    "-c:a",
    "pcm_f32le",
    shaped,
  ]);
  const end = endSeconds(await decode(shaped), SAMPLE_RATE, spec.max_seconds);
  const before = await measureFile(shaped);
  const level = spec.loudness.kind === "lufs" ? before.lufs : before.rmsDb;
  if (level === null || !Number.isFinite(level)) throw new Error(`${out} is silent after shaping`);
  let gainDb = spec.loudness.target - level;
  let limitDb = MAX_TRUE_PEAK_DBTP - LIMITER_HEADROOM_DB;
  let measured = before;
  const decaySeconds = (spec.decay_ms ?? 0) / 1000;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    await run(encodeArgs(shaped, masterFilter(end, gainDb, limitDb, decaySeconds), out));
    measured = await measureFile(out);
    const next = correction(spec.loudness, measured, gainDb, limitDb);
    if (next === null) break;
    ({ gainDb, limitDb } = next);
  }
  return measured;
}
