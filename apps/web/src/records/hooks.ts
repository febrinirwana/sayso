import { addresses, explorerTxUrl, gasLimit, outcomeTokenAbi, saysoMarketsAbi } from "@sayso/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { type Address, encodeFunctionData, type Hex } from "viem";
import { TransactionRevertedError, useAccount } from "@/account";
import { type ChainEpisode, type ChainWord, readEpisode } from "@/data/chain";
import { publicClient } from "@/lib/chain";
import { redeemableAmount, redemptionAmounts } from "./adapters";

export type Holding = { word: ChainWord; episode: ChainEpisode; yes: bigint; no: bigint };
export async function readHoldings(
  episodes: readonly ChainEpisode[],
  address: Address,
): Promise<Holding[]> {
  const blockNumber = await publicClient.getBlockNumber();
  const holdings: Holding[] = [];
  // Serialize RPC reads: the public endpoint shares a 25 request/s budget with the studio.
  for (const episode of episodes) {
    for (const word of episode.words) {
      // This workspace targets ES2023; Promise.withResolvers is ES2024.
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
      const yes = await publicClient.readContract({
        address: word.yes,
        abi: outcomeTokenAbi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      });
      const no = await publicClient.readContract({
        address: word.no,
        abi: outcomeTokenAbi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      });
      holdings.push({ episode, word, yes, no });
    }
  }
  return holdings;
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
  const queries = useQueryClient();
  return useQuery({
    queryKey: ["records", "portfolio", address],
    queryFn: async () => {
      const next = await publicClient.readContract({
        address: addresses.saysoMarkets,
        abi: saysoMarketsAbi,
        functionName: "nextEpisodeId",
      });
      const episodes: ChainEpisode[] = [];
      for (let id = 1; id < next; id++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
        episodes.push(
          await queries.fetchQuery({
            queryKey: ["chain", "episode", id],
            queryFn: () => readEpisode(id),
            staleTime: 30_000,
          }),
        );
      }
      return readHoldings(episodes, address as Address);
    },
    enabled: !!address,
    retry: false,
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
      // Re-read balances, so retries/partial successes cannot reuse a burned balance.
      const episodes = [
        ...new Map(holdings.map((holding) => [holding.episode.id, holding.episode])).values(),
      ];
      const fresh = await readHoldings(episodes, account.address);
      const selected = new Set(holdings.map((holding) => holding.word.id));
      for (const holding of fresh) {
        if (
          !selected.has(holding.word.id) ||
          redeemableAmount(holding.word.state, holding.yes, holding.no) === 0n
        )
          continue;
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
