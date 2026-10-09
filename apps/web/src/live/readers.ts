import { kuruToCents, outcomeTokenAbi, priceToKuru } from "@sayso/core";
import { useQuery } from "@tanstack/react-query";
import { type Address, formatUnits } from "viem";
import { type ChainWord, readBooks } from "@/data/chain";
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
/** A book read older than this is no price: the 1 s poll has missed two beats in a row. */
const BOOK_MAX_AGE_MS = 3_000;
export type BookQuote = { bid: number | null; ask: number | null };
export function useEpisodeBooks(words: readonly ChainWord[]): BookQuote[] {
  const markets = words.flatMap((word) => (word.market ? [word.market] : []));
  const books = useQuery({
    queryKey: ["chain", "books", markets],
    queryFn: () => readBooks(markets),
    enabled: markets.length > 0,
    refetchInterval: 1_000,
    // The next poll is the retry. Backoff retries held a failed book for up to 7 s, then blanked it.
    retry: false,
  });
  const fresh = books.data !== undefined && Date.now() - books.dataUpdatedAt <= BOOK_MAX_AGE_MS;
  return words.map((word) => {
    const book = fresh && word.market ? books.data?.[markets.indexOf(word.market)] : undefined;
    return { bid: bookCents(book?.bidRaw), ask: bookCents(book?.askRaw) };
  });
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
