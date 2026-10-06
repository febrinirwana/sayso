import {
  decide,
  type Episode,
  type Mode,
  type Report,
  requiredChunks,
  type Word,
} from "./decide.ts";

export type ResolverIO = {
  readEpisode(id: number): Episode & { wordCount: number };
  readWord(id: bigint): Word;
  episodeWords(id: number): readonly bigint[];
  fetchChunk(id: number, engine: "A" | "B", index: number): unknown;
  submitReport(report: Report): string;
  log(message: string): void;
};

function noReport(io: ResolverIO, episodeId: number, retryable: boolean): string {
  // Stable CLI protocol: only emit while report submission has provably not been entered.
  io.log(
    `SAYSO_CRE_STATUS:${JSON.stringify({ episodeId, phase: "prewrite", result: "no-report", retryable })}`,
  );
  return "no-report";
}

export function resolve(
  mode: Mode,
  episodeId: number,
  eventWordIds: readonly bigint[],
  io: ResolverIO,
): string {
  let stage = "EVM episode read";
  let writeStarted = false;
  try {
    const episode = io.readEpisode(episodeId);
    stage = "EVM word enumeration";
    const ids = mode === "closed" ? io.episodeWords(episodeId) : eventWordIds;
    if (mode === "closed" && ids.length !== episode.wordCount) {
      io.log(`Episode ${episodeId}: incomplete onchain word enumeration; no report`);
      return noReport(io, episodeId, true);
    }
    stage = "EVM word read";
    const words = ids.map((id) => io.readWord(id));
    if (!words.some((w) => (mode === "closed" ? w.state === 0 || w.state === 1 : w.state === 1))) {
      return noReport(io, episodeId, false);
    }
    stage = "chunk fetch";
    const payloads = requiredChunks(mode, episode, words).map(({ engine, index }) => {
      stage = `chunk fetch ${engine}/${index}`;
      return io.fetchChunk(episodeId, engine, index);
    });
    stage = "proof and agreement verification";
    const decision = decide(mode, episode, words, payloads);
    if (!decision.report) {
      io.log(`Episode ${episodeId}: ${decision.reason}; no report`);
      return noReport(io, episodeId, decision.retryable);
    }
    stage = "report generation and delivery";
    writeStarted = true;
    return io.submitReport(decision.report);
  } catch {
    // Capability exceptions may embed responses; keep transcripts and credentials out of logs.
    io.log(`Episode ${episodeId}: failed during ${stage}; no completed report`);
    if (!writeStarted) return noReport(io, episodeId, true);
    return "no-report";
  }
}
