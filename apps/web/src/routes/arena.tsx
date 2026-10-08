import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RequireAccount, useAccount } from "@/account";
import { useBalances, useChainEpisode, useLatestEpisode } from "@/data/chain";
import { useIndexedEpisode, useRecentEpisodes } from "@/data/indexer";
import {
  claimDrip,
  getDripStatus,
  getHealth,
  requestEpisode,
  subscribeEpisode,
  useStudioClock,
} from "@/data/studio";
import { type ArenaEpisode, ArenaScreen, type StarterBalance } from "@/screens/arena/ArenaScreen";
import { AppShell } from "@/shell/AppShell";

export const Route = createFileRoute("/arena")({ component: ArenaRoute });
function ArenaRoute() {
  return (
    <RequireAccount>
      <Arena />
    </RequireAccount>
  );
}
function Arena() {
  const account = useAccount();
  const navigate = useNavigate();
  const client = useQueryClient();
  const balances = useBalances(account.address);
  const latest = useLatestEpisode();
  const start = useMutation({
    mutationFn: requestEpisode,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["chain", "latest-episode"] });
    },
  });
  const requestedId = start.data?.status === "created" ? start.data.episodeId : undefined;
  const requested = useChainEpisode(requestedId);
  const chainEpisode =
    requested.data && (!latest.data?.episode || requested.data.id >= latest.data.episode.id)
      ? requested.data
      : latest.data?.episode;
  const episodeId = chainEpisode?.id;
  const indexed = useIndexedEpisode(chainEpisode?.id);
  const recent = useRecentEpisodes(12);
  const clock = useStudioClock();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, []);
  const health = useQuery({
    queryKey: ["studio", "health"],
    queryFn: getHealth,
    retry: false,
    refetchInterval: 15_000,
  });
  const dripKey = ["studio", "drip", account.address] as const;
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null);
  const drip = useQuery({
    queryKey: dripKey,
    queryFn: () => getDripStatus(account.address as NonNullable<typeof account.address>),
    enabled: !!account.address,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" &&
      (pendingStartedAt === null || Date.now() - pendingStartedAt < 60_000)
        ? 5_000
        : false,
  });
  useEffect(() => {
    setPendingStartedAt((startedAt) =>
      drip.data?.status === "pending" ? (startedAt ?? Date.now()) : null,
    );
  }, [drip.data?.status]);
  const claim = useMutation({
    mutationFn: claimDrip,
    onSuccess: (result) => {
      client.setQueryData(dripKey, result);
      void client.invalidateQueries({
        queryKey: ["chain", "balances", account.address?.toLowerCase()],
      });
    },
    onError: () => {
      client.setQueryData(dripKey, { status: "unavailable", reason: "offline" });
    },
  });
  const autoClaimed = useRef<string | null>(null);
  useEffect(() => {
    if (
      account.address &&
      drip.data?.status === "unclaimed" &&
      autoClaimed.current !== account.address
    ) {
      autoClaimed.current = account.address;
      claim.mutate(account.address);
    }
  }, [account.address, drip.data?.status, claim.mutate]);
  useEffect(() => {
    if (episodeId === undefined) return;
    return subscribeEpisode(episodeId, {
      // Studio echoes prompt a canonical read, never overwrite onchain lifecycle or word state.
      schedule: () => {
        void client.invalidateQueries({ queryKey: ["chain", "latest-episode"] });
      },
      state: () => {
        void client.invalidateQueries({ queryKey: ["chain", "latest-episode"] });
        void client.invalidateQueries({ queryKey: ["chain", "episode", episodeId] });
      },
      flag: () => {
        void client.invalidateQueries({ queryKey: ["chain", "episode", episodeId] });
      },
    });
  }, [episodeId, client]);
  const nowMs = clock.now();
  let episode: ArenaEpisode = { status: "idle" };
  const playable =
    chainEpisode &&
    !chainEpisode.closed &&
    chainEpisode.resolvedCount < chainEpisode.wordCount &&
    chainEpisode.listed &&
    chainEpisode.blockTimestamp < chainEpisode.endsAt;
  if (playable) {
    const live =
      nowMs === null
        ? chainEpisode.state === "Live"
        : nowMs >= Number(chainEpisode.startsAt) * 1000;
    episode = {
      status: live ? "live" : "scheduled",
      title: `Episode #${chainEpisode.id}. Six words. Your call.`,
      schedule: {
        episodeId: chainEpisode.id,
        startsAtMs: Number(chainEpisode.startsAt) * 1000,
        endsAtMs: Number(chainEpisode.endsAt) * 1000,
        state: live ? "Live" : "Scheduled",
        words: chainEpisode.words.map((word) => ({
          text: indexed.data?.words.find((item) => item.id === word.id)?.text ?? word.text,
        })),
      },
    };
  } else if (start.isPending) episode = { status: "starting" };
  else if (
    requestedId &&
    !requested.isError &&
    (!requested.data?.listed || requested.data.blockTimestamp < requested.data.startsAt)
  )
    episode = { status: "queued", episodeId: requestedId };
  let starter: StarterBalance = { status: "checking" };
  const result = drip.data ?? claim.data;
  if (claim.isPending) starter = { status: "claiming" };
  else if (result?.status === "pending") {
    starter =
      pendingStartedAt !== null && Date.now() - pendingStartedAt >= 60_000
        ? {
            status: "unavailable",
            message:
              "Your starter kit is still confirming. We’ve paused automatic checks; check again for the transfer status.",
          }
        : { status: "claiming" };
  } else if (result?.status === "completed")
    starter = { status: "received", amounts: result.drip.amounts };
  else if (result?.status === "already-claimed") starter = { status: "already-claimed" };
  else if (claim.isError || drip.isError || (result && result.status !== "unclaimed"))
    starter = {
      status: "unavailable",
      message:
        result?.status === "rate-limited"
          ? "The starter kit is rate-limited. Try again later; no tokens have been promised."
          : "The studio is unavailable. Your starter kit has not been confirmed. Check again when it reconnects.",
    };
  else if (result?.status === "unclaimed") starter = { status: "unclaimed" };
  const offline = health.isError || clock.isError;
  const messages: string[] = [];
  if (offline)
    messages.push(
      "Studio offline. Starting rounds and clock sync are unavailable; chain reads still work.",
    );
  else if (health.isPending) messages.push("Connecting to the studio…");
  else if (health.data?.status === "degraded")
    messages.push("Studio health is degraded. Starting a round may be unavailable.");
  if (latest.isError || requested.isError)
    messages.push("Could not refresh the chain. No new round is confirmed.");
  else if (latest.isPending) messages.push("Checking the latest round onchain…");
  if (start.isError || start.data?.status === "unavailable")
    messages.push("The studio could not start a round. Try again when it is available.");
  else if (start.data?.status === "busy")
    messages.push("A round is already being prepared. Checking the chain for it.");
  else if (start.data?.status === "rate-limited")
    messages.push("You’ve started a round recently. Try again later.");
  const recentEpisodes = (recent.data ?? [])
    .filter((item) => item.state === "Settled")
    .slice(0, 3)
    .map((item) => ({
      episodeId: item.id,
      title: `Episode #${item.id}`,
      saidWords: item.words.filter((word) => word.outcome === 2).map((word) => word.text),
      settledAt: Number(item.settledAt ?? item.endsAt) * 1000,
    }));
  return (
    <AppShell
      active="arena"
      nickname={account.nickname ?? ""}
      balance={balances.data?.ausd ?? null}
    >
      <ArenaScreen
        nickname={account.nickname ?? ""}
        episode={episode}
        starter={starter}
        recentEpisodes={recentEpisodes}
        nowMs={nowMs}
        firstTime={result?.status === "unclaimed" || claim.isPending}
        startDisabled={
          offline ||
          health.data?.chain === null ||
          health.isPending ||
          latest.isPending ||
          latest.isError
        }
        statusMessage={messages.join(" ")}
        recentMessage={
          recent.isError
            ? "Past rounds are unavailable while the indexer is offline. Live rounds still come from the chain."
            : recent.isPending
              ? "Loading past rounds from the indexer…"
              : "No settled rounds yet. Yours could be the first."
        }
        onStart={() => start.mutate()}
        onJoin={(id) => {
          void navigate({ to: `/episode/${id}` as string });
        }}
        onResults={(id) => {
          void navigate({ to: `/results/${id}` as string });
        }}
        onClaimStarter={() => {
          claim.reset();
          setPendingStartedAt(Date.now());
          void drip.refetch().then(({ data }) => {
            if (account.address && data?.status === "unclaimed") claim.mutate(account.address);
          });
        }}
      />
    </AppShell>
  );
}
