import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequireAccount, useAccount } from "@/account";
import { useBalances, useLatestEpisode } from "@/data/chain";
import { useRecordLeaders } from "@/records/indexer";
import { RecordStatus } from "@/records/RecordStatus";
import { Leaderboard } from "@/screens/leaderboard/Leaderboard";
import { AppShell } from "@/shell/AppShell";

export const Route = createFileRoute("/leaderboard")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab: "episode" | "all-time"; episode?: number } => ({
    tab: search.tab === "episode" ? "episode" : "all-time",
    ...(Number.isSafeInteger(Number(search.episode)) && Number(search.episode) > 0
      ? { episode: Number(search.episode) }
      : {}),
  }),
  component: () => (
    <RequireAccount>
      <LeaderboardPage />
    </RequireAccount>
  ),
});
function LeaderboardPage() {
  const search = Route.useSearch();
  const account = useAccount();
  const navigate = useNavigate();
  const balances = useBalances(account.address);
  const latest = useLatestEpisode();
  const episodeId = search.episode ?? latest.data?.episode?.id;
  const leaders = useRecordLeaders(search.tab, episodeId);
  const rows = leaders.data ?? [];
  return (
    <AppShell
      active="leaderboard"
      balance={balances.data?.ausd ?? null}
      nickname={account.nickname ?? ""}
    >
      {leaders.isError ? (
        <RecordStatus message="Leaderboard unavailable. Envio is offline; ranks cannot be reconstructed from a balance." />
      ) : leaders.isPending ? (
        <RecordStatus message="Loading the Envio standings…" />
      ) : (
        <>
          {search.tab === "episode" && rows.some((row) => row.rank === 0) && (
            <RecordStatus message="Episode ranks are pending settlement. A dash means this episode is not final yet." />
          )}
          <Leaderboard
            tab={search.tab}
            episodeId={episodeId?.toString() ?? "—"}
            onTabChange={(tab) => {
              void navigate({ to: "/leaderboard", search: { ...search, tab } });
            }}
            leaders={rows.slice(0, 50)}
            you={rows.find((row) => row.id === account.address?.toLowerCase()) ?? null}
          />
          {!rows.some((row) => row.id === account.address?.toLowerCase()) && (
            <p className="mt-5 text-sm text-ink-soft">
              You have no indexed calls in this period yet.
            </p>
          )}
        </>
      )}
    </AppShell>
  );
}
