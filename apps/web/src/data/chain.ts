import { addresses, orderBookAbi, saysoMarketsAbi } from "@sayso/core";
import { useQuery } from "@tanstack/react-query";
import {
  type Address,
  erc20Abi,
  type Hex,
  hexToString,
  type ReadContractReturnType,
  zeroAddress,
} from "viem";
import { publicClient } from "@/lib/chain";
import type { EpisodeState } from "./studio";

export type Balances = { monWei: bigint; ausd: bigint };
export async function readBalances(address: Address): Promise<Balances> {
  const blockNumber = await publicClient.getBlockNumber();
  const [monWei, ausd] = await Promise.all([
    publicClient.getBalance({ address, blockNumber }),
    publicClient.readContract({
      address: addresses.ausd,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
      blockNumber,
    }),
  ]);
  return { monWei, ausd };
}
export function useBalances(address?: Address | null) {
  return useQuery({
    queryKey: ["chain", "balances", address?.toLowerCase()],
    queryFn: () => readBalances(address as Address),
    enabled: !!address,
    refetchInterval: 5_000,
  });
}
export type WordState = "Open" | "SaidPending" | "Yes" | "No" | "Void";
const WORD_STATES: readonly WordState[] = ["Open", "SaidPending", "Yes", "No", "Void"];
export type ChainWord = {
  id: bigint;
  episodeId: number;
  state: WordState;
  text: string;
  yes: Address;
  no: Address;
  market: Address | null;
  sets: bigint;
  chunkA: number;
  chunkB: number;
  offsetMs: number;
};
export type ChainEpisode = {
  id: number;
  clipId: Hex;
  rootA: Hex;
  rootB: Hex;
  startsAt: bigint;
  endsAt: bigint;
  closedAt: bigint;
  wordCount: number;
  resolvedCount: number;
  listed: boolean;
  closed: boolean;
  state: EpisodeState;
  words: ChainWord[];
  blockNumber: bigint;
  blockTimestamp: bigint;
};
export type RawChainWord = ReadContractReturnType<typeof saysoMarketsAbi, "word">;
export function toChainWord(id: bigint, word: RawChainWord): ChainWord {
  const state = WORD_STATES[word.state];
  if (!state) throw new Error("Unknown chain word state");
  return {
    ...word,
    id,
    state,
    text: hexToString(word.text, { size: 32 }).replace(/\0+$/, ""),
    market: word.market === zeroAddress ? null : word.market,
  };
}
export async function readWord(id: bigint, blockNumber?: bigint): Promise<ChainWord> {
  const word = await publicClient.readContract({
    address: addresses.saysoMarkets,
    abi: saysoMarketsAbi,
    functionName: "word",
    args: [id],
    ...(blockNumber === undefined ? {} : { blockNumber }),
  });
  return toChainWord(id, word);
}
export async function readEpisode(id: number): Promise<ChainEpisode> {
  const block = await publicClient.getBlock();
  const [episode, ids] = await Promise.all([
    publicClient.readContract({
      address: addresses.saysoMarkets,
      abi: saysoMarketsAbi,
      functionName: "episode",
      args: [id],
      blockNumber: block.number,
    }),
    publicClient.readContract({
      address: addresses.saysoMarkets,
      abi: saysoMarketsAbi,
      functionName: "episodeWords",
      args: [id],
      blockNumber: block.number,
    }),
  ]);
  const words = await Promise.all(ids.map((wordId) => readWord(wordId, block.number)));
  const state: EpisodeState =
    episode.resolvedCount === episode.wordCount && episode.wordCount > 0
      ? "Settled"
      : episode.closed
        ? "Closed"
        : block.timestamp >= episode.startsAt
          ? "Live"
          : "Scheduled";
  return {
    ...episode,
    id,
    state,
    words,
    blockNumber: block.number,
    blockTimestamp: block.timestamp,
  };
}
export async function readLatestEpisode() {
  const nextEpisodeId = await publicClient.readContract({
    address: addresses.saysoMarkets,
    abi: saysoMarketsAbi,
    functionName: "nextEpisodeId",
  });
  return {
    nextEpisodeId,
    episode: nextEpisodeId > 1 ? await readEpisode(nextEpisodeId - 1) : null,
  };
}
export function useLatestEpisode() {
  return useQuery({
    queryKey: ["chain", "latest-episode"],
    queryFn: readLatestEpisode,
    refetchInterval: 5_000,
  });
}
export function useChainEpisode(id?: number) {
  return useQuery({
    queryKey: ["chain", "episode", id],
    queryFn: () => readEpisode(id as number),
    enabled: id !== undefined,
    refetchInterval: 5_000,
  });
}
export function useWordState(id?: bigint) {
  return useQuery({
    queryKey: ["chain", "word", id?.toString()],
    queryFn: () => readWord(id as bigint),
    enabled: id !== undefined,
    refetchInterval: 1_000,
  });
}
export type BestBidAsk = { bidRaw: bigint; askRaw: bigint };
export async function readBestBidAsk(market: Address): Promise<BestBidAsk> {
  const [bidRaw, askRaw] = await publicClient.readContract({
    address: market,
    abi: orderBookAbi,
    functionName: "bestBidAsk",
  });
  // Raw book units, not fabricated cents. A future ticket must apply this book's price precision.
  return { bidRaw, askRaw };
}
/**
 * Every book of an episode in one `eth_call`. Six separate 1 s polls, next to the studio and an
 * RPC-sourced indexer on the same IP, trip the public RPC's 15 requests/s limit.
 */
export async function readBooks(markets: readonly Address[]): Promise<BestBidAsk[]> {
  const books = await publicClient.multicall({
    contracts: markets.map((address) => ({
      address,
      abi: orderBookAbi,
      functionName: "bestBidAsk" as const,
    })),
    allowFailure: false,
    deployless: true,
  });
  return books.map(([bidRaw, askRaw]) => ({ bidRaw, askRaw }));
}
