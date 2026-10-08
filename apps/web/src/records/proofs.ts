import { CHUNK_MS, matchesTarget } from "@sayso/core";
import { useQuery } from "@tanstack/react-query";
import type { ChainEpisode } from "@/data/chain";
import { config } from "@/lib/config";
import type { TranscriptEvidence } from "@/screens/results/types";
import { verifyChunk } from "./adapters";

export function useRevealedProofs(episode: ChainEpisode | undefined, opened: boolean) {
  return useQuery({
    queryKey: ["records", "proofs", episode?.id],
    enabled: opened && !!episode?.closed,
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const source = episode as ChainEpisode;
      const count = Math.ceil((Number(source.endsAt - source.startsAt) * 1000) / CHUNK_MS);
      const evidence: { A: TranscriptEvidence[]; B: TranscriptEvidence[] } = { A: [], B: [] };
      for (const engine of ["A", "B"] as const) {
        for (let index = 0; index < count; index++) {
          let response: Response;
          try {
            response = await fetch(
              `${config.studioUrl}/v1/episodes/${source.id}/chunks/${engine}/${index}`,
              { signal },
            );
          } catch {
            throw new Error("Transcript not revealed. The studio reveal service is unavailable.");
          }
          if (response.status === 425 || response.status === 404)
            throw new Error("Transcript not revealed. This chunk is not available yet.");
          if (!response.ok)
            throw new Error("Transcript not revealed. The studio reveal service is unavailable.");
          evidence[engine].push({
            ...verifyChunk(await response.json(), {
              clipId: source.clipId,
              engine,
              index,
              root: engine === "A" ? source.rootA : source.rootB,
            }),
            verifiedChunkCount: count,
            totalChunkCount: count,
          });
        }
      }
      return evidence;
    },
  });
}
export function proofExcerpt(
  chunks: readonly TranscriptEvidence[],
  target: string,
): TranscriptEvidence | undefined {
  return (
    chunks.find((chunk) => chunk.tokens.some(([token]) => matchesTarget(target, token))) ??
    chunks[0]
  );
}
