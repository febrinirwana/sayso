import {
  correction,
  encodeArgs,
  endSeconds,
  LIMITER_HEADROOM_DB,
  type Measurement,
  masterFilter,
  parseEbur128,
  shapeFilter,
  signalStats,
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
  const [ebur, samples, high, probe] = await Promise.all([
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
    decode(path, "highpass=f=8000:poles=2,highpass=f=8000:poles=2"),
    run(
      ["-v", "error", "-show_entries", "stream=sample_rate,channels,bit_rate", "-of", "json", path],
      "ffprobe",
    ),
  ]);
  const loudness = parseEbur128(ebur.stderr);
  const stats = signalStats(samples, SAMPLE_RATE);
  const highStats = signalStats(high, SAMPLE_RATE);
  const stream = parseProbe(new TextDecoder().decode(probe.stdout));
  return {
    ...loudness,
    ...stats,
    durationSeconds: samples.length / SAMPLE_RATE,
    highShareDb: highStats.rmsDb - stats.rmsDb,
    bytes: Bun.file(path).size,
    ...stream,
  };
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
 * Shapes the raw generation, cuts its tail where the decay goes inaudible, then iterates gain and
 * the limiter ceiling against the encoded MP3 until loudness and true peak both land, because
 * encoding moves both.
 */
export async function master(spec: SoundSpec, raw: string, out: string): Promise<Measurement> {
  const shaped = out.replace(/\.mp3$/, ".shaped.wav");
  await run([
    "-hide_banner",
    "-v",
    "error",
    "-y",
    "-i",
    raw,
    "-filter_complex",
    shapeFilter(spec),
    "-c:a",
    "pcm_f32le",
    shaped,
  ]);
  const end = endSeconds(await decode(shaped), SAMPLE_RATE, spec.max_seconds);
  const before = await measureFile(shaped);
  const level = spec.loudness.kind === "lufs" ? before.lufs : before.rmsDb;
  if (level === null || !Number.isFinite(level)) throw new Error(`${raw} is silent after shaping`);
  let gainDb = spec.loudness.target - level;
  let limitDb = MAX_TRUE_PEAK_DBTP - LIMITER_HEADROOM_DB;
  let measured = before;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    await run(encodeArgs(shaped, masterFilter(end, gainDb, limitDb), out));
    measured = await measureFile(out);
    const next = correction(spec.loudness, measured, gainDb, limitDb);
    if (next === null) break;
    ({ gainDb, limitDb } = next);
  }
  return measured;
}
