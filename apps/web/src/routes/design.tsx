import { TRADING_CLOSE_LEAD_MS } from "@sayso/core";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { SlidersHorizontal, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { BetsChip } from "@/episode/BetsChip";
import { betsView } from "@/episode/bets";
import type { SaidMark } from "@/episode/ClipTimeline";
import { EpisodeHeader } from "@/episode/EpisodeHeader";
import { EpisodeLayout } from "@/episode/EpisodeLayout";
import { type Holding, PositionStrip } from "@/episode/PositionStrip";
import {
  SAID_BID_CENTS,
  type Side,
  saleValueMicro,
  sharesFromMicro,
  sideCents,
} from "@/episode/quote";
import { ResultCard } from "@/episode/ResultCard";
import { Ticket, type TicketStatus } from "@/episode/Ticket";
import { VideoStage } from "@/episode/VideoStage";
import { WordBoard } from "@/episode/WordBoard";
import { WordCard, type WordState } from "@/episode/WordCard";
import { PRESENTATION_DELAY_MS, tradingWindow, wordAction } from "@/live/model";
import { Voxel } from "@/ui/Voxel";

export const Route = createFileRoute("/design")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DesignSpecimen,
});

// Specimen data for this dev-only page. Not an episode, not a transcript, not a flag plan.
type SpecimenWord = {
  word: string;
  priceCents: number;
  state: WordState;
  position?: { side: Side; shares: number };
  /** What the specimen player paid for `position`, 6-decimal AUSD. */
  costMicro: bigint;
};

const WORDS: readonly SpecimenWord[] = [
  { word: "Championship", priceCents: 50, state: "open", costMicro: 0n },
  {
    word: "Pressure",
    priceCents: 62,
    state: "open",
    position: { side: "yes", shares: 40 },
    costMicro: 19_200_000n,
  },
  { word: "Legacy", priceCents: 41, state: "open", costMicro: 0n },
  { word: "Fans", priceCents: 73, state: "open", costMicro: 0n },
  {
    word: "Extraordinary",
    priceCents: 28,
    state: "open",
    position: { side: "no", shares: 25 },
    costMicro: 9_000_000n,
  },
  { word: "Trophy", priceCents: 55, state: "open", costMicro: 0n },
];

const START_BALANCE = 124_500_000n;
const CLIP_SECONDS = 184;
/** Long enough to watch the bets countdown run out before the clip starts. */
const PREROLL_SECONDS = TRADING_CLOSE_LEAD_MS / 1_000 + 15;
const RIBBON_PX = 30;
const SEND_MS = 750;
const CLOSE_MS = 900;

type Phase = "preroll" | "live" | "settled";
type OpenTicket = { word: string; status: TicketStatus };

