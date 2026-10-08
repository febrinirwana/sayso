import { PRICE_PRECISION } from "@sayso/core";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAccount, useAccount } from "@/account";
import { readBestBidAsk, useBalances, useLatestEpisode } from "@/data/chain";
import { usePlayerPositions } from "@/data/indexer";
import { averagePrice, redeemableAmount } from "@/records/adapters";
import { usePortfolioHoldings, useRedeem } from "@/records/hooks";
import { useRecordTrades } from "@/records/indexer";
import { RecordStatus, RedeemReceipts } from "@/records/RecordStatus";
import { Portfolio } from "@/screens/portfolio/Portfolio";
import type { PortfolioPosition } from "@/screens/results/types";
import { AppShell } from "@/shell/AppShell";

export const Route = createFileRoute("/portfolio")({
  validateSearch: (search: Record<string, unknown>): { tab: "open" | "history" } => ({
    tab: search.tab === "history" ? "history" : "open",
  }),
  component: () => (
    <RequireAccount>
      <PortfolioPage />
    </RequireAccount>
  ),
});
function PortfolioPage() {
  const { tab } = Route.useSearch();
  const account = useAccount();
  const navigate = useNavigate();
  const balances = useBalances(account.address);
  const indexed = usePlayerPositions(account.address);
  const trades = useRecordTrades(account.address);
  const holdings = usePortfolioHoldings(account.address);
  const latest = useLatestEpisode();
  const redemption = useRedeem();
  const quotes = useQuery({
    queryKey: [
      "records",
      "portfolio-quotes",
      account.address,
      holdings.data
        ?.filter((row) => row.yes > 0n || row.no > 0n)
        .map((row) => row.word.id.toString())
        .join(","),
    ],
    enabled: !!holdings.data,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async () => {
      const prices: Record<string, number | null> = {};
      for (const row of holdings.data ?? []) {
        if (
          !row.word.market ||
          (row.yes === 0n && row.no === 0n) ||
          (row.word.state !== "Open" && row.word.state !== "SaidPending")
        )
          continue;
        const book = await readBestBidAsk(row.word.market);
        prices[row.word.id.toString()] =
          book.bidRaw > 0n && book.bidRaw < BigInt(PRICE_PRECISION) ? Number(book.bidRaw) : null;
      }
      return prices;
    },
  });
  const positions: PortfolioPosition[] = (holdings.data ?? []).flatMap((row) => {
    const position = indexed.data?.find((entry) => entry.word.id === row.word.id);
    const unresolved = row.word.state === "Open" || row.word.state === "SaidPending";
    if (
      tab === "open"
        ? !unresolved || (row.yes === 0n && row.no === 0n)
        : (unresolved && (row.yes > 0n || row.no > 0n)) ||
          (!position && row.yes === 0n && row.no === 0n)
    )
      return [];
    const fills = (trades.data ?? []).filter((trade) => trade.word.id === row.word.id);
    return [
      {
        id: row.word.id.toString(),
        episode: {
          id: row.episode.id.toString(),
          state: row.episode.state,
          label: `Episode ${row.episode.id} · word calls`,
        },
        word: { id: row.word.id.toString(), text: row.word.text, state: row.word.state },
        yes: row.yes,
        no: row.no,
        cashIn: position?.cashIn ?? 0n,
        cashOut: position?.cashOut ?? 0n,
        redeemed: position?.redeemed ?? 0n,
        averageYesPriceBps: averagePrice(fills, 0),
        averageNoPriceBps: averagePrice(fills, 2),
        currentYesPriceBps: quotes.isError ? null : (quotes.data?.[row.word.id.toString()] ?? null),
      },
    ];
  });
  const redeemable = (holdings.data ?? []).reduce(
    (sum, row) => sum + redeemableAmount(row.word.state, row.yes, row.no),
    0n,
  );
  return (
    <AppShell
      active="portfolio"
      balance={balances.data?.ausd ?? null}
      nickname={account.nickname ?? ""}
    >
      {(indexed.isError || trades.isError) && (
        <RecordStatus message="Envio is unavailable. Chain balances and outcomes are shown; indexed history and average prices may be unavailable." />
      )}
      {!holdings.data || holdings.isError ? (
        <RecordStatus
          message={
            holdings.isError
              ? "Position balances unavailable. Monad testnet could not provide a complete snapshot."
              : "Reading your word balances from Monad testnet…"
          }
        />
      ) : (
        <>
          <RedeemReceipts redemption={redemption} />
          <Portfolio
            tab={tab}
            onTabChange={(next) => {
              void navigate({ to: "/portfolio", search: { tab: next } });
            }}
            positions={positions}
            redeemable={redeemable}
            redeemState={
              redemption.state === "sending"
                ? "sending"
                : redemption.state === "redeemed" && redeemable === 0n
                  ? "filled"
                  : "idle"
            }
            onRedeemAll={() => {
              void redemption.redeem(holdings.data ?? []);
            }}
            onPlay={() => {
              const id = latest.data?.episode?.id;
              void navigate(
                id ? { to: "/episode/$id", params: { id: String(id) } } : { to: "/arena" },
              );
            }}
            onPlayEpisode={(id) => {
              void navigate({ to: "/episode/$id", params: { id } });
            }}
            historyUnavailable={indexed.isError}
          />
        </>
      )}
    </AppShell>
  );
}
