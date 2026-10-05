import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Hex } from "viem";
import { buildOutput, durationMsFor, parseManifest } from "./output.ts";
import { parseVosk, parseWhisper } from "./parsers.ts";

const help = `SAYSO offline two-engine transcription (private studio data)

Usage:
  bun run --cwd tools/transcribe transcribe -- --media <file> --manifest <manifest.json> --out <studioDataDir>

Required environment (paths, never keys):
  WHISPER_CLI    whisper.cpp 1.9.4 executable
  WHISPER_MODEL  pinned ggml-base.en.bin (S7 SHA256 a03779c86df3323075f5e796cb2ce5029f00ec8869eee3fdfb897afe36c6d002)
  VOSK_MODEL    vosk-model-en-us-0.22 directory
Optional environment:
  VOSK_PYTHON_PROJECT  uv project with vosk==0.3.45; defaults to tools/transcribe/vosk
Prerequisites: ffmpeg, ffprobe and uv on PATH; Python 3.12.
Whisper flags: -l en -t 4 -ng -ml 1 -sow -ojf.

Manifest: {"id":"clip-slug","licence":"CC0","sourceUrl":null,"words":[six distinct lowercase targets]}
Licence: team-recorded | public-domain | CC0. sourceUrl is optional.
Relative CLI/environment paths resolve from the invoking package working directory.
Outputs: <out>/<id>/clip.json (ERD clips fields; studio sets created_at at ingest),
         flag-plan.json (word -> agreement or null),
         chunks/A/<index>.json and chunks/B/<index>.json (ERD section 4 payload).
Existing clip output is refused. --out must be outside this repository, including symlinks.
Media is hashed as supplied; clipId = keccak256(raw SHA256 bytes || UTF-8 manifest id).
Final chunk end is the next 10-second boundary, not truncated to media duration.
Only fixture data may be copied into clips/fixtures; never publish real outcomes.
`;

function argumentsFor(argv: string[]) {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--") continue;
    const value = argv[++i];
    if (
      !flag ||
      !["--media", "--manifest", "--out"].includes(flag) ||
      !value ||
      value.startsWith("--") ||
      flags.has(flag)
    ) {
      throw new Error("Expected --media <file> --manifest <json> --out <directory>; see --help");
    }
    flags.set(flag, resolve(value));
  }
  const media = flags.get("--media");
  const manifest = flags.get("--manifest");
  const out = flags.get("--out");
  if (!media || !manifest || !out)
    throw new Error("--media, --manifest and --out are required; see --help");
  return { media, manifest, out };
}

function requiredPath(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}; see --help for engine setup`);
  return resolve(value);
}

async function run(command: string[]): Promise<string> {
  const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`${command[0]} exited ${code}: ${stderr.trim()}`);
  return stdout;
}

async function digest(path: string): Promise<Hex> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return `0x${hash.digest("hex")}`;
}

async function canonicalDestination(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return join(await canonicalDestination(parent), relative(parent, path));
  }
}

async function main() {
  if (process.argv.slice(2).includes("--help")) {
    console.log(help);
    return;
  }
  const args = argumentsFor(process.argv.slice(2));
  const whisper = requiredPath("WHISPER_CLI");
  const whisperModel = requiredPath("WHISPER_MODEL");
  const voskModel = requiredPath("VOSK_MODEL");
  const packageRoot = fileURLToPath(new URL("../", import.meta.url));
  const project = process.env.VOSK_PYTHON_PROJECT
    ? resolve(process.env.VOSK_PYTHON_PROJECT)
    : join(packageRoot, "vosk");
  const repository = await realpath(fileURLToPath(new URL("../../../", import.meta.url)));
  const destination = await canonicalDestination(args.out);
  const inside = relative(repository, destination);
  if (
    !inside ||
    (!inside.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(inside))
  ) {
    throw new Error("Studio output must be outside the repository to protect outcomes");
  }
  const manifest = parseManifest(await Bun.file(args.manifest).json());
  const clipDirectory = join(destination, manifest.id);
  await mkdir(destination, { recursive: true });
  await mkdir(clipDirectory); // Never overwrite a previously committed transcript.
  const scratch = await mkdtemp(join(tmpdir(), "sayso-transcribe-"));
  let complete = false;
  try {
    const wav = join(scratch, "audio.wav");
    await run([
      "ffmpeg",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      args.media,
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      wav,
    ]);
    const duration = await run([
      "ffprobe",
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      args.media,
    ]);
    const durationMs = durationMsFor(duration);
    const prefix = join(scratch, "whisper");
    await run([
      whisper,
      "-m",
      whisperModel,
      "-f",
      wav,
      "-l",
      "en",
      "-t",
      "4",
      "-ng",
      "-ml",
      "1",
      "-sow",
      "-ojf",
      "-of",
      prefix,
    ]);
    const voskFile = join(scratch, "vosk.json");
    await run([
      "uv",
      "run",
      "--project",
      project,
      "--python",
      "3.12",
      "--no-progress",
      join(packageRoot, "vosk", "transcribe.py"),
      "--wav",
      wav,
      "--model",
      voskModel,
      "--out",
      voskFile,
    ]);
    const mediaSha256 = await digest(args.media);
    const output = buildOutput(
      manifest,
      mediaSha256,
      durationMs,
      parseWhisper(await Bun.file(`${prefix}.json`).json()),
      parseVosk(await Bun.file(voskFile).json()),
    );
    const writeJson = (path: string, value: unknown) =>
      Bun.write(path, `${JSON.stringify(value, null, 2)}\n`);
    await writeJson(join(clipDirectory, "clip.json"), {
      id: manifest.id,
      clip_id: output.clipId,
      media_sha256: mediaSha256,
      duration_ms: durationMs,
      licence: manifest.licence,
      source_url: manifest.sourceUrl,
      words_json: JSON.stringify(manifest.words),
      root_a: output.rootA,
      root_b: output.rootB,
    });
    await writeJson(join(clipDirectory, "flag-plan.json"), output.flagPlan);
    for (const chunks of [output.chunksA, output.chunksB]) {
      for (const chunk of chunks)
        await writeJson(join(clipDirectory, "chunks", chunk.engine, `${chunk.index}.json`), chunk);
    }
    complete = true;
    console.log(`clipId ${output.clipId}\nrootA ${output.rootA}\nrootB ${output.rootB}`);
    for (const word of manifest.words) {
      const agreed = output.flagPlan[word];
      console.log(
        `${word}: ${agreed ? `SAID ${agreed.t_ms} ms (A ${agreed.chunk_a}, B ${agreed.chunk_b})` : "NO (no agreement)"}`,
      );
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
    if (!complete) await rm(clipDirectory, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
