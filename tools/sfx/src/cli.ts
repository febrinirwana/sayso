import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  harshnessScore,
  type Measurement,
  type ShapePart,
  scaleInterval,
  tuningPenalty,
  verdict,
} from "./audio";
import {
  HELP,
  parseArgs,
  parseConfig,
  type SfxConfig,
  type SoundSpec,
  type SourceSpec,
} from "./config";
import { master, measureFile, pitchOf } from "./ffmpeg";

const TOOL_DIR = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = join(TOOL_DIR, "..", "..");
const CACHE_DIR = join(TOOL_DIR, ".cache");
const OUT_DIR = join(REPO_ROOT, "apps", "web", "public", "sfx");
const MODEL_ID = "eleven_text_to_sound_v2";
const ENDPOINT = "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128";

class ApiError extends Error {}

async function main(): Promise<number> {
  const options = parseArgs(Bun.argv.slice(2));
  if (options.command === "help") {
    console.log(HELP);
    return 0;
  }
  const config = parseConfig(await Bun.file(join(TOOL_DIR, "sounds.json")).json());
  const specs = config.sounds;
  const selected = options.only ? specs.filter((spec) => options.only?.includes(spec.id)) : specs;
  const unknown = options.only?.filter((id) => !specs.some((spec) => spec.id === id)) ?? [];
  if (unknown.length > 0) throw new Error(`unknown sound ids: ${unknown.join(", ")}`);
  return options.command === "generate"
    ? generate(config, selected, options.candidates)
    : measure(selected);
}

interface Candidate {
  n: number;
  path: string;
  /** Shift onto the scale and the scale note it lands on; null for untuned sources. */
  tuning: { semitones: number; midi: number } | null;
}

async function generate(
  config: SfxConfig,
  sounds: readonly SoundSpec[],
  candidates: number,
): Promise<number> {
  await mkdir(OUT_DIR, { recursive: true });
  const used = new Set(sounds.flatMap((sound) => sound.parts.map((part) => part.source)));
  const pool = new Map<string, Candidate[]>();
  let requests = 0;
  let requestedSeconds = 0;
  let credits = 0;
  for (const source of config.sources) {
    if (!used.has(source.id)) continue;
    const dir = join(CACHE_DIR, "sources", source.id);
    await mkdir(dir, { recursive: true });
    const key = cacheKey(source);
    const list: Candidate[] = [];
    for (let n = 1; n <= Math.max(candidates, source.pick ?? 0); n += 1) {
      const path = join(dir, `${key}-${n}.mp3`);
      if (!(await Bun.file(path).exists())) {
        const generated = await requestSound(source);
        await Bun.write(path, generated.audio);
        requests += 1;
        requestedSeconds += source.duration_seconds;
        credits += generated.credits;
      }
      let tuning: Candidate["tuning"] = null;
      if (source.tune !== null) {
        const pitch = await pitchOf(path, source.tune);
        tuning = { semitones: pitch.semitones, midi: pitch.midi };
        console.log(
          `  ${source.id}#${n} ${pitch.hz.toFixed(0)} Hz -> ${pitch.note} (${pitch.semitones >= 0 ? "+" : ""}${pitch.semitones.toFixed(2)} st)`,
        );
      }
      list.push({ n, path, tuning });
    }
    pool.set(source.id, source.pick ? list.filter((c) => c.n === source.pick) : list);
  }
  // A shared source keeps the candidate its first sound chose, so the family stays one timbre.
  const chosen = new Map<string, Candidate>();
  for (const sound of sounds) {
    const sourceIds = [...new Set(sound.parts.map((part) => part.source))];
    const options = sourceIds.map((id) => {
      const fixed = chosen.get(id);
      return fixed ? [fixed] : (pool.get(id) ?? []);
    });
    const combos = options.reduce<Candidate[][]>(
      (prefixes, list) => prefixes.flatMap((prefix) => list.map((c) => [...prefix, c])),
      [[]],
    );
    const dir = join(CACHE_DIR, "sounds", sound.id);
    await mkdir(dir, { recursive: true });
    const results: {
      label: string;
      combo: Candidate[];
      out: string;
      m: Measurement;
      score: number;
    }[] = [];
    for (const combo of combos) {
      const label = sourceIds.map((id, index) => `${id}#${combo[index]?.n}`).join("+");
      const out = join(dir, `${label.replaceAll("#", "")}.master.mp3`);
      const parts: ShapePart[] = sound.parts.map((part) => {
        const input = sourceIds.indexOf(part.source);
        const tuning = combo[input]?.tuning ?? null;
        return {
          input,
          layers: part.layers.map((layer) => ({
            delay_ms: layer.delay_ms,
            gain_db: layer.gain_db,
            semitones:
              "steps" in layer
                ? (tuning?.semitones ?? 0) + scaleInterval(tuning?.midi ?? 60, layer.steps)
                : (tuning?.semitones ?? 0) + layer.semitones,
          })),
        };
      });
      const m = await master(
        sound,
        combo.map((c) => c.path),
        parts,
        out,
      );
      const shift = combo.reduce((sum, c) => sum + tuningPenalty(c.tuning?.semitones ?? 0), 0);
      results.push({ label, combo, out, m, score: harshnessScore(sound, m) + shift });
    }
    const best = results.reduce((a, b) => (b.score < a.score ? b : a));
    for (const [index, id] of sourceIds.entries()) {
      const candidate = best.combo[index];
      if (candidate) chosen.set(id, candidate);
    }
    for (const result of results) {
      const failures = verdict(sound, result.m).failures;
      console.log(
        `${result === best ? "*" : " "} ${sound.id} ${result.label} score ${result.score.toFixed(1)}  ${summary(sound, result.m)}${failures.length ? `  FAIL ${failures.join("; ")}` : ""}`,
      );
    }
    await copyFile(best.out, join(OUT_DIR, `${sound.id}.mp3`));
  }
  console.log(
    `\nElevenLabs requests this run: ${requests} (${requestedSeconds.toFixed(1)} s requested, ${credits > 0 ? `${credits} credits reported` : "no credit header returned"})`,
  );
  return 0;
}

