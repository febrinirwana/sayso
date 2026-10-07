import { Play, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { WordBoard } from "@/episode/WordBoard";
import { Button } from "@/ui/Button";
import {
  DEMO_WORDS,
  type DemoStates,
  demoPrice,
  freshStates,
  heardWord,
  normaliseToken,
  SETTLE_DELAY_MS,
  scriptCues,
  settle,
  toggle,
} from "./demo";
import { RevealGroup, RevealItem } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

type Phase = "idle" | "running" | "settled";

const CUES = scriptCues();
const RUN_MS = (CUES.at(-1)?.at ?? 0) + SETTLE_DELAY_MS;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function clearTimers(timers: { current: number[] }) {
  for (const id of timers.current) window.clearTimeout(id);
  timers.current = [];
}

export function TryIt() {
  const [states, setStates] = useState<DemoStates>(freshStates);
  const [phase, setPhase] = useState<Phase>("idle");
  /** How many caption words have been spoken so far. */
  const [spoken, setSpoken] = useState(0);
  /** Bumps on every run so the progress bar restarts from empty. */
  const [runId, setRunId] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => () => clearTimers(timers), []);

  const reset = () => {
    clearTimers(timers);
    setStates(freshStates());
    setSpoken(0);
    setPhase("idle");
  };

  const run = () => {
    reset();
    setRunId((id) => id + 1);
    setPhase("running");
    timers.current = CUES.map((cue, i) =>
      window.setTimeout(() => {
        setSpoken(i + 1);
        setStates((current) => heardWord(current, cue.token));
      }, cue.at),
    );
    timers.current.push(
      window.setTimeout(() => {
        setStates(settle);
        setPhase("settled");
      }, RUN_MS),
    );
  };

  const words = DEMO_WORDS.map((w, i) => {
    const state = states[i] ?? "open";
    return {
      word: w.word,
      state,
      priceCents: demoPrice(w, state),
      ...(phase === "idle" ? { onPress: () => setStates((current) => toggle(current, i)) } : {}),
    };
  });
  const touched = phase !== "idle" || states.some((s) => s !== "open");
  const saidCount = states.filter((s) => s === "yes").length;

  return (
    <section
      aria-labelledby="try-it-title"
      className="border-y-2 border-ink bg-line py-20 md:py-32"
    >
      <div className="mx-auto grid max-w-6xl gap-8 px-4 md:grid-cols-[1fr_400px] md:items-start md:gap-12 md:px-8 lg:grid-cols-[1fr_430px] lg:gap-16">
        <div>
          <SectionHeading
            id="try-it-title"
            title="Try it"
            badge={
              <span className="inline-flex h-8 items-center rounded-full border-2 border-ink px-3 text-sm font-bold tracking-[0.08em]">
                DEMO
              </span>
            }
            lede="Tap a card to flip it, or run a short clip and watch the board react. Nothing here touches a market."
          />
          <RevealGroup className="mt-10">
            <RevealItem>
              <ClipScreen phase={phase} spoken={spoken} runId={runId} />
            </RevealItem>
            <RevealItem className="mt-5 flex flex-wrap gap-3 md:mt-6">
              <Button size="lg" onClick={run} disabled={phase === "running"}>
                <Play aria-hidden size={18} strokeWidth={2.5} className="fill-current" />
                {phase === "settled" ? "Run it again" : "Run the clip"}
              </Button>
              <Button size="lg" variant="secondary" onClick={reset} disabled={!touched}>
                <RotateCcw aria-hidden size={18} strokeWidth={2.5} />
                Reset
              </Button>
            </RevealItem>
          </RevealGroup>
        </div>
        <RevealGroup className="mx-auto w-full max-w-[430px] md:mt-6">
          <RevealItem>
            <WordBoard words={words} />
          </RevealItem>
          <RevealItem>
            <p role="status" className="mt-4 min-h-6 text-center text-sm text-ink-soft">
              {phase === "settled"
                ? `${saidCount} said, ${DEMO_WORDS.length - saidCount} not. Said words pay 100¢, the rest 0¢.`
                : phase === "running"
                  ? "Listening…"
                  : "Sample words and prices. Demo only."}
            </p>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}
/** A caption strip standing in for the clip: words appear as they are "spoken". */
function ClipScreen({ phase, spoken, runId }: { phase: Phase; spoken: number; runId: number }) {
  return (
    <div className="sticker overflow-hidden">
      <div className="flex h-12 items-center justify-between border-b-2 border-ink px-4">
        <span className="text-sm font-semibold">
          Demo clip · 0:{String(Math.round(RUN_MS / 1000)).padStart(2, "0")}
        </span>
        {phase === "running" ? (
          <span className="inline-flex h-7 items-center rounded-full border-2 border-ink bg-said px-2.5 text-xs font-bold tracking-[0.08em] text-ink">
            LIVE
          </span>
        ) : (
          <span className="text-sm text-ink-soft">{phase === "settled" ? "Ended" : "Ready"}</span>
        )}
      </div>
      <div className="font-display-wide relative px-4 py-5 text-[26px] leading-[1.25] md:px-6 md:text-[32px]">
        {phase === "idle" && (
          <p className="absolute inset-x-4 top-5 text-ink-soft md:inset-x-6">
            “Honestly? This pizza is…”
          </p>
        )}
        {/* Every cue is laid out from the start so the strip never changes height mid-run. */}
        <p aria-hidden={phase === "idle"}>
          {CUES.map((cue, i) => {
            const shown = phase !== "idle" && i < spoken;
            const word = cue.token.replace(/[^A-Za-z]+$/, "");
            const onBoard = DEMO_WORDS.some((w) => w.word === normaliseToken(word));
            return (
              <motion.span
                key={cue.at}
                initial={false}
                animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : 6 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                className="mr-[0.25em] inline-block"
              >
                {onBoard ? (
                  <span className="rounded-md border-2 border-ink bg-said px-1">{word}</span>
                ) : (
                  word
                )}
                {cue.token.slice(word.length)}
              </motion.span>
            );
          })}
        </p>
      </div>
      <div className="h-1.5 border-t-2 border-ink bg-paper" aria-hidden>
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
