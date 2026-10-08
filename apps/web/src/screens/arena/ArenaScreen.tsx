import {
  ArrowRight,
  Check,
  Clock3,
  Coins,
  Gamepad2,
  LoaderCircle,
  Play,
  Sparkles,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/ui/Button";
import { CreditFooter, PageHeading, TokenAmount } from "@/ui/PlayerPrimitives";
import { Voxel } from "@/ui/Voxel";

/** Public studio schedule payload. Title is display copy, never the hidden clip title. */
export type ArenaSchedule = {
  episodeId: number;
  startsAtMs: number;
  endsAtMs: number;
  state: "Scheduled" | "Live";
  words: readonly { wordId?: number; text: string }[];
};
export type ArenaEpisode =
  | { status: "idle" | "starting" }
  | { status: "queued"; episodeId: number }
  | { status: "scheduled" | "live"; schedule: ArenaSchedule; title: string };
export type StarterBalance =
  | { status: "claiming" | "already-claimed" }
  | { status: "received"; amounts: { monWei: string; ausd: string } };
export type RecentArenaEpisode = {
  episodeId: number;
  title: string;
  saidWords: readonly string[];
  settledAt: number;
};
export type ArenaScreenProps = {
  nickname: string;
  episode: ArenaEpisode;
  starter: StarterBalance;
  recentEpisodes: readonly RecentArenaEpisode[];
  nowMs: number;
  firstTime: boolean;
  onStart(): void;
  onJoin(episodeId: number): void;
  onResults(episodeId: number): void;
};
export function ArenaScreen({
  nickname,
  episode,
  starter,
  recentEpisodes,
  nowMs,
  firstTime,
  onStart,
  onJoin,
  onResults,
}: ArenaScreenProps) {
  const reduced = useReducedMotion();
  const scheduled = episode.status === "scheduled" || episode.status === "live";
  const live = episode.status === "live";
  const pending = episode.status === "starting" || episode.status === "queued";
  const seconds = scheduled
    ? Math.max(
        0,
        Math.ceil(
          ((live ? episode.schedule.endsAtMs : episode.schedule.startsAtMs) - nowMs) / 1000,
        ),
      )
    : 0;
  const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <>
      <PageHeading
        eyebrow="S2 · Replay Arena"
        title={`Hey, ${nickname.split(" ")[0]}. Good to see you.`}
        description="Six words. One clip. Go with your gut."
      />
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.9fr)_minmax(300px,1fr)]">
        <section className="relative isolate overflow-hidden rounded-[32px] border-2 border-ink bg-sky-tint p-6 shadow-sticker-lg md:p-9 lg:min-h-[400px]">
          <div className="relative z-10 max-w-xl">
            <div className="mb-7 flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex items-center gap-2 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-bold ${live ? "bg-said text-ink" : "bg-card"}`}
              >
                {live ? (
                  <>
                    <span className="size-2 rounded-full bg-ink" />
                    LIVE
                  </>
                ) : pending ? (
                  "GETTING READY"
                ) : scheduled ? (
                  "UP NEXT"
                ) : (
                  "THE STAGE IS YOURS"
                )}
              </span>
              {scheduled && (
                <span className="text-xs font-semibold text-ink-soft">
                  Episode #{episode.schedule.episodeId}
                </span>
              )}
            </div>
            <h2 className="max-w-[480px] font-headline text-[clamp(36px,4vw,58px)] leading-[1.08]">
              {scheduled
                ? episode.title
                : pending
                  ? "A fresh round is on its way."
                  : "Your next good call starts here."}
            </h2>
            <p className="mt-4 max-w-[390px] text-base leading-relaxed text-ink-soft">
              {live
                ? "The clip is rolling. Pick your words and catch the next SAID."
                : scheduled
                  ? "The words are ready. Get in before the first one drops."
                  : pending
                    ? "We’re preparing six word cards. Your episode will appear here when it’s ready."
                    : "No need to wait for a crowd. Start a round and make the first prediction."}
            </p>
            {scheduled ? (
              <div className="mt-7 flex flex-wrap items-center gap-5">
                <Button size="lg" onClick={() => onJoin(episode.schedule.episodeId)}>
                  <Play size={19} aria-hidden />
                  {live ? "Join now" : "Get ready"}
                  <ArrowRight size={18} aria-hidden />
                </Button>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                    {live ? "Clip ends in" : "Starts in"}
                  </span>
                  <p className="font-headline tabular text-3xl">{countdown}</p>
                </div>
              </div>
            ) : (
              <Button size="lg" className="mt-7" disabled={pending} onClick={onStart}>
                {pending ? (
                  <LoaderCircle size={20} aria-hidden className="motion-safe:animate-spin" />
                ) : (
                  <Gamepad2 size={20} aria-hidden />
                )}
                {episode.status === "starting"
                  ? "Setting the stage"
                  : episode.status === "queued"
                    ? `Episode #${episode.episodeId} queued`
                    : "Start an episode"}
              </Button>
            )}
          </div>
          <Voxel
            name="music-blue"
            size={240}
            className="absolute -right-8 bottom-0 -z-10 w-48 opacity-20 md:right-3 md:w-64 md:opacity-30 2xl:right-8 2xl:opacity-100"
          />
          <Voxel
            name="star"
            size={90}
            className="absolute top-7 right-5 -z-10 hidden rotate-12 md:block"
          />
          {scheduled && (
            <div className="relative z-10 mt-7 flex flex-wrap gap-2 border-t border-ink/15 pt-5">
              {episode.schedule.words.map(({ text }) => (
                <span
                  key={text}
                  className="rounded-full border border-ink/25 bg-card/80 px-3 py-1.5 font-headline text-xs"
                >
                  {text}
                </span>
              ))}
            </div>
          )}
        </section>
        <aside
          className="relative overflow-hidden rounded-[32px] border-2 border-ink bg-mint-tint p-6 shadow-sticker md:p-8"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="rounded-full border-2 border-ink bg-card px-3 py-1.5 text-xs font-bold">
              YOUR STARTER KIT
            </span>
            <Coins size={24} aria-hidden />
          </div>
          <div className="relative mt-4 flex h-24 items-center justify-center">
            <motion.div
              initial={
                reduced || starter.status !== "received"
                  ? false
                  : { transform: "translateY(-24px) rotate(-12deg)", opacity: 0 }
              }
              animate={{ transform: "translateY(0px) rotate(0deg)", opacity: 1 }}
              transition={{ type: "spring", duration: 0.6, bounce: 0.2 }}
            >
              <Voxel name="money-2" size={126} />
            </motion.div>
          </div>
          <h2 className="mt-4 font-headline text-2xl">
            {starter.status === "claiming"
              ? "A little fuel for your first round."
              : starter.status === "received"
                ? "You’re ready to play."
                : "Starter kit claimed."}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            {starter.status === "claiming"
              ? "Your MON and AUSD are on the way. Both need to arrive before your kit is ready."
              : starter.status === "received"
                ? "MON keeps your moves running. AUSD is for your predictions. All test tokens, no real money."
                : "Your one-time test tokens are already in your account. Make them count."}
          </p>
          {starter.status === "received" ? (
            <div className="mt-5 space-y-2 rounded-2xl border border-ink/20 bg-card p-4 text-sm font-bold">
              <p className="flex items-center gap-2">
                <Check size={18} className="text-gain" aria-hidden />
                <TokenAmount amount={BigInt(starter.amounts.monWei)} symbol="MON" />
              </p>
              <p className="flex items-center gap-2">
                <Check size={18} className="text-gain" aria-hidden />
                <TokenAmount amount={BigInt(starter.amounts.ausd)} symbol="AUSD" />
              </p>
            </div>
          ) : (
            <p className="mt-5 flex items-center gap-2 text-xs font-semibold">
              {starter.status === "claiming" ? (
                <LoaderCircle size={17} className="motion-safe:animate-spin" aria-hidden />
              ) : (
                <Check size={17} aria-hidden />
              )}
              {starter.status === "claiming"
                ? "Claiming starter balance · TESTNET"
                : "Already claimed · TESTNET"}
            </p>
          )}
        </aside>
      </div>
      {firstTime && (
        <section className="mt-8 rounded-3xl border-2 border-ink bg-sun-tint p-5 md:flex md:items-center md:gap-6 md:p-6">
          <div className="mb-4 flex shrink-0 items-center gap-2 md:mb-0">
            <Sparkles size={20} aria-hidden />
            <h2 className="font-headline text-lg">Your first round?</h2>
          </div>
          <ol className="grid gap-4 md:flex md:flex-1 md:justify-between">
            {["Pick a word", "Watch it flip SAID", "Cash out or hold"].map((step, index) => (
              <li key={step} className="flex items-center gap-3 text-sm font-semibold">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-card font-headline">
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="mt-10">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="font-headline text-2xl md:text-3xl">Last on the show</h2>
          <span className="flex items-center gap-1.5 text-xs text-ink-soft">
            <Clock3 size={15} aria-hidden />
            Settled rounds
          </span>
        </div>
        {recentEpisodes.length ? (
          <div className="grid gap-5 md:grid-cols-3">
            {recentEpisodes.map((recent, index) => (
              <button
                type="button"
                key={recent.episodeId}
                onClick={() => onResults(recent.episodeId)}
                className="sticker pressable min-w-0 p-5 text-left"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-soft">
                    EPISODE #{recent.episodeId}
                  </span>
                  <ArrowRight size={19} aria-hidden />
                </div>
                <h3 className="font-headline text-xl">{recent.title}</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {recent.saidWords.map((word) => (
                    <span
                      key={word}
                      className={`rounded-full border border-ink px-2.5 py-1 text-xs font-semibold ${index === 1 ? "bg-bubble-tint" : "bg-mint-tint"}`}
                    >
                      {word} <span className="text-[9px]">SAID</span>
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs text-ink-soft">See the words. Check the proof.</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed border-ink/25 p-7 text-center text-ink-soft">
            No settled rounds yet. Yours could be the first.
          </div>
        )}
      </section>
      <CreditFooter />
    </>
  );
}
