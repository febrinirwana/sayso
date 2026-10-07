import type { MouseEvent } from "react";
import { LazyHeroScene } from "@/three/Lazy";
import { Button } from "@/ui/Button";

function scrollToHowItPlays(event: MouseEvent<HTMLAnchorElement>) {
  const target = document.getElementById("how-it-plays");
  if (!target) return;
  event.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", "#how-it-plays");
}

/** Full-bleed stage: the voxel scene fills the margins, the copy owns the centre band. */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex h-[calc(100svh-64px)] max-h-[780px] min-h-[640px] items-center overflow-hidden md:max-h-[920px]"
    >
      <LazyHeroScene className="pointer-events-none absolute inset-0 -z-10 h-full w-full" />
      <div className="mx-auto flex w-full max-w-[820px] flex-col items-center px-4 pb-[6vh] text-center">
        <h1
          id="hero-title"
          className="font-display-wide text-[clamp(40px,12.4vw,52px)] leading-[0.95] text-balance md:text-[96px] md:leading-[0.92] lg:text-[108px]"
        >
          Bet on the{" "}
          <span className="sticker relative mx-[0.04em] inline-block -rotate-2 px-[0.14em] pb-[0.06em] align-baseline">
            words
          </span>{" "}
          before they’re spoken.
        </h1>
        <p className="mt-6 max-w-[36ch] text-lg leading-normal text-balance text-ink-soft md:mt-8 md:max-w-[44ch] md:text-xl">
          Six words, one replayed clip. Back the ones you think get said, then watch them flip.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 md:mt-10">
          <Button href="/arena" size="lg">
            Play now
          </Button>
          <Button href="#how-it-plays" size="lg" variant="secondary" onClick={scrollToHowItPlays}>
            How it works
          </Button>
        </div>
        <p className="mt-6 text-sm text-ink-soft">Testnet play money. Sign in with a passkey.</p>
      </div>
    </section>
  );
}
