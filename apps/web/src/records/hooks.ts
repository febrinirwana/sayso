import { addresses, explorerTxUrl, gasLimit, outcomeTokenAbi, saysoMarketsAbi } from "@sayso/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { TransactionRevertedError, useAccount } from "@/account";
import {
  type ChainEpisode,
  type ChainWord,
  type RawChainWord,
  readEpisodes,
  toChainWord,
} from "@/data/chain";
import { publicClient } from "@/lib/chain";
import { redeemableAmount, redemptionAmounts } from "./adapters";

export type Holding = { word: ChainWord; episode: ChainEpisode; yes: bigint; no: bigint };
export async function readHoldings(
  episodes: readonly ChainEpisode[],
  address: Address,
): Promise<Holding[]> {
  const blockNumber = await publicClient.getBlockNumber();
  const words = episodes.flatMap((episode) => episode.words.map((word) => ({ episode, word })));
  // One eth_call for every balance at one block: the public RPC limits each IP to
  // 15 requests/s, and a per-word read loop made redemption fail on that limit.
  const values = await publicClient.multicall({
    contracts: words.flatMap(({ word }) =>
      [word.yes, word.no].map((token) => ({
        address: token,
        abi: outcomeTokenAbi,
        functionName: "balanceOf" as const,
        args: [address] as const,
      })),
    ),
    allowFailure: false,
    deployless: true,
    blockNumber,
  });
  return words.map(({ episode, word }, i) => ({
    episode,
    word,
    yes: values[i * 2] as bigint,
    no: values[i * 2 + 1] as bigint,
  }));
}
/**
 * What `holdings` can redeem right now. Word states are re-read with the balances, in one eth_call at
 * one block: rows carry the episode as it was fetched, which can predate settlement (episode 15), and
 * separate state reads hit the public RPC's 15 requests/s limit (episode 16).
 */
export async function readRedeemable(
  holdings: readonly Holding[],
  address: Address,
  client: Pick<typeof publicClient, "getBlockNumber" | "multicall"> = publicClient,
): Promise<Holding[]> {
  const blockNumber = await client.getBlockNumber();
  const values = await client.multicall({
    contracts: holdings.flatMap(({ word }) => [
      {
        address: addresses.saysoMarkets,
        abi: saysoMarketsAbi,
        functionName: "word" as const,
        args: [word.id] as const,
      },
      ...[word.yes, word.no].map((token) => ({
        address: token,
        abi: outcomeTokenAbi,
        functionName: "balanceOf" as const,
        args: [address] as const,
      })),
    ]),
    allowFailure: false,
    deployless: true,
    blockNumber,
  });
  return holdings.flatMap((holding, i) => {
    const word = toChainWord(holding.word.id, values[i * 3] as RawChainWord);
    const yes = values[i * 3 + 1] as bigint;
    const no = values[i * 3 + 2] as bigint;
    return redeemableAmount(word.state, yes, no) > 0n ? [{ ...holding, word, yes, no }] : [];
  });
}
export function useEpisodeHoldings(episode: ChainEpisode | undefined, address: Address | null) {
  return useQuery({
    queryKey: ["records", "holdings", episode?.id, address],
    queryFn: () => readHoldings([episode as ChainEpisode], address as Address),
    enabled: !!episode && !!address,
    retry: false,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}
export function usePortfolioHoldings(address: Address | null) {
  return useQuery({
    queryKey: ["records", "portfolio", address],
    queryFn: async () => {
      const next = await publicClient.readContract({
        address: addresses.saysoMarkets,
        abi: saysoMarketsAbi,
        functionName: "nextEpisodeId",
      });
      // Every episode in three requests, then balances in one: per-episode loops hit 429.
      const ids = Array.from({ length: Math.max(0, Number(next) - 1) }, (_, i) => i + 1);
      return readHoldings(await readEpisodes(ids), address as Address);
    },
    enabled: !!address,
    // One transient 429 must not leave the honest "incomplete snapshot" error up for a minute.
    retry: 2,
    staleTime: 5_000,
    refetchInterval: 60_000,
  });
}
export type RedeemStatus = "idle" | "sending" | "redeemed" | "failed";
export type Redemption = {
  state: RedeemStatus;
  transactions: { wordId: string; hash: Hex; url: string }[];
  error: string | null;
  failedTxUrl: string | null;
  redeem: (holdings: readonly Holding[]) => Promise<void>;
};
export function useRedeem(): Redemption {
  const account = useAccount();
  const queries = useQueryClient();
  const busy = useRef(false);
  const [state, setState] = useState<RedeemStatus>("idle");
  const [transactions, setTransactions] = useState<{ wordId: string; hash: Hex; url: string }[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [failedTxUrl, setFailedTxUrl] = useState<string | null>(null);
  async function redeem(holdings: readonly Holding[]) {
    if (busy.current || !account.address) return;
    busy.current = true;
    setState("sending");
    setError(null);
    setFailedTxUrl(null);
    try {
      // Re-read states and balances, so a stale row or a retry cannot reuse a burned balance.
      const fresh = await readRedeemable(holdings, account.address);
      if (fresh.length === 0)
        throw new Error("Nothing to redeem yet. Your words are still being confirmed.");
      for (const holding of fresh) {
        for (const amount of redemptionAmounts(holding.word.state, holding.yes, holding.no)) {
          const hash = await account.send({
            to: addresses.saysoMarkets,
            data: encodeFunctionData({
              abi: saysoMarketsAbi,
              functionName: "redeem",
              args: [holding.word.id, amount],
            }),
            gas: gasLimit("redeem"),
          });
          setTransactions((previous) => [
            ...previous,
            { wordId: holding.word.id.toString(), hash, url: explorerTxUrl(hash) },
          ]);
        }
      }
      setState("redeemed");
    } catch (cause) {
      setState("failed");
      if (cause instanceof TransactionRevertedError) setFailedTxUrl(explorerTxUrl(cause.hash));
      setError(
        cause instanceof Error
          ? cause.message
          : "Redemption failed. Your remaining shares are still yours.",
      );
    } finally {
      busy.current = false;
      await Promise.all([
        queries.invalidateQueries({ queryKey: ["records"] }),
        queries.invalidateQueries({ queryKey: ["chain", "balances"] }),
        queries.invalidateQueries({ queryKey: ["indexer", "positions"] }),
      ]);
    }
  }
  return { state, transactions, error, failedTxUrl, redeem };
}
