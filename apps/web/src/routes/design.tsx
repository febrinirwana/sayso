import { createFileRoute, notFound } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { EpisodeHeader } from "@/episode/EpisodeHeader";
import { PositionStrip } from "@/episode/PositionStrip";
import { VideoStage } from "@/episode/VideoStage";
import { WordBoard } from "@/episode/WordBoard";
import { WordCard, type WordCardProps, type WordState } from "@/episode/WordCard";
import { Button } from "@/ui/Button";
import { Voxel } from "@/ui/Voxel";

export const Route = createFileRoute("/design")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: DesignSpecimen,
});

// Specimen data for this dev-only page. Not an episode, not a transcript, not a flag plan.
type SpecimenCard = Omit<WordCardProps, "onPress"> & { entryCents: number };

const SPECIMEN_WORDS: readonly SpecimenCard[] = [
  { word: "Championship", priceCents: 50, state: "open", entryCents: 50 },
  {
    word: "Pressure",
    priceCents: 62,
    state: "open",
    entryCents: 48,
    position: { side: "yes", shares: 40 },
  },
  { word: "Legacy", priceCents: 41, state: "open", entryCents: 41 },
  { word: "Fans", priceCents: 73, state: "open", entryCents: 73 },
  {
    word: "Extraordinary",
    priceCents: 28,
    state: "open",
    entryCents: 64,
    position: { side: "no", shares: 25 },
  },
  { word: "Trophy", priceCents: 55, state: "open", entryCents: 55 },
];

const SAID_BID_CENTS = 98;
const MICRO_PER_CENT = 10_000n;

const MARGIN_STICKERS: readonly { name: VoxelName; size: number; className: string }[] = [
  { name: "star", size: 112, className: "left-[7%] top-[12%] -rotate-12" },
  { name: "music-red", size: 96, className: "left-[14%] top-[46%] rotate-6" },
  { name: "money-1", size: 104, className: "left-[6%] bottom-[10%] -rotate-6" },
  { name: "game-console", size: 112, className: "right-[8%] top-[16%] rotate-12" },
  { name: "zap", size: 88, className: "right-[15%] top-[52%] -rotate-12" },
  { name: "red-alien", size: 104, className: "right-[6%] bottom-[12%] rotate-6" },
];

function DesignSpecimen() {
  const [cards, setCards] = useState<readonly SpecimenCard[]>(SPECIMEN_WORDS);
  const [live, setLive] = useState(true);

  const update = (word: string, next: (card: SpecimenCard) => SpecimenCard) =>
    setCards((all) => all.map((card) => (card.word === word ? next(card) : card)));

  const say = (word: string) =>
    update(word, (card) =>
      card.state === "open" ? { ...card, state: "said", priceCents: SAID_BID_CENTS } : card,
    );

  const settle = () =>
    setCards((all) =>
      all.map((card) =>
        card.state === "said"
          ? { ...card, state: "yes", priceCents: 100 }
          : card.state === "open"
            ? { ...card, state: "no", priceCents: 0 }
            : card,
      ),
    );

  const nudgePrices = () =>
    setCards((all) =>
      all.map((card) => {
        if (card.state !== "open") return card;
        const step = Math.round(Math.random() * 16) - 8 || 3;
        return { ...card, priceCents: Math.min(97, Math.max(3, card.priceCents + step)) };
      }),
    );

  const held = cards.filter((card) => card.position);
  const costMicro = sumMicro(held, (card) => sideCents(card, card.entryCents));
  const valueMicro = sumMicro(held, (card) => sideCents(card, card.priceCents));

  return (
    <div className="relative min-h-dvh bg-paper">
      <div aria-hidden className="pointer-events-none hidden lg:block">
        {MARGIN_STICKERS.map((sticker) => (
          <Voxel
            key={sticker.name}
            name={sticker.name}
            size={sticker.size}
            className={`fixed ${sticker.className}`}
          />
        ))}
      </div>

      <main className="relative mx-auto min-h-dvh w-full max-w-[430px] bg-paper pb-10 lg:border-x-2 lg:border-ink">
        <p className="bg-ink px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-paper">
          Design specimen · sample words · dev only
        </p>

        <EpisodeHeader episode="Episode 14" title="Cup final presser" balanceMicro={124_500_000n} />
        <VideoStage live={live} secondsLeft={live ? 133 : 42} />
        <div className="flex flex-col gap-3 px-4 pt-4">
          <WordBoard
            words={cards.map(({ entryCents: _entry, ...card }) => ({
              ...card,
              ...(card.state === "open" ? { onPress: () => say(card.word) } : {}),
            }))}
          />
          <PositionStrip words={held.length} costMicro={costMicro} valueMicro={valueMicro} />
        </div>

        <Section title="Controls" note="Tap a card above or a word below to flip it to SAID.">
          <div className="flex flex-wrap gap-2">
            {cards.map((card) => (
              <Button
                key={card.word}
                variant="secondary"
                disabled={card.state !== "open"}
                onClick={() => say(card.word)}
              >
                {card.word}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={settle}>Settle all</Button>
            <Button variant="secondary" onClick={nudgePrices}>
              Move prices
            </Button>
            <Button variant="secondary" onClick={() => setLive((value) => !value)}>
              {live ? "Show pre-roll" : "Go live"}
            </Button>
            <Button variant="secondary" onClick={() => setCards(SPECIMEN_WORDS)}>
              Reset
            </Button>
          </div>
        </Section>

        <Section title="Every state" note="Static cards, plus long words at their fitted size.">
          <StateGrid />
        </Section>
      </main>
    </div>
  );
}

const STATES: readonly WordState[] = ["open", "said", "yes", "no"];

function StateGrid() {
  const [replay, setReplay] = useState<WordState>("said");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
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
      </div>
      <Button
        variant="secondary"
        className="self-start"
        onClick={() => {
          setReplay("open");
          // Two frames of OPEN first so the replayed flip starts from a painted face.
          requestAnimationFrame(() => requestAnimationFrame(() => setReplay("said")));
        }}
      >
        Replay flip
      </Button>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="mt-8 flex flex-col gap-3 border-t-2 border-ink px-4 pt-5">
      <div>
        <h2 className="font-display-wide text-2xl">{title}</h2>
        <p className="text-sm text-ink-soft">{note}</p>
      </div>
      {children}
    </section>
  );
}

function priceFor(state: WordState, open: number): number {
  return state === "said" ? SAID_BID_CENTS : state === "yes" ? 100 : state === "no" ? 0 : open;
}

/** Cents of the held side: YES is worth the price, NO is worth its complement. */
function sideCents(card: SpecimenCard, yesCents: number): number {
  return card.position?.side === "no" ? 100 - yesCents : yesCents;
}

function sumMicro(cards: readonly SpecimenCard[], cents: (card: SpecimenCard) => number): bigint {
  return cards.reduce(
    (total, card) =>
      total + BigInt(Math.round(cents(card) * (card.position?.shares ?? 0))) * MICRO_PER_CENT,
    0n,
  );
}
