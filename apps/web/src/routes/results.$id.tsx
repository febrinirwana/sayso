import { explorerTxUrl } from "@sayso/core";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { Hex } from "viem";
import { RequireAccount, useAccount } from "@/account";
import { useBalances, useChainEpisode } from "@/data/chain";
import { useIndexedEpisode, usePlayerPositions } from "@/data/indexer";
import { profitFromPosition, profitFromTrades, redeemableAmount } from "@/records/adapters";
import { useEpisodeHoldings, useRedeem } from "@/records/hooks";
import { useRecordTrades } from "@/records/indexer";
import { proofExcerpt, useRevealedProofs } from "@/records/proofs";
import { RecordStatus, RedeemReceipts } from "@/records/RecordStatus";
import { Results } from "@/screens/results/Results";
import type { RecordTrade, ResultWord } from "@/screens/results/types";
import { AppShell } from "@/shell/AppShell";

export const Route = createFileRoute("/results/$id")({
  component: () => (
    <RequireAccount>
      <ResultsPage />
    </RequireAccount>
  ),
});
function ResultsPage() {
  const { id } = Route.useParams();
  const episodeId =
    /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id)) ? Number(id) : undefined;
  const account = useAccount();
  const navigate = useNavigate();
  const balances = useBalances(account.address);
  const episode = useChainEpisode(episodeId);
  const indexed = useIndexedEpisode(episodeId);
  const positions = usePlayerPositions(account.address);
  const trades = useRecordTrades(account.address);
  const holdings = useEpisodeHoldings(episode.data, account.address);
  const redemption = useRedeem();
  const [opened, setOpened] = useState(false);
  const proofs = useRevealedProofs(episode.data, opened);
  const accountingUnavailable =
    indexed.isError ||
    positions.isError ||
    trades.isError ||
    positions.isPending ||
    trades.isPending;
  const redeemableByWord: Record<string, bigint> = {};
  const words: ResultWord[] = (episode.data?.words ?? []).map((word) => {
    const holding = holdings.data?.find((row) => row.word.id === word.id);
    const redeemable = holding ? redeemableAmount(word.state, holding.yes, holding.no) : 0n;
    redeemableByWord[word.id.toString()] = redeemable;
    const fills: RecordTrade[] = (trades.data ?? [])
      .filter((trade) => trade.word.id === word.id)
      .map((trade) => ({
        ...trade,
        side: trade.side as RecordTrade["side"],
        txUrl: explorerTxUrl(trade.id.split("-")[0] as Hex),
      }));
    const position = positions.data?.find((row) => row.word.id === word.id);
    const metadata = indexed.data?.words.find((row) => row.id === word.id);
    const a = proofs.data && proofExcerpt(proofs.data.A, word.text);
    const b = proofs.data && proofExcerpt(proofs.data.B, word.text);
    const resolveTxUrl = metadata?.resolveTx ? explorerTxUrl(metadata.resolveTx as Hex) : undefined;
    return {
      id: word.id.toString(),
      text: word.text,
      state: word.state,
      profit: position
        ? profitFromPosition(position, redeemable)
        : profitFromTrades(fills, 0n, redeemable),
      trades: fills,
      accountingUnavailable,
      roots: [episode.data?.rootA ?? "", episode.data?.rootB ?? ""],
      evidenceHash: metadata?.evidenceHash ?? null,
      ...(resolveTxUrl ? { resolveTxUrl } : {}),
      settlementMode: "simulation",
      proofStatus: !episode.data?.closed
        ? "Transcript not revealed. Proofs open after the episode closes."
        : proofs.isFetching
          ? "Checking revealed transcript proofs…"
          : (proofs.error?.message ?? "Transcript not revealed."),
      ...(a && b
        ? {
            proof: {
              engines: [a, b] as const,
              evidenceHash: metadata?.evidenceHash ?? "Not settled yet",
              resolveTx: metadata?.resolveTx ?? null,
              ...(resolveTxUrl ? { resolveTxUrl } : {}),
              mode: "simulation" as const,
            },
          }
        : {}),
    };
  });
  const redeemable = Object.values(redeemableByWord).reduce((sum, value) => sum + value, 0n);
  return (
    <AppShell
      active="arena"
      balance={balances.data?.ausd ?? null}
      nickname={account.nickname ?? ""}
    >
      {episodeId === undefined || episode.isError ? (
        <RecordStatus message="Episode unavailable. The chain could not provide this episode." />
      ) : !episode.data ? (
        <RecordStatus message="Loading the committed episode from Monad testnet…" />
      ) : (
        <>
          {accountingUnavailable && (
            <RecordStatus message="Envio trade history is unavailable or still loading. Word outcomes and winning balances come directly from Monad testnet." />
          )}
          <RedeemReceipts redemption={redemption} />
          <Results
            episodeId={id}
            state={
              episode.data.state !== "Settled"
                ? "settling"
                : redemption.state === "redeemed" && redeemable === 0n
                  ? "redeemed"
                  : "settled"
            }
            profit={words.reduce((sum, word) => sum + word.profit, 0n)}
            redeemable={redeemable}
            words={words}
            redeemState={redemption.state === "sending" ? "sending" : "idle"}
            accountingUnavailable={accountingUnavailable || !holdings.data || holdings.isError}
            balancesUnavailable={!holdings.data || holdings.isError}
            redeemableByWord={redeemableByWord}
            onProofOpen={() => setOpened(true)}
            onRedeemWord={(wordId) => {
              void redemption.redeem(
                (holdings.data ?? []).filter((row) => row.word.id.toString() === wordId),
              );
            }}
            onRedeem={() => {
              void redemption.redeem(holdings.data ?? []);
            }}
            onPlayNext={() => {
              void navigate({ to: "/arena" });
            }}
          />
        </>
      )}
    </AppShell>
  );
}
