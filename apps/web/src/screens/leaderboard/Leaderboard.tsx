import { Medal, Trophy } from "lucide-react";
import { Voxel } from "@/ui/Voxel";
import { Money, RankChange, RecordHeading, RecordTabs } from "../results/RecordUi";
import type { LeaderboardEntry } from "../results/types";

export type LeaderboardProps = {
  tab: "episode" | "all-time";
  episodeId: string;
  onTabChange: (tab: "episode" | "all-time") => void;
  leaders: readonly LeaderboardEntry[];
  you: LeaderboardEntry | null;
};
export function Leaderboard({ tab, episodeId, onTabChange, leaders, you }: LeaderboardProps) {
  const podium = leaders
    .filter((entry) => entry.rank > 0 && entry.rank <= 3)
    .sort((a, b) => a.rank - b.rank);
  return (
    <div className="pb-6">
      <RecordHeading
        eyebrow="The good-call club"
        title="Big ears. Bigger calls."
        description="A little friendly competition. A lot of very good listening."
      >
        <RecordTabs
          label="Leaderboard period"
          value={tab}
          onChange={onTabChange}
          items={[
            { id: "episode", label: "Episode" },
            { id: "all-time", label: "All-time" },
          ]}
        />
      </RecordHeading>
      <div className="mb-7 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-ink bg-sun-tint px-3 py-2 text-xs font-bold">
          {tab === "episode" ? `EPISODE ${episodeId}` : "ALL EPISODES"}
        </span>
        <p className="text-xs text-ink-soft">Ranked by settled profit · never by an open price.</p>
      </div>
      {you && (
        <section
          aria-label="Your place"
          className="sticky top-4 z-20 mb-7 rounded-2xl border-2 border-ink bg-sky-tint shadow-sticker"
        >
          <div className="border-b border-ink/15 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
            Your place · {tab === "episode" ? `episode ${episodeId}` : "all-time"}
          </div>
          <LeaderRow entry={you} isYou />
        </section>
      )}
      <div className="grid gap-7 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="relative flex flex-col overflow-hidden rounded-[32px] border-2 border-ink bg-sun-tint p-5 shadow-sticker-lg sm:p-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold tracking-widest uppercase text-ink-soft">
                The podium
              </p>
              <h2 className="mt-2 font-headline text-3xl">They called it.</h2>
            </div>
            <Trophy size={30} />
          </div>
          <div className="mt-8 grid flex-1 grid-cols-3 items-end gap-2 sm:gap-4">
            {[2, 1, 3].map((rank) => {
              const entry = podium.find((row) => row.rank === rank);
              return entry ? (
                <div key={rank} className="min-w-0 text-center">
                  <div className="relative mx-auto flex h-28 items-end justify-center sm:h-36">
                    <Voxel
                      name={entry.avatar}
                      size={rank === 1 ? 128 : 100}
                      className="max-w-full object-contain"
                    />
                    <span
                      className={`absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink ${rank === 1 ? "bg-sun" : rank === 2 ? "bg-sky-tint" : "bg-bubble-tint"}`}
                    >
                      <Medal size={18} />
                    </span>
                  </div>
                  <p className="mt-3 min-h-10 break-words font-headline text-sm leading-tight sm:text-base">
                    {entry.nickname}
                  </p>
                  <Money
                    value={entry.profit}
                    signed
                    className="block text-[13px] font-bold text-gain sm:text-base [&>span:last-child]:block [&>span:last-child]:ml-0 [&>span:nth-child(2)]:text-[9px]"
                  />
                  <div
                    className={`mt-4 flex items-start justify-center rounded-t-2xl border-2 border-b-0 border-ink pt-5 font-headline text-4xl ${rank === 1 ? "h-32 bg-sun" : rank === 2 ? "h-24 bg-sky-tint" : "h-20 bg-bubble-tint"}`}
                  >
                    {rank}
                  </div>
                </div>
              ) : (
                <div
                  key={rank}
                  className="flex h-48 items-center justify-center text-sm text-ink-soft"
                >
                  Unclaimed
                </div>
              );
            })}
          </div>
          <p className="border-t-2 border-ink pt-5 text-center text-xs font-medium text-ink-soft">
            Practice tokens. Bragging rights included.
          </p>
        </section>
        <section className="min-w-0 overflow-hidden rounded-3xl border-2 border-ink bg-card shadow-sticker">
          <header className="flex items-center justify-between gap-2 px-5 py-6 sm:px-7">
            <h2 className="font-headline text-2xl">The standings</h2>
            <span className="text-xs text-ink-soft">{leaders.length} players</span>
          </header>
          <div className="grid grid-cols-[38px_minmax(0,1fr)_auto] gap-2 border-y border-line bg-paper px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-ink-soft sm:grid-cols-[40px_minmax(0,1fr)_120px_48px_40px] sm:px-6">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">Profit</span>
            <span className="hidden text-right sm:block">Trades</span>
            <span className="hidden text-right sm:block">Move</span>
          </div>
          <ol className="divide-y divide-line">
            {leaders.map((entry) => (
              <li key={entry.id}>
                <LeaderRow entry={entry} isYou={entry.id === you?.id} />
              </li>
            ))}
          </ol>
          {leaders.length === 0 && (
            <p className="px-6 py-12 text-sm text-ink-soft">
              The first settled episode starts the standings.
            </p>
          )}
        </section>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-ink-soft">
        Profit includes completed trades and final winning shares, whether redeemed or not. No real
        money. TESTNET only.
      </p>
    </div>
  );
}
function LeaderRow({ entry, isYou }: { entry: LeaderboardEntry; isYou: boolean }) {
  return (
    <div
      className={`grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 px-4 py-4 sm:grid-cols-[40px_minmax(0,1fr)_120px_48px_40px] sm:px-6 ${isYou ? "bg-sky-tint/50" : ""}`}
    >
      <span className="font-headline text-lg tabular">
        {entry.rank === 0 ? "—" : entry.rank.toString().padStart(2, "0")}
      </span>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Voxel name={entry.avatar} size={36} className="shrink-0 rounded-lg bg-paper p-1" />
        <div className="min-w-0">
          <span className="block break-words text-sm font-semibold leading-snug">
            {entry.nickname}
            {isYou && <span className="ml-1 text-[10px] font-bold text-sky">YOU</span>}
          </span>
          <span className="mt-1 flex items-center gap-2 text-[10px] text-ink-soft sm:hidden">
            {entry.trades} trades <RankChange rank={entry.rank} previousRank={entry.previousRank} />
          </span>
        </div>
      </div>
      <Money
        value={entry.profit}
        signed
        className={`text-right text-sm font-bold ${entry.profit > 0n ? "text-gain" : "text-ink"} [&>span:last-child]:block [&>span:last-child]:ml-0 [&>span:nth-child(2)]:text-[9px]`}
      />
      <span className="hidden text-right text-sm tabular sm:block">{entry.trades}</span>
      <span className="hidden text-right sm:block">
        <RankChange rank={entry.rank} previousRank={entry.previousRank} />
      </span>
    </div>
  );
}
