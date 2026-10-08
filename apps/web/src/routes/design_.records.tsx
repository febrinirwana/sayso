import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Leaderboard } from "@/screens/leaderboard/Leaderboard";
import { Portfolio } from "@/screens/portfolio/Portfolio";
import { Results } from "@/screens/results/Results";
import type {
  LeaderboardEntry,
  PortfolioPosition,
  ResultWord,
  TranscriptEvidence,
  WordProof,
} from "@/screens/results/types";
import { AppShell } from "@/shell/AppShell";
import { play } from "@/sound";

export const Route = createFileRoute("/design_/records")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: RecordsSpecimen,
});

// Entirely invented design fixtures, not transcripts, hashes, accounts or a scheduled episode.
const NAMES = ["Pressure", "Legacy", "Fans", "Trophy", "Championship", "Extraordinary"];
const ROOT_A = "SPECIMEN · engine A commitment · not an onchain root";
const ROOT_B = "SPECIMEN · engine B commitment · not an onchain root";
function evidence(engine: "A" | "B", word: string, said: boolean): TranscriptEvidence {
  const start = engine === "A" ? 71000 : 71280;
  return {
    engine,
    index: 7,
    startMs: 70000,
    endMs: 80000,
    tokens: [
      ["There", 70000, 70400],
      ["was", 70400, 70700],
      [said ? word.toLowerCase() : "something", start, start + 480],
      ["in", start + 500, start + 650],
      ["that", start + 680, start + 820],
      ["moment.", start + 850, start + 1200],
    ],
    root: engine === "A" ? ROOT_A : ROOT_B,
    leaf: "SPECIMEN",
    proof: [],
    verifiedChunkCount: 19,
    totalChunkCount: 19,
  };
}
function proof(word: string, said: boolean): WordProof {
  return {
    engines: [evidence("A", word, said), evidence("B", word, said)],
    evidenceHash: "SPECIMEN",
    resolveTx: null,
    mode: "simulation",
    specimen: true,
  };
}
const WORDS: readonly ResultWord[] = NAMES.map((text, index) => ({
  id: String(index + 1),
  text,
  state: index % 2 === 0 ? "Yes" : "No",
  profit: [2_100_000n, 1_200_000n, 900_000n, -500_000n, 1_300_000n, 0n][index] ?? 0n,
  trades:
    index === 5
      ? []
      : [
          {
            id: `specimen-trade-${index}`,
            side: index === 3 || index % 2 === 0 ? 0 : 2,
            tokenAmount: index === 3 ? 1_000_000n : 5_000_000n,
            ausdAmount: [2_900_000n, 3_800_000n, 4_100_000n, 500_000n, 3_700_000n][index] ?? 0n,
            priceBps: [5800, 7600, 8200, 5000, 7400][index] ?? 0,
            timestamp: 0n,
            block: 0n,
          },
        ],
  proof: proof(text, index % 2 === 0),
}));
const POSITIONS: readonly PortfolioPosition[] = [
  {
    id: "p1",
    episode: { id: "42", state: "Live", label: "The one with the big finish" },
    word: { id: "1", text: "Pressure", state: "SaidPending" },
    yes: 8_000_000n,
    no: 0n,
    cashIn: 0n,
    cashOut: 4_960_000n,
    redeemed: 0n,
    averageYesPriceBps: 6200,
    averageNoPriceBps: null,
    currentYesPriceBps: 9800,
  },
  {
    id: "p2",
    episode: { id: "42", state: "Live", label: "The one with the big finish" },
    word: { id: "2", text: "Legacy", state: "Open" },
    yes: 0n,
    no: 5_000_000n,
    cashIn: 0n,
    cashOut: 2_200_000n,
    redeemed: 0n,
    averageYesPriceBps: null,
    averageNoPriceBps: 4400,
    currentYesPriceBps: 4100,
  },
  {
    id: "p3",
    episode: { id: "41", state: "Settled", label: "A very good first impression" },
    word: { id: "3", text: "Fans", state: "Yes" },
    yes: 5_000_000n,
    no: 0n,
    cashIn: 0n,
    cashOut: 2_500_000n,
    redeemed: 0n,
    averageYesPriceBps: 5000,
    averageNoPriceBps: null,
    currentYesPriceBps: 10000,
  },
  {
    id: "p4",
    episode: { id: "41", state: "Settled", label: "A very good first impression" },
    word: { id: "4", text: "Trophy", state: "No" },
    yes: 0n,
    no: 2_500_000n,
    cashIn: 0n,
    cashOut: 1_125_000n,
    redeemed: 0n,
    averageYesPriceBps: null,
    averageNoPriceBps: 4500,
    currentYesPriceBps: 0,
  },
];
const HISTORY = POSITIONS.slice(2).map((position) => ({
  ...position,
  yes: 0n,
  no: 0n,
  redeemed: position.yes + position.no,
  cashIn: position.yes + position.no,
}));
const LEADERS: readonly LeaderboardEntry[] = [
  {
    id: "l1",
    nickname: "Lucky Pixel",
    profit: 14_800_000n,
    trades: 18,
    rank: 1,
    previousRank: 3,
    avatar: "pixle",
  },
  {
    id: "l2",
    nickname: "Cosmic Duck",
    profit: 12_350_000n,
    trades: 14,
    rank: 2,
    previousRank: 1,
    avatar: "duck",
  },
  {
    id: "l3",
    nickname: "Disco Alien",
    profit: 10_600_000n,
    trades: 16,
    rank: 3,
    previousRank: 4,
    avatar: "alien",
  },
  {
    id: "l4",
    nickname: "Golden Globe",
    profit: 8_900_000n,
    trades: 12,
    rank: 4,
    previousRank: 6,
    avatar: "globe",
  },
  {
    id: "l5",
    nickname: "Bright Star",
    profit: 7_450_000n,
    trades: 10,
    rank: 5,
    previousRank: 5,
    avatar: "star",
  },
  {
    id: "l6",
    nickname: "Tiny Dino",
    profit: 6_700_000n,
    trades: 9,
    rank: 6,
    previousRank: 8,
    avatar: "dino",
  },
  {
    id: "l7",
    nickname: "Happy Ghost",
    profit: 6_150_000n,
    trades: 13,
    rank: 7,
    previousRank: 7,
    avatar: "ghost",
  },
  {
    id: "l8",
    nickname: "Bouncy Burger",
    profit: 5_300_000n,
    trades: 8,
    rank: 8,
    previousRank: null,
    avatar: "burger",
  },
];
const YOU: LeaderboardEntry = {
  id: "you",
  nickname: "Sunny Pixel",
  profit: 5_000_000n,
  trades: 7,
  rank: 9,
  previousRank: 12,
  avatar: "smiley-face",
};
const STATES: Record<string, readonly string[]> = {
  results: ["win", "loss", "settling", "sending", "redeemed", "proof", "no-proof"],
  portfolio: ["open", "history", "empty", "sending", "filled"],
  leaderboard: ["episode", "all-time"],
};

