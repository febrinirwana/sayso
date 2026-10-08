import { Play, RotateCcw } from "lucide-react";
import { animate, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { play } from "@/sound";
import { Button } from "@/ui/Button";
import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";
import { CoinFlights, type Flight } from "./CoinFlight";
import { DemoCard } from "./DemoCard";
import {
  DEMO_WORDS,
  type DemoBoard,
  demoPrice,
  formatCentsChange,
  formatCoins,
  freshBoard,
  heardWord,
  normaliseToken,
  pick,
  SETTLE_DELAY_MS,
  START_CENTS,
  scriptCues,
  settle,
} from "./demo";
import { SectionHeading } from "./SectionHeading";
import { StickerToy } from "./StickerToy";

type Phase = "idle" | "running" | "settled";

const CUES = scriptCues();
const RUN_MS = (CUES.at(-1)?.at ?? 0) + SETTLE_DELAY_MS;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const REACTIONS: readonly VoxelName[] = [
  "omg-message",
  "like-message",
  "love",
  "wtf-message",
  "star",
  "smiley-face",
];

/** Counts a displayed number toward `value` over 0.8 s (DESIGN section 6, cash out). */
function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const controls = animate(from.current, value, {
      duration: 0.8,
      ease: EASE_OUT,
      onUpdate: (v) => {
        from.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [value]);
  return Math.round(shown);
}

/** Section 4: a playable demo round. Pick words, run a fake caption feed, watch them flip. */
export function TryIt() {
  const section = useRef<HTMLElement>(null);
  const [board, setBoard] = useState<DemoBoard>(freshBoard);
  const [phase, setPhase] = useState<Phase>("idle");
  /** How many caption words have been spoken so far. */
  const [spoken, setSpoken] = useState(0);
  const [runId, setRunId] = useState(0);
  /** The balance the player sees: lags the board until the coins land. */
  const [landedCents, setLandedCents] = useState(START_CENTS);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const timers = useRef<number[]>([]);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const balanceRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef(board);
  const shake = useAnimationControls();
  const reduced = useReducedMotion() === true;
  const balance = useCountUp(landedCents);

  useEffect(() => {
    boardRef.current = board;
  }, [board]);

  useEffect(
    () => () => {
      for (const id of timers.current) window.clearTimeout(id);
    },
    [],
  );

  const reset = () => {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
    const fresh = freshBoard();
    boardRef.current = fresh;
    setBoard(fresh);
    setLandedCents(fresh.balanceCents);
    setFlights([]);
    setSpoken(0);
    setPhase("idle");
  };

  const hear = (token: string, i: number) => {
    setSpoken(i + 1);
    const before = boardRef.current;
    const after = heardWord(before, token);
    if (after === before) return;
    boardRef.current = after;
    setBoard(after);
    const flippedAt = after.cards.findIndex(
      (c, k) => c.state === "said" && before.cards[k]?.state === "open",
    );
    play("said");
    navigator.vibrate?.(12);
    if (!reduced) void shake.start({ x: [0, -5, 5, -3, 3, 0], transition: { duration: 0.35 } });
    const from = cards.current[flippedAt]?.getBoundingClientRect();
    const to = balanceRef.current?.getBoundingClientRect();
    if (after.balanceCents > before.balanceCents) {
      if (reduced || !from || !to) {
        setLandedCents(after.balanceCents);
        play("cashout");
      } else {
        setFlights((f) => [...f, { id: Date.now() + flippedAt, from, to }]);
      }
    }
  };

  const run = () => {
    for (const id of timers.current) window.clearTimeout(id);
    setRunId((n) => n + 1);
    setSpoken(0);
    setPhase("running");
    play("start");
    timers.current = CUES.map((cue, i) => window.setTimeout(() => hear(cue.token, i), cue.at));
    timers.current.push(
      window.setTimeout(() => {
        const settled = settle(boardRef.current);
        boardRef.current = settled;
        setBoard(settled);
        setPhase("settled");
        play(settled.balanceCents > START_CENTS ? "win" : "lose");
      }, RUN_MS),
    );
  };

  const picks = board.cards.filter((c) => c.picked).length;
  const net = board.balanceCents - START_CENTS;
  const status =
    phase === "running"
      ? "Listening… SAID picks cash out at 98¢ automatically."
      : phase === "settled"
        ? picks === 0
          ? "No picks this time. Run it again with a word or two."
          : `Round over: ${formatCentsChange(net)} on ${picks} pick${picks === 1 ? "" : "s"}.`
        : picks === 0
          ? "Tap the words you think get said."
          : `${picks} pick${picks === 1 ? "" : "s"}. Ready when you are.`;

  return (
    <section
      ref={section}
      id="try-it"
      aria-labelledby="try-it-title"
      className="relative mx-2 mt-6 scroll-mt-20 rounded-[40px] border-2 border-ink bg-sun-tint px-6 py-20 md:mx-4 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1520px]">
        <SectionHeading
          id="try-it-title"
          eyebrow="Try it"
          badge={
            <span className="inline-flex h-8 rotate-2 items-center rounded-full border-2 border-ink bg-ink px-3 text-sm font-bold tracking-[0.08em] text-paper">
              DEMO
            </span>
          }
          title="Call it before they say it."
          lede="Pick a word or two, run a short clip, and watch the board react. Demo coins only: nothing here touches a market."
        />

        <div className="relative z-[2] mt-12 grid gap-8 md:mt-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-12">
          <div>
            <ClipScreen phase={phase} spoken={spoken} runId={runId} />
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                size="xl"
                onClick={phase === "settled" ? reset : run}
                disabled={phase === "running"}
              >
                <Play aria-hidden size={20} strokeWidth={2.5} className="fill-current" />
                {phase === "settled" ? "New round" : "Run the clip"}
              </Button>
              <Button size="xl" variant="secondary" onClick={reset} disabled={phase === "running"}>
                <RotateCcw aria-hidden size={20} strokeWidth={2.5} />
                Reset
              </Button>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                ref={balanceRef}
                className="inline-flex h-14 items-center gap-2 rounded-full border-2 border-ink bg-card pr-4 pl-1.5 shadow-sticker"
              >
                <Voxel name="money-1" size={44} className="size-11" />
                <span className="text-sm font-semibold text-ink-soft">Demo coins</span>
                <span className="tabular font-headline text-2xl">{formatCoins(balance)}</span>
              </div>
              <TestnetPill />
            </div>
            <motion.div
              animate={shake}
              className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4"
            >
              {DEMO_WORDS.map((w, i) => {
                const card = board.cards[i] ?? { state: "open" as const, picked: false };
                return (
                  <DemoCard
                    key={w.word}
                    ref={(node) => {
                      cards.current[i] = node;
                    }}
                    word={w.word}
                    card={card}
                    priceCents={demoPrice(w, card.state)}
                    reaction={REACTIONS[i % REACTIONS.length] ?? "omg-message"}
                    onPress={
                      phase === "idle" && card.state === "open"
                        ? () => {
                            const next = pick(board, i);
                            if (next === board) return;
                            play(next.cards[i]?.picked ? "confirm" : "tap");
                            setBoard(next);
                            setLandedCents(next.balanceCents);
                          }
                        : undefined
                    }
                  />
                );
              })}
            </motion.div>
            <p role="status" className="mt-5 min-h-7 text-[17px] font-semibold">
              {status}
            </p>
          </div>
        </div>
      </div>

      <CoinFlights
        flights={flights}
        onLanded={() => {
          setLandedCents(boardRef.current.balanceCents);
          play("cashout");
        }}
        onDone={(id) => setFlights((f) => f.filter((flight) => flight.id !== id))}
      />

      <StickerToy
        name="ice-cream"
        size={84}
        tilt={12}
        bounds={section}
        className="top-12 right-[5%] hidden md:block"
      />
      <StickerToy
        name="swag"
        size={80}
        tilt={-8}
        bounds={section}
        className="-bottom-6 left-[8%] hidden lg:block"
      />
    </section>
  );
}

/** The demo "clip": a speaker on screen and a caption strip that types as words are spoken. */
function ClipScreen({ phase, spoken, runId }: { phase: Phase; spoken: number; runId: number }) {
  const talking = phase === "running";
  const reduced = useReducedMotion() === true;
  return (
    <div className="sticker-lg overflow-hidden">
      <div className="relative aspect-[16/9] border-b-2 border-ink bg-sky">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_110%,#9a9cf7_0,transparent_60%)]" />
        <motion.div
          className="absolute bottom-0 left-1/2 w-[42%] -translate-x-1/2"
          animate={
            talking && !reduced
              ? { y: [0, -6, 0, -3, 0], rotate: [0, -2, 1, 0] }
              : { y: 0, rotate: 0 }
          }
          transition={
            talking && !reduced
              ? { duration: 0.6, repeat: Number.POSITIVE_INFINITY }
              : { duration: 0.2 }
          }
        >
          <Voxel name="alien" size={256} className="aspect-square w-full translate-y-[10%]" />
        </motion.div>
        <span
          className={`absolute top-3 left-3 inline-flex h-8 items-center rounded-full border-2 border-ink px-3 text-xs font-bold tracking-[0.08em] ${
            talking ? "bg-said text-ink" : "bg-card text-ink"
          }`}
        >
          {talking ? "● LIVE" : phase === "settled" ? "ENDED" : "DEMO CLIP"}
        </span>
        <span className="tabular absolute top-3 right-3 inline-flex h-8 items-center rounded-full border-2 border-ink bg-card px-3 text-xs font-bold">
          0:{String(Math.round(RUN_MS / 1000)).padStart(2, "0")}
        </span>
      </div>
      <div className="relative min-h-[132px] px-5 py-5 font-headline text-[26px] leading-[1.25] md:px-6 md:text-[30px]">
        {phase === "idle" && (
          <p className="absolute inset-x-5 top-5 text-ink-soft md:inset-x-6">
            “Honestly? This pizza is…”
          </p>
        )}
        {/* Every cue is laid out from the start so the strip never changes height mid-run. */}
        <p aria-hidden={phase === "idle"}>
          {CUES.map((cue, i) => {
            const shown = phase !== "idle" && i < spoken;
            const word = cue.token.replace(/[^A-Za-z’']+$/, "");
            const onBoard = DEMO_WORDS.some((w) => w.word === normaliseToken(word));
            return (
              <motion.span
                key={cue.at}
                initial={false}
                animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 8 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                className="mr-[0.25em] inline-block"
              >
                {onBoard ? (
                  <span className="rounded-lg border-2 border-ink bg-said px-1.5">{word}</span>
                ) : (
                  word
                )}
                {cue.token.slice(word.length)}
              </motion.span>
            );
          })}
        </p>
      </div>
      <div className="h-2 border-t-2 border-ink bg-paper" aria-hidden="true">
        <motion.div
          key={runId}
          className="h-full origin-left bg-ink"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: phase === "idle" ? 0 : 1 }}
          transition={
            phase === "running"
              ? { duration: RUN_MS / 1000, ease: "linear" }
              : { duration: 0.2, ease: EASE_OUT }
          }
        />
      </div>
    </div>
  );
}