function DesignSpecimen() {
  const [words, setWords] = useState<readonly SpecimenWord[]>(WORDS);
  const [balance, setBalance] = useState(START_BALANCE);
  const [phase, setPhase] = useState<Phase>("live");
  const [secondsLeft, setSecondsLeft] = useState(CLIP_SECONDS - 47);
  const [marks, setMarks] = useState<readonly SaidMark[]>([]);
  const [ticket, setTicket] = useState<OpenTicket | null>(null);
  const [result, setResult] = useState<{
    change: bigint;
    redeem: bigint;
    called: number;
    traded: number;
  } | null>(null);
  const timers = useRef(new Set<number>());

  const later = useCallback((ms: number, run: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      run();
    }, ms);
    timers.current.add(id);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) clearTimeout(id);
    };
  }, []);

  // The specimen clock: pre-roll counts down into playback; playback counts down to the end.
  useEffect(() => {
    if (phase === "settled") return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        if (phase === "preroll") {
          setPhase("live");
          return CLIP_SECONDS;
        }
        return 0;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const update = (word: string, next: (w: SpecimenWord) => SpecimenWord) =>
    setWords((all) => all.map((w) => (w.word === word ? next(w) : w)));

  const say = (word: string) => {
    const target = words.find((w) => w.word === word);
    if (target?.state !== "open") return;
    update(word, (w) => ({ ...w, state: "said", priceCents: SAID_BID_CENTS }));
    if (phase === "live") {
      setMarks((all) => [...all, { word, atSeconds: CLIP_SECONDS - secondsLeft }]);
    }
  };

  const movePrices = () =>
    setWords((all) =>
      all.map((w) => {
        if (w.state !== "open") return w;
        const step = Math.round(Math.random() * 14) - 7 || 4;
        return { ...w, priceCents: Math.min(96, Math.max(4, w.priceCents + step)) };
      }),
    );

  const settle = () => {
    setTicket(null);
    setPhase("settled");
    const settled = words.map(
      (w): SpecimenWord =>
        w.state === "said"
          ? { ...w, state: "yes", priceCents: 100 }
          : w.state === "open"
            ? { ...w, state: "no", priceCents: 0 }
            : w,
    );
    setWords(settled);
    const held = settled.filter((w) => w.position);
    const redeem = held.reduce(
      (sum, w) =>
        sum +
        saleValueMicro(w.position?.shares ?? 0, sideCents(w.position?.side ?? "yes", w.priceCents)),
      0n,
    );
    const cost = held.reduce((sum, w) => sum + w.costMicro, 0n);
    const called = held.filter((w) => (w.position?.side === "yes") === (w.state === "yes")).length;
    later(1100, () => setResult({ change: redeem - cost, redeem, called, traded: held.length }));
  };

  const openTicket = (word: string) => setTicket({ word, status: "idle" });

  const buy = (word: string, side: Side, amountMicro: bigint, sharesMicro: bigint) => {
    setTicket({ word, status: "sending" });
    later(SEND_MS, () => {
      setTicket({ word, status: "filled" });
      setBalance((b) => b - amountMicro);
      update(word, (w) => {
        const shares = sharesFromMicro(sharesMicro);
        const same = w.position?.side === side;
        return {
          ...w,
          position: { side, shares: (same ? (w.position?.shares ?? 0) : 0) + shares },
          costMicro: (same ? w.costMicro : 0n) + amountMicro,
        };
      });
      later(CLOSE_MS, () => setTicket((t) => (t?.word === word ? null : t)));
    });
  };

  const cashOut = (word: string) => {
    const target = words.find((w) => w.word === word);
    if (!target?.position) return;
    const value = saleValueMicro(target.position.shares, SAID_BID_CENTS);
    setTicket({ word, status: "sending" });
    later(SEND_MS, () => {
      setTicket({ word, status: "filled" });
      // The balance counts up as the coins land.
      later(520, () => {
        setBalance((b) => b + value);
        update(word, ({ position: _held, ...rest }) => ({ ...rest, costMicro: 0n }));
      });
      later(CLOSE_MS, () => setTicket((t) => (t?.word === word ? null : t)));
    });
  };

  /** Cash out from a cold start: flip a held word to SAID, then open its cash-out ticket. */
  const demoCashOut = () => {
    const held = words.find(
      (w) => w.position?.side === "yes" && w.state !== "yes" && w.state !== "no",
    );
    if (!held) return;
    if (held.state === "open") say(held.word);
    later(held.state === "open" ? 900 : 0, () => openTicket(held.word));
  };

  const reset = () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current.clear();
    setWords(WORDS);
    setBalance(START_BALANCE);
    setPhase("live");
    setSecondsLeft(CLIP_SECONDS - 47);
    setMarks([]);
    setTicket(null);
    setResult(null);
  };

  const held = words.filter((w) => w.position);
  const holdings: Holding[] = held.flatMap((w) =>
    w.position ? [{ word: w.word, ...w.position }] : [],
  );
  const costMicro = held.reduce((sum, w) => sum + w.costMicro, 0n);
  const valueMicro = held.reduce(
    (sum, w) =>
      sum +
      saleValueMicro(w.position?.shares ?? 0, sideCents(w.position?.side ?? "yes", w.priceCents)),
    0n,
  );
  const ticketWord = ticket ? (words.find((w) => w.word === ticket.word) ?? null) : null;
  const live = phase !== "preroll";
  // The specimen's clip starts at t = 0 and plays after the presentation delay, like an episode.
  const trading = tradingWindow(
    live ? PRESENTATION_DELAY_MS : PRESENTATION_DELAY_MS - secondsLeft * 1_000,
    0,
    phase === "settled",
  );
  const bets = betsView(trading, phase === "settled");

  return (
    <div className="bg-paper">
      <p
        className="flex items-center justify-center gap-2 bg-ink text-[11px] font-extrabold uppercase tracking-[0.14em] text-sun"
        style={{ height: RIBBON_PX }}
      >
        Dev specimen · sample words, not an episode
      </p>
      <EpisodeLayout
        desktopHeight={`calc(100dvh - ${RIBBON_PX}px)`}
        header={
          <EpisodeHeader
            episode="Episode 14 · Replay"
            // Like the clip itself, its title stays hidden until kickoff.
            title={live ? "Cup final presser" : "Replay Arena"}
            balanceMicro={balance}
          />
        }
        stage={
          <VideoStage
            live={live}
            ended={phase === "settled"}
            secondsLeft={phase === "settled" ? 0 : secondsLeft}
            betsCloseIn={bets.closesInSeconds}
            durationSeconds={CLIP_SECONDS}
            marks={marks}
            frame={<SpecimenClip talking={phase === "live"} />}
          />
        }
        board={
          <WordBoard
            variant="episode"
            caption={<BetsChip view={bets} />}
            words={words.map(({ costMicro: _cost, ...w }) => ({
              ...w,
              locked: wordAction(w.state, trading) === "locked",
              selected: ticket?.word === w.word,
              ...(w.state === "open" || w.state === "said"
                ? { onPress: () => openTicket(w.word) }
                : {}),
            }))}
          />
        }
        position={
          <PositionStrip holdings={holdings} costMicro={costMicro} valueMicro={valueMicro} />
        }
        ticketWord={ticket?.word ?? null}
        renderTicket={(layout) =>
          ticketWord && ticket ? (
            <Ticket
              key={ticketWord.word}
              layout={layout}
              word={ticketWord.word}
              state={ticketWord.state}
              yesCents={ticketWord.priceCents}
              balanceMicro={balance}
              status={ticket.status}
              {...(ticketWord.position ? { position: ticketWord.position } : {})}
              bets={bets}
              onClose={() => setTicket(null)}
              onConfirm={({ side, amountMicro }) => {
                const price = BigInt(sideCents(side, ticketWord.priceCents));
                buy(ticketWord.word, side, amountMicro, (amountMicro * 100n) / price);
              }}
              onCashOut={() => cashOut(ticketWord.word)}
            />
          ) : null
        }
        onTicketClose={() => setTicket(null)}
      />

      <Controls
        words={words}
        phase={phase}
        onSay={say}
        onMove={movePrices}
        onPhase={() => {
          if (phase === "preroll") {
            setPhase("live");
            setSecondsLeft(CLIP_SECONDS - 47);
          } else {
            setPhase("preroll");
            setSecondsLeft(PREROLL_SECONDS);
          }
        }}
        onSettle={settle}
        onCashOut={demoCashOut}
        onTicket={() => {
          const open = words.find((w) => w.state === "open");
          if (open) openTicket(open.word);
        }}
        onReset={reset}
        onResult={(win) =>
          setResult(
            win
              ? { change: 6_400_000n, redeem: 46_400_000n, called: 2, traded: 3 }
              : { change: -2_100_000n, redeem: 0n, called: 0, traded: 1 },
          )
        }
      />

      <Gallery />

      {result ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Episode result"
          className="fixed inset-0 z-[65] flex items-center justify-center px-6"
        >
          <button
            type="button"
            aria-label="Close result"
            className="absolute inset-0 bg-ink/45"
            onClick={() => setResult(null)}
          />
          <div className="relative w-full max-w-[440px]">
            <ResultCard
              announce
              changeMicro={result.change}
              called={result.called}
              traded={result.traded}
              redeemMicro={result.redeem}
              onRedeem={() => {
                setBalance((b) => b + result.redeem);
                setResult(null);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A stand-in for the clip: a voxel speaker with a talking bubble. Specimen only. */
function SpecimenClip({ talking }: { talking: boolean }) {
  const reduce = useReducedMotion() ?? false;
  const bars = [0.5, 0.9, 0.6, 1, 0.7, 0.4, 0.8];
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-[4%] bg-[radial-gradient(circle,rgb(79_82_232/0.16)_1.5px,transparent_1.6px)] bg-sky-tint bg-size-[18px_18px]">
      <span className="absolute top-[13%] left-1/2 -translate-x-1/2 rounded-full bg-ink px-2.5 py-1 text-[10px] font-extrabold tracking-[0.14em] text-paper md:text-[11px]">
        SAMPLE CLIP
      </span>
      <Voxel name="smiley-face" size={256} className="h-auto w-[24%] max-w-[220px]" />
      <div className="sticker relative flex h-[22%] w-[30%] items-center justify-center gap-[6%] rounded-[999px] px-[4%]">
        {bars.map((height, i) => (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars.
            key={i}
            className="block w-[7%] rounded-full bg-ink"
            style={{ height: `${height * 60}%` }}
            animate={talking && !reduce ? { scaleY: [1, 0.35, 1.1, 0.6, 1] } : { scaleY: 1 }}
            transition={
              talking && !reduce
                ? {
                    duration: 0.9,
                    delay: i * 0.08,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }
                : { duration: 0.2 }
            }
          />
        ))}
        <span className="absolute -bottom-[14%] left-[10%] block size-[18%] rotate-45 border-r-2 border-b-2 border-ink bg-card" />
      </div>
    </div>
  );
}

function Controls({
  words,
  phase,
  onSay,
  onMove,
  onPhase,
  onSettle,
  onCashOut,
  onTicket,
  onResult,
  onReset,
}: {
  words: readonly SpecimenWord[];
  phase: Phase;
  onSay: (word: string) => void;
  onMove: () => void;
  onPhase: () => void;
  onSettle: () => void;
  onCashOut: () => void;
  onTicket: () => void;
  onResult: (win: boolean) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative z-[45] mx-6 mt-8 flex flex-col items-start gap-2 md:mx-8 xl:mx-12">
      {open ? (
        <div className="sticker flex w-[340px] max-w-full flex-col gap-3 p-3 shadow-sticker-lg">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink-soft">
              Flip a word to SAID
            </p>
            <button
              type="button"
              aria-label="Hide controls"
              onClick={() => setOpen(false)}
              className="inline-flex size-11 items-center justify-center rounded-full hover:bg-line"
            >
              <X aria-hidden size={18} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {words.map((w) => (
              <Chip key={w.word} disabled={w.state !== "open"} onClick={() => onSay(w.word)}>
                {w.word}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 border-t-2 border-line pt-3">
            <Chip onClick={onMove} disabled={phase === "settled"}>
              Move prices
            </Chip>
            <Chip onClick={onPhase} disabled={phase === "settled"}>
              {phase === "preroll" ? "Go live" : "Pre-roll"}
            </Chip>
            <Chip onClick={onTicket} disabled={phase === "settled"}>
              Open ticket
            </Chip>
            <Chip onClick={onCashOut} disabled={phase === "settled"}>
              Cash out
            </Chip>
            <Chip onClick={onSettle} disabled={phase === "settled"}>
              Settle
            </Chip>
            <Chip onClick={() => onResult(true)}>Win result</Chip>
            <Chip onClick={() => onResult(false)}>Lose result</Chip>
            <Chip onClick={onReset}>Reset</Chip>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="sticker pressable inline-flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-[12px] font-extrabold uppercase tracking-[0.12em] text-sun"
      >
        <SlidersHorizontal aria-hidden size={16} />
        Dev specimen
      </button>
    </div>
  );
}

function Chip({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="pressable h-11 rounded-full border-2 border-ink bg-card px-3.5 text-[13px] font-bold shadow-[0_2px_0_var(--color-ink)] disabled:opacity-35"
    >
      {children}
    </button>
  );
}

const STATES: readonly WordState[] = ["open", "said", "yes", "no"];

function priceFor(state: WordState, open: number): number {
  return state === "said" ? SAID_BID_CENTS : state === "yes" ? 100 : state === "no" ? 0 : open;
}

/** Static references below the live composition: every card state, ticket states, results. */
function Gallery() {
  const [replay, setReplay] = useState<WordState>("said");
  return (
    <div className="mx-auto flex max-w-[1616px] flex-col gap-14 px-6 pt-14 pb-28 md:px-8 xl:px-12">
      <Section
        title="Every card state"
        note="Open, SAID, settled YES, settled NO and bets locked; short and long words, held and not."
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 md:grid-cols-4 [&>*]:h-[132px] lg:[&>*]:h-[188px]">
          {STATES.map((state) => (
            <WordCard key={state} word="Goal" priceCents={priceFor(state, 62)} state={state} />
          ))}
          {STATES.map((state) => (
            <WordCard
              key={`held-${state}`}
              word="Extraordinary"
              priceCents={priceFor(state, 28)}
              state={state}
              position={{ side: "yes", shares: 12.5 }}
            />
          ))}
          <WordCard word="Championship" priceCents={priceFor(replay, 50)} state={replay} />
          <WordCard
            word="Unbelievable"
            priceCents={priceFor(replay, 9)}
            state={replay}
            position={{ side: "no", shares: 1_250 }}
          />
          <WordCard word="Trophy" priceCents={55} state="open" locked />
          <WordCard
            word="Legacy"
            priceCents={41}
            state="open"
            locked
            position={{ side: "yes", shares: 12.5 }}
          />
        </div>
        <Chip
          onClick={() => {
            setReplay("open");
            // Two frames of OPEN first so the replayed flip starts from a painted face.
            requestAnimationFrame(() => requestAnimationFrame(() => setReplay("said")));
          }}
        >
          Replay flip
        </Chip>
      </Section>

      <Section
        title="Ticket"
        note="Buy with the bets clock, bets locked, sending, filled and cash out; phone sheet body and desktop dock body."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Frame label="Sheet · buy">
            <Ticket
              word="Pressure"
              state="open"
              yesCents={62}
              balanceMicro={START_BALANCE}
              bets={betsView({ status: "open", closesInMs: 8_000 }, false)}
            />
          </Frame>
          <Frame label="Sheet · bets locked">
            <Ticket
              word="Legacy"
              state="open"
              yesCents={41}
              position={{ side: "yes", shares: 12.5 }}
              bets={betsView({ status: "closed" }, false)}
            />
          </Frame>
          <Frame label="Sheet · cash out">
            <Ticket
              word="Pressure"
              state="said"
              yesCents={98}
              position={{ side: "yes", shares: 40 }}
            />
          </Frame>
          <Frame label="Dock · sending" dock>
            <Ticket
              word="Legacy"
              state="open"
              yesCents={41}
              status="sending"
              layout="dock"
              initialSide="no"
            />
          </Frame>
          <Frame label="Dock · filled" dock>
            <Ticket word="Legacy" state="open" yesCents={41} status="filled" layout="dock" />
          </Frame>
        </div>
      </Section>

      <Section title="Result" note="End-of-episode card: win in sun with stickers, loss neutral.">
        <div className="grid gap-16 py-8 md:grid-cols-2">
          <ResultCard changeMicro={6_400_000n} called={2} traded={3} redeemMicro={46_400_000n} />
          <ResultCard changeMicro={-2_100_000n} called={0} traded={1} redeemMicro={0n} />
        </div>
      </Section>
    </div>
  );
}

function Frame({ label, dock, children }: { label: string; dock?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-ink-soft">
        {label}
      </p>
      <div
        className={
          dock
            ? "sticker relative p-5 shadow-sticker-lg"
            : "rounded-card border-2 border-ink bg-card px-4 pt-4 pb-5 shadow-sticker"
        }
      >
        {children}
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5">
      <div className="border-t-2 border-ink pt-5">
        <h2 className="font-headline text-[32px] leading-none md:text-[44px]">{title}</h2>
        <p className="mt-2 text-[15px] text-ink-soft">{note}</p>
      </div>
      {children}
    </section>
  );
}
