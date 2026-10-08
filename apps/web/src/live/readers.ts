import { kuruToCents, outcomeTokenAbi, priceToKuru } from "@sayso/core";
import { useQuery } from "@tanstack/react-query";
import { type Address, formatUnits } from "viem";
import { type ChainWord, useBestBidAsk } from "@/data/chain";
import { graphql } from "@/data/indexer";
import { publicClient } from "@/lib/chain";

export type TokenPosition = { wordId: bigint; yes: bigint; no: bigint };
export async function readTokenPositions(
  address: Address,
  words: readonly ChainWord[],
): Promise<TokenPosition[]> {
  const calls = words.flatMap((word) =>
    [word.yes, word.no].map((token) => ({
      address: token,
      abi: outcomeTokenAbi,
      functionName: "balanceOf" as const,
      args: [address] as const,
    })),
  );
  const values = await publicClient.multicall({
    contracts: calls,
    allowFailure: false,
    deployless: true,
  });
  return words.map((word, i) => ({
    wordId: word.id,
    yes: values[i * 2] as bigint,
    no: values[i * 2 + 1] as bigint,
  }));
}
export function useTokenPositions(address: Address | null, words: readonly ChainWord[]) {
  return useQuery({
    queryKey: ["live", "positions", address, words.map((w) => w.id.toString())],
    queryFn: () => readTokenPositions(address as Address, words),
    enabled: !!address && words.length > 0,
    refetchInterval: 5_000,
  });
}
export function bookCents(raw: bigint | undefined): number | null {
  if (raw === undefined) return null;
  try {
    return kuruToCents(priceToKuru(formatUnits(raw, 18)));
  } catch {
    return null;
  }
}
export function useEpisodeBooks(words: readonly ChainWord[]) {
  // Fixed hook count supports the onchain 1–8 word bound and shares existing query keys.
  const q0 = useBestBidAsk(words[0]?.market),
    q1 = useBestBidAsk(words[1]?.market);
  const q2 = useBestBidAsk(words[2]?.market),
    q3 = useBestBidAsk(words[3]?.market);
  const q4 = useBestBidAsk(words[4]?.market),
    q5 = useBestBidAsk(words[5]?.market);
  const q6 = useBestBidAsk(words[6]?.market),
    q7 = useBestBidAsk(words[7]?.market);
  return [q0, q1, q2, q3, q4, q5, q6, q7].slice(0, words.length).map((q) => ({
    bid: q.isError ? null : bookCents(q.data?.bidRaw),
    ask: q.isError ? null : bookCents(q.data?.askRaw),
  }));
}
type EpisodeTradeRow = {
  id: string;
  word_id: string;
  player_id: string;
  side: number;
  tokenAmount: string;
  ausdAmount: string;
  priceBps: number;
};
export function useEpisodeTrades(id: number) {
  return useQuery({
    queryKey: ["live", "trades", id],
    queryFn: async () => {
      const rows: EpisodeTradeRow[] = [];
      for (let offset = 0; ; offset += 1_000) {
        const data = await graphql<{ Trade: EpisodeTradeRow[] }>(
          "query EpisodeTrades($id: String!, $offset: Int!) { Trade(where: {word: {episode_id: {_eq: $id}}}, order_by: [{block: asc}, {id: asc}], limit: 1000, offset: $offset) { id word_id player_id side tokenAmount ausdAmount priceBps } }",
          { id: String(id), offset },
        );
        rows.push(...data.Trade);
        if (data.Trade.length < 1_000) return rows;
      }
    },
    refetchInterval: 15_000,
    retry: false,
  });
}