function RecordsSpecimen() {
  const query = new URLSearchParams(window.location.search);
  const [screen, setScreen] = useState(() =>
    query.get("screen") && STATES[query.get("screen") ?? ""]
      ? (query.get("screen") ?? "results")
      : "results",
  );
  const [state, setState] = useState(() => query.get("state") ?? STATES[screen]?.[0] ?? "win");
  const [redeem, setRedeem] = useState<"idle" | "sending" | "filled">("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );
  const change = (nextScreen: string, nextState: string) => {
    window.clearTimeout(timer.current);
    setScreen(nextScreen);
    setState(nextState);
    setRedeem("idle");
    window.history.replaceState(null, "", `?screen=${nextScreen}&state=${nextState}`);
    play("tap");
  };
  const redeemDemo = () => {
    setRedeem("sending");
    play("confirm");
    timer.current = window.setTimeout(() => {
      setRedeem("filled");
      play("redeem");
    }, 900);
  };
  const filled = state === "filled" || state === "redeemed" || redeem === "filled";
  const sending = state === "sending" || redeem === "sending";
  const resultState = state === "settling" ? "settling" : filled ? "redeemed" : "settled";
  const words =
    state === "settling"
      ? WORDS.map((word, index) => {
          if (index <= 1) return word;
          const { proof: _proof, ...pending } = word;
          return { ...pending, state: "Open" as const };
        })
      : state === "loss"
        ? WORDS.map((word, index) => ({
            ...word,
            state: index === 0 ? ("No" as const) : word.state,
            profit: index === 0 ? -2_500_000n : 0n,
            trades:
              index === 0
                ? [
                    {
                      id: "loss-trade",
                      side: 0 as const,
                      tokenAmount: 5_000_000n,
                      ausdAmount: 2_500_000n,
                      priceBps: 5000,
                      timestamp: 0n,
                      block: 0n,
                    },
                  ]
                : [],
            proof: proof(word.text, index !== 0 && word.state === "Yes"),
          }))
        : WORDS;
  return (
    <>
      <div className="relative z-30 flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-sun-tint px-6 py-3 text-xs">
        <div>
          <b className="tracking-widest">DEV SPECIMEN</b>
          <span className="ml-3 text-ink-soft">S5–S7 · invented data · no transactions</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="font-semibold" htmlFor="records-screen">
            Screen
          </label>
          <select
            id="records-screen"
            className="min-h-11 rounded-xl border border-ink bg-white px-3"
            value={screen}
            onChange={(event) =>
              change(event.target.value, STATES[event.target.value]?.[0] ?? "win")
            }
          >
            <option value="results">S5 Results</option>
            <option value="portfolio">S6 Portfolio</option>
            <option value="leaderboard">S7 Leaderboard</option>
          </select>
          <label className="font-semibold" htmlFor="records-state">
            State
          </label>
          <select
            id="records-state"
            className="min-h-11 rounded-xl border border-ink bg-white px-3"
            value={state}
            onChange={(event) => change(screen, event.target.value)}
          >
            {STATES[screen]?.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>
      <AppShell
        active={
          screen === "results" ? "arena" : screen === "portfolio" ? "portfolio" : "leaderboard"
        }
        balance={filled ? (screen === "results" ? 144_500_000n : 132_000_000n) : 124_500_000n}
        nickname="Sunny Pixel"
      >
        {screen === "results" ? (
          <Results
            key={`${state}-${screen}`}
            episodeId="42"
            state={resultState}
            profit={state === "loss" ? -2_500_000n : 5_000_000n}
            redeemable={filled || state === "settling" || state === "loss" ? 0n : 20_000_000n}
            words={words}
            redeemState={sending ? "sending" : "idle"}
            onRedeem={redeemDemo}
            onPlayNext={() => {
              window.location.href = "/design/player?state=arena-live";
            }}
            expandedWordId={state === "proof" ? "1" : state === "no-proof" ? "2" : undefined}
          />
        ) : screen === "portfolio" ? (
          <Portfolio
            tab={state === "history" ? "history" : "open"}
            onTabChange={(tab) => change("portfolio", tab)}
            positions={
              state === "empty"
                ? []
                : state === "history"
                  ? HISTORY
                  : filled
                    ? POSITIONS.slice(0, 2)
                    : POSITIONS
            }
            redeemable={filled ? 0n : state === "empty" ? 0n : 7_500_000n}
            redeemState={filled ? "filled" : sending ? "sending" : "idle"}
            onRedeemAll={redeemDemo}
            onPlay={() => {
              window.location.href = "/design/player?state=arena-live";
            }}
          />
        ) : (
          <Leaderboard
            tab={state === "all-time" ? "all-time" : "episode"}
            episodeId="42"
            onTabChange={(tab) => change("leaderboard", tab)}
            leaders={
              state === "all-time"
                ? LEADERS.map((entry) => ({
                    ...entry,
                    profit: entry.profit * 7n,
                    trades: entry.trades * 5,
                  }))
                : LEADERS
            }
            you={
              state === "all-time"
                ? { ...YOU, profit: YOU.profit * 7n, trades: YOU.trades * 5 }
                : YOU
            }
          />
        )}
      </AppShell>
    </>
  );
}
