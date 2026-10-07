import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { harshnessScore, type Measurement, verdict } from "./audio";
import { HELP, parseArgs, parseSounds, type SoundSpec } from "./config";
import { master, measureFile } from "./ffmpeg";

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
  const specs = parseSounds(await Bun.file(join(TOOL_DIR, "sounds.json")).json());
  const selected = options.only ? specs.filter((spec) => options.only?.includes(spec.id)) : specs;
  const unknown = options.only?.filter((id) => !specs.some((spec) => spec.id === id)) ?? [];
  if (unknown.length > 0) throw new Error(`unknown sound ids: ${unknown.join(", ")}`);
  return options.command === "generate"
    ? generate(selected, options.candidates)
    : measure(selected);
}

async function generate(specs: readonly SoundSpec[], candidates: number): Promise<number> {
  await mkdir(OUT_DIR, { recursive: true });
  let requests = 0;
  for (const spec of specs) {
    const dir = join(CACHE_DIR, spec.id);
    await mkdir(dir, { recursive: true });
    const key = cacheKey(spec);
    const raws: string[] = [];
    for (let n = 1; n <= candidates; n += 1) {
      const raw = join(dir, `${key}-${n}.mp3`);
      if (!(await Bun.file(raw).exists())) {
        await Bun.write(raw, await requestSound(spec));
        requests += 1;
      }
      raws.push(raw);
    }
    const results: { n: number; out: string; m: Measurement; score: number }[] = [];
    for (const [index, raw] of raws.entries()) {
      const out = raw.replace(/\.mp3$/, ".master.mp3");
      const m = await master(spec, raw, out);
      results.push({ n: index + 1, out, m, score: harshnessScore(spec, m) });
    }
    const chosen =
      results.find((result) => result.n === spec.pick) ??
      results.reduce((best, result) => (result.score < best.score ? result : best));
    for (const result of results) {
      const failures = verdict(spec, result.m).failures;
      console.log(
        `${result === chosen ? "*" : " "} ${spec.id}#${result.n} score ${result.score.toFixed(1)}  ${summary(spec, result.m)}${failures.length ? `  FAIL ${failures.join("; ")}` : ""}`,
      );
    }
    await copyFile(chosen.out, join(OUT_DIR, `${spec.id}.mp3`));
  }
  console.log(`\nElevenLabs requests this run: ${requests}`);
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
    ">8k dB",
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
      rows.push([spec.id, "", "", "", "", "", "", "", "", "", "", "MISSING"]);
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
      m.highShareDb.toFixed(1),
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
  return `len ${m.durationSeconds.toFixed(3)} s  TP ${m.truePeakDbtp.toFixed(1)}  ${level}  crest ${m.crestDb.toFixed(1)}  >8k ${m.highShareDb.toFixed(1)}  tail ${m.tailSeconds.toFixed(2)} s`;
}

/** Raw generations are keyed by every request parameter, so editing a prompt never reuses stale audio. */
function cacheKey(spec: SoundSpec): string {
  const request = [MODEL_ID, spec.prompt, spec.duration_seconds, spec.prompt_influence];
  return createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 10);
}

let apiKey: string | null = null;

async function requestSound(spec: SoundSpec): Promise<ArrayBuffer> {
  apiKey ??= await readApiKey();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text: spec.prompt,
      duration_seconds: spec.duration_seconds,
      prompt_influence: spec.prompt_influence,
      loop: false,
      model_id: MODEL_ID,
    }),
  });
  if (!response.ok) {
    throw new ApiError(
      `ElevenLabs ${response.status} for "${spec.id}": ${(await response.text()).slice(0, 500)}`,
    );
  }
  const cost = [...response.headers].filter(([name]) => /cost|credit|character/i.test(name));
  console.log(
    `  generated ${spec.id} ${cost.map(([name, value]) => `${name}=${value}`).join(" ")}`,
  );
  return response.arrayBuffer();
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