async function measure(specs: readonly SoundSpec[]): Promise<number> {
  const shipped = new Set(await readdir(OUT_DIR).catch(() => []));
  const header = [
    "id",
    "len s",
    "max s",
    "TP dBTP",
    "loudness",
    "target",
    "crest dB",
    "centroid Hz",
    ">10k dB",
    "lead ms",
    "tail s",
    "bytes",
    "result",
  ];
  const rows: string[][] = [];
  let failed = 0;
  let total = 0;
  for (const spec of specs) {
    if (!shipped.has(`${spec.id}.mp3`)) {
      rows.push([spec.id, "", "", "", "", "", "", "", "", "", "", "", "MISSING"]);
      failed += 1;
      continue;
    }
    const m = await measureFile(join(OUT_DIR, `${spec.id}.mp3`));
    const result = verdict(spec, m);
    total += m.bytes;
    if (!result.ok) failed += 1;
    const lufs = spec.loudness.kind === "lufs";
    rows.push([
      spec.id,
      m.durationSeconds.toFixed(3),
      spec.max_seconds.toFixed(2),
      m.truePeakDbtp.toFixed(1),
      lufs ? `${m.lufs?.toFixed(1) ?? "n/a"} LUFS` : `${m.rmsDb.toFixed(1)} RMS`,
      String(spec.loudness.target),
      m.crestDb.toFixed(1),
      m.centroidHz.toFixed(0),
      m.airShareDb.toFixed(1),
      (m.leadSeconds * 1000).toFixed(1),
      m.tailSeconds.toFixed(2),
      String(m.bytes),
      result.ok ? "ok" : result.failures.join("; "),
    ]);
  }
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  const line = (cells: readonly string[]) =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join(" | ")} |`;
  console.log(line(header));
  console.log(`|${widths.map((width) => "-".repeat(width + 2)).join("|")}|`);
  for (const row of rows) console.log(line(row));
  console.log(
    `\nTotal ${total} bytes (${(total / 1024).toFixed(1)} KiB) across ${specs.length - failed} passing of ${specs.length}.`,
  );
  return failed === 0 ? 0 : 1;
}

function summary(spec: SoundSpec, m: Measurement): string {
  const level =
    spec.loudness.kind === "lufs"
      ? `${m.lufs?.toFixed(1) ?? "n/a"} LUFS`
      : `${m.rmsDb.toFixed(1)} RMS`;
  return `len ${m.durationSeconds.toFixed(3)} s  TP ${m.truePeakDbtp.toFixed(1)}  ${level}  crest ${m.crestDb.toFixed(1)}  centroid ${m.centroidHz.toFixed(0)}  >10k ${m.airShareDb.toFixed(1)}  tail ${m.tailSeconds.toFixed(2)} s`;
}

/** Raw generations are keyed by every request parameter, so editing a prompt never reuses stale audio. */
function cacheKey(source: SourceSpec): string {
  const request = [MODEL_ID, source.prompt, source.duration_seconds, source.prompt_influence];
  return createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 10);
}

let apiKey: string | null = null;

async function requestSound(source: SourceSpec): Promise<{ audio: ArrayBuffer; credits: number }> {
  apiKey ??= await readApiKey();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text: source.prompt,
      duration_seconds: source.duration_seconds,
      prompt_influence: source.prompt_influence,
      loop: false,
      model_id: MODEL_ID,
    }),
  });
  if (!response.ok) {
    throw new ApiError(
      `ElevenLabs ${response.status} for "${source.id}": ${(await response.text()).slice(0, 500)}`,
    );
  }
  const cost = [...response.headers].filter(([name]) => /cost|credit|character/i.test(name));
  console.log(
    `  generated ${source.id} ${cost.map(([name, value]) => `${name}=${value}`).join(" ")}`,
  );
  const credits = Number(cost.find(([name]) => /cost/i.test(name))?.[1] ?? 0);
  return { audio: await response.arrayBuffer(), credits: Number.isFinite(credits) ? credits : 0 };
}

/** The key comes from the environment or the repo-root .env; it is never printed. */
async function readApiKey(): Promise<string> {
  const fromEnv = process.env.ELEVEN_LABS_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const envFile = Bun.file(join(REPO_ROOT, ".env"));
  if (await envFile.exists()) {
    for (const line of (await envFile.text()).split(/\r?\n/)) {
      const match = /^\s*ELEVEN_LABS_API_KEY\s*=\s*(.*)$/.exec(line);
      const value = match?.[1]?.trim().replace(/^(["'])(.*)\1$/, "$2");
      if (value) return value;
    }
  }
  throw new Error("ELEVEN_LABS_API_KEY is not set in the environment or the repo-root .env");
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(error instanceof ApiError ? 3 : 1);
  },
);
