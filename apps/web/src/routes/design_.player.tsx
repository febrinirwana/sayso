import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AccountScreen } from "@/screens/account/AccountScreen";
import { ArenaScreen } from "@/screens/arena/ArenaScreen";
import { JoinScreen } from "@/screens/join/JoinScreen";
import {
  ARENA_STATES,
  JOIN_STATES,
  PLAYER_ADDRESS,
  PLAYER_BALANCES,
  PLAYER_NICKNAME,
  PLAYER_SPECIMENS,
  RECENT_EPISODES,
  SPECIMEN_NOW,
  STARTER_STATES,
} from "@/screens/join/playerFixtures";
import { AppShell } from "@/shell/AppShell";
import { play } from "@/sound";

export const Route = createFileRoute("/design_/player")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: PlayerSpecimen,
});

function PlayerSpecimen() {
  const [selected, setSelected] = useState(
    () => new URLSearchParams(window.location.search).get("state") ?? "join-idle",
  );
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function choose(state: string) {
    window.clearTimeout(timer.current);
    setSelected(state);
    window.history.replaceState(null, "", `?state=${state}`);
  }
  function join() {
    choose("join-waiting");
    timer.current = window.setTimeout(() => {
      choose("join-creating");
      timer.current = window.setTimeout(() => choose("arena-received"), 1100);
    }, 1300);
  }
  function start() {
    choose("arena-starting");
    timer.current = window.setTimeout(() => {
      choose("arena-queued");
      timer.current = window.setTimeout(() => choose("arena-next"), 1000);
    }, 1000);
  }
  const joinState = JOIN_STATES[selected];
  const isAccount = selected.startsWith("account");
  const content = joinState ? (
    <JoinScreen
      state={joinState}
      currentUrl={window.location.href}
      onJoin={join}
      onSignIn={join}
      onRetry={() => (joinState.status === "error" ? join() : choose("join-idle"))}
    />
  ) : (
    <AppShell
      active={isAccount ? "account" : "arena"}
      balance={PLAYER_BALANCES.ausd}
      nickname={PLAYER_NICKNAME}
    >
      {isAccount ? (
        <AccountScreen
          address={PLAYER_ADDRESS}
          balances={PLAYER_BALANCES}
          copyState={
            selected === "account-copied"
              ? "copied"
              : selected === "account-copy-error"
                ? "error"
                : "idle"
          }
          restoreState={
            selected === "account-restore"
              ? "instructions"
              : selected === "account-verified"
                ? "verified"
                : "idle"
          }
          onCopy={async (address) => {
            try {
              await navigator.clipboard.writeText(address);
              choose("account-copied");
            } catch {
              choose("account-copy-error");
            }
          }}
          onRestoreCheck={() => choose("account-restore")}
          onSignOut={() => {
            choose("join-idle");
          }}
        />
      ) : (
        <ArenaScreen
          nickname={PLAYER_NICKNAME}
          nowMs={SPECIMEN_NOW}
          episode={ARENA_STATES[selected] ?? { status: "idle" }}
          starter={STARTER_STATES[selected] ?? { status: "already-claimed" }}
          recentEpisodes={selected === "arena-empty" ? [] : RECENT_EPISODES}
          firstTime={selected !== "arena-claimed"}
          onStart={start}
          onJoin={() => {
            play("start");
            window.location.assign("/design");
          }}
          onResults={() => window.location.assign("/design/records")}
        />
      )}
    </AppShell>
  );
  return (
    <>
      <div className="relative z-50 flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-sun-tint px-6 py-3 text-xs md:px-8 lg:px-12">
        <div className="flex flex-wrap items-center gap-3">
          <strong className="tracking-wider">DEV SPECIMEN</strong>
          <span>Fixture data · not connected</span>
        </div>
        <label className="flex items-center gap-2 font-semibold" htmlFor="player-state">
          Screen / state
          <select
            id="player-state"
            value={selected}
            onChange={(event) => choose(event.target.value)}
            className="min-h-11 max-w-[240px] rounded-xl border-2 border-ink bg-card px-3 text-xs"
          >
            {PLAYER_SPECIMENS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {content}
    </>
  );
}
