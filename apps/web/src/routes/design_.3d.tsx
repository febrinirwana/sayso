import { createFileRoute, notFound } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { LazyHeroScene, LazyWinBurst } from "@/three/Lazy";
import { BurstStickers, HeroStickers } from "@/three/Stickers";
import { Button } from "@/ui/Button";
import { TestnetPill } from "@/ui/TestnetPill";

export const Route = createFileRoute("/design_/3d")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: Design3d,
});

const FILL = "pointer-events-none absolute inset-0 h-full w-full";

function Design3d() {
  const [stickers, setStickers] = useState(false);
  const [burst, setBurst] = useState(0);
  const [settled, setSettled] = useState(false);

  const replay = () => {
    setSettled(false);
    setBurst((n) => n + 1);
  };

  return (
    <main className="min-h-dvh pb-24">
      <header className="mx-auto flex max-w-5xl flex-col gap-4 px-4 pt-10 pb-8">
        <p className="text-sm font-semibold tracking-[0.08em] text-ink-soft">DEV SPECIMEN</p>
        <h1 className="font-display-wide text-5xl leading-none md:text-6xl">Voxels in 3D</h1>
        <p className="max-w-prose text-ink-soft">
          The landing hero scene and the win burst, each on one transparent canvas over paper. The
          static stickers are what reduced motion and phones without WebGL see.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            aria-pressed={stickers}
            onClick={() => {
              setStickers((on) => !on);
              replay();
            }}
          >
            {stickers ? "Showing static stickers" : "Show static stickers"}
          </Button>
          <Button onClick={replay}>Replay win burst</Button>
        </div>
      </header>

      <Frame label="Phone hero · 412 px">
        <div className="sticker relative mx-auto h-[851px] w-full max-w-[412px] overflow-hidden bg-paper">
          {stickers ? <HeroStickers className={FILL} /> : <LazyHeroScene className={FILL} />}
          <HeroCopy size="phone" />
        </div>
      </Frame>

      <Frame label="Full-width hero" bleed>
        <div className="relative h-[calc(100svh-64px)] max-h-[920px] min-h-[640px] overflow-hidden border-y-2 border-ink">
          {stickers ? <HeroStickers className={FILL} /> : <LazyHeroScene className={FILL} />}
          <HeroCopy size="wide" />
        </div>
      </Frame>

      <Frame label={settled ? "Win burst · settled" : "Win burst · playing"}>
        <div className="sticker relative mx-auto aspect-square w-full max-w-[412px] overflow-hidden bg-paper">
          {stickers ? (
            <BurstStickers key={burst} className={FILL} onShown={() => setSettled(true)} />
          ) : (
            <LazyWinBurst key={burst} className={FILL} onDone={() => setSettled(true)} />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-semibold text-ink-soft">You won</p>
            <p className="font-display-wide tabular text-5xl leading-none text-gain">+12.40</p>
            <p className="flex items-center gap-2 text-sm font-semibold">
              AUSD <TestnetPill />
            </p>
          </div>
        </div>
      </Frame>
    </main>
  );
}

function Frame({
  label,
  bleed,
  children,
}: {
  label: string;
  bleed?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="mx-auto mb-3 max-w-5xl px-4 text-sm font-semibold text-ink-soft">{label}</h2>
      <div className={bleed ? "" : "px-4"}>{children}</div>
    </section>
  );
}

/** Stand-in for the landing copy so the frames show the voxels keeping clear of it. */
function HeroCopy({ size }: { size: "phone" | "wide" }) {
  const phone = size === "phone";
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 pb-[6vh]">
      <div className="flex max-w-[820px] flex-col items-center text-center">
        <p
          className={`font-display-wide leading-[0.92] text-balance ${phone ? "text-[54px]" : "text-[54px] md:text-[96px] lg:text-[108px]"}`}
        >
          Bet on the words before they're spoken.
        </p>
        <p className="mt-6 max-w-[34ch] text-lg text-ink-soft">
          Six words, one replayed clip. Back the ones you think get said, then watch them flip.
        </p>
        <div className="mt-8 flex gap-3">
          <span className="sticker inline-flex h-14 items-center rounded-full bg-ink px-7 font-display-wide text-lg text-paper">
            Play now
          </span>
          <span className="sticker inline-flex h-14 items-center rounded-full px-7 font-display-wide text-lg">
            How it works
          </span>
        </div>
      </div>
    </div>
  );
}
