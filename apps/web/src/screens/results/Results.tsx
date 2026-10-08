import { ArrowRight, CheckCircle2, Coins, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { play } from "@/sound";
import { Button } from "@/ui/Button";
import { Voxel } from "@/ui/Voxel";
import { Money, Spinner } from "./RecordUi";
import type { ResultWord } from "./types";
import { WordResult } from "./WordResult";

export type ResultsProps = {
  episodeId: string;
  state: "settling" | "settled" | "redeemed";
  profit: bigint;
  redeemable: bigint;
  words: readonly ResultWord[];
  redeemState?: "idle" | "sending";
  onRedeem: () => void;
  onPlayNext: () => void;
  /** Used by the proof specimen, not required by real callers. */
  expandedWordId?: string | undefined;
};

export function Results({
  episodeId,
  state,
  profit,
  redeemable,
  words,
  redeemState = "idle",
  onRedeem,
  onPlayNext,
  expandedWordId,
}: ResultsProps) {
  const reduce = useReducedMotion();
  const sounded = useRef<string | null>(null);
  useEffect(() => {
    if (state === "settling" || sounded.current === episodeId) return;
    sounded.current = episodeId;
    play(profit > 0n ? "win" : "lose");
  }, [episodeId, state, profit]);
  const winning = profit > 0n;
  const pending = words.filter(
    (word) => word.state === "Open" || word.state === "SaidPending",
  ).length;
  return (
    <div className="pb-6">
      <p className="mb-5 text-xs font-bold tracking-[0.16em] uppercase text-ink-soft">
        Episode {episodeId} / the wrap-up
      </p>
      <section
        className={`relative isolate mb-10 overflow-hidden rounded-[32px] border-2 border-ink shadow-sticker-lg ${state === "settling" ? "bg-sky-tint" : winning ? "bg-mint-tint" : "bg-sun-tint"}`}
      >
        <Voxel
          name={state === "settling" ? "computer" : winning ? "money-2" : "duck"}
          size={60}
          className="absolute right-3 top-4 rotate-12 sm:hidden"
        />
        <div className="relative z-10 grid items-center gap-5 p-6 sm:p-8 lg:grid-cols-[1.25fr_0.75fr] lg:p-12">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-ink/20 bg-white/70 px-3 py-2 text-xs font-bold">
              {state === "settling" ? <Spinner /> : <ShieldCheck size={16} />}
              {state === "settling" ? "THE PROOF IS IN PROGRESS" : "ROUND COMPLETE"}
            </div>
            <h1 className="max-w-[750px] font-headline text-[clamp(40px,5.5vw,80px)] leading-[1.05]">
              {state === "settling"
                ? "Waiting for the final word."
                : winning
                  ? "Now that’s a good call."
                  : "Not your round. Yet."}
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-ink-soft sm:text-base">
              {state === "settling"
                ? "The clip is over. Chainlink CRE is checking both transcripts before the results become final."
                : winning
                  ? "You listened. You called it. Here’s how your words played out."
                  : "Some words went the other way. Every call has a receipt — and there’s always another episode."}
            </p>
            {state !== "settling" && (
              <div className="mt-7">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Your episode profit / loss
                </p>
                <Money
                  value={profit}
                  signed
                  className={`font-headline text-[clamp(34px,4vw,60px)] leading-tight ${winning ? "text-gain" : "text-ink"}`}
                />
              </div>
            )}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={onPlayNext}>
                Play next episode <ArrowRight size={18} />
              </Button>
              <span className="text-xs text-ink-soft">Practice tokens. Real good calls.</span>
            </div>
          </div>
          <div className="relative hidden h-[300px] items-center justify-center sm:flex">
            <div className="absolute h-64 w-64 rounded-full border-2 border-dashed border-ink/15" />
            <motion.div
              initial={reduce ? false : { transform: "translateY(12px) rotate(-8deg)", opacity: 0 }}
              animate={{ transform: "translateY(0px) rotate(-8deg)", opacity: 1 }}
              transition={{ duration: 0.25 }}
            >
              <Voxel
                name={state === "settling" ? "computer" : winning ? "money-2" : "duck"}
                size={240}
              />
            </motion.div>
            <div className="absolute right-1 top-3 rotate-12 rounded-2xl border-2 border-ink bg-white px-4 py-3 font-headline shadow-sticker">
              {state === "settling" ? "Checking…" : winning ? "NICE ONE!" : "NEXT ONE?"}
            </div>
          </div>
        </div>
        {winning && state !== "settling" && !reduce && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-0 overflow-hidden"
          >
            {[8, 17, 26, 35, 44, 53, 62, 71, 80, 89].map((position) => (
              <motion.div
                key={position}
                className="absolute"
                style={{ left: `${position}%`, top: "65%" }}
                initial={{ opacity: 0, transform: "translateY(0px) rotate(0deg) scale(0.95)" }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  transform: [
                    `translateY(0px) rotate(0deg) scale(0.95)`,
                    `translateY(-160px) rotate(${position % 2 ? 90 : -90}deg) scale(1)`,
                    `translateY(-220px) rotate(${position % 2 ? 150 : -150}deg) scale(0.95)`,
                  ],
                }}
                transition={{ duration: 1.6, delay: position * 0.005, ease: [0.23, 1, 0.32, 1] }}
              >
                <Voxel name={position % 2 ? "star" : "zap"} size={32} />
              </motion.div>
            ))}
          </div>
        )}
      </section>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="font-headline text-2xl sm:text-3xl">Six words. No guesswork.</h2>
            <span className="shrink-0 text-xs font-semibold text-ink-soft">
              {words.length - pending} / {words.length} final
            </span>
          </div>
          <p className="mb-5 text-sm text-ink-soft">
            Open a word to see both transcripts and your trades.
          </p>
          <div className="grid items-start gap-4 md:grid-cols-2">
            {words.map((word, index) => (
              <WordResult
                key={`${word.id}-${expandedWordId ?? "closed"}`}
                word={word}
                index={index}
                expanded={word.id === expandedWordId}
              />
            ))}
          </div>
        </section>
        <aside className="rounded-3xl border-2 border-ink bg-card p-6 shadow-sticker xl:sticky xl:top-6">
          <Coins size={28} className="mb-4" />
          <h2 className="font-headline text-2xl">
            {state === "redeemed" ? "All yours." : "Bring it home."}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {state === "settling"
              ? "Redemption unlocks when your words are final."
              : state === "redeemed"
                ? "Your winning shares are redeemed. The tokens are back in your balance."
                : "Turn your winning shares back into practice tokens."}
          </p>
          <Money value={redeemable} className="mt-6 block font-headline text-3xl" />
          {state === "settling" ? (
            <div
              role="status"
              className="mt-5 flex items-center gap-2 rounded-2xl bg-paper p-4 text-sm font-semibold"
            >
              <Spinner />
              {pending} words pending CRE
            </div>
          ) : state === "redeemed" ? (
            <div
              role="status"
              className="mt-5 flex items-center gap-2 rounded-2xl bg-gain-tint p-4 text-sm font-semibold text-gain"
            >
              <CheckCircle2 size={18} />
              Redeemed
            </div>
          ) : (
            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={redeemable <= 0n || redeemState === "sending"}
              onClick={onRedeem}
            >
              {redeemState === "sending" ? (
                <>
                  <Spinner />
                  Redeeming…
                </>
              ) : (
                "Redeem AUSD"
              )}
            </Button>
          )}
          <p className="mt-4 text-xs leading-relaxed text-ink-soft">
            Monad testnet only. No real money.
          </p>
        </aside>
      </div>
    </div>
  );
}
