import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useRef, useState } from "react";
import mascotUrl from "@/assets/brand/mascot-640.webp";
import { play } from "@/sound";
import { sendSignal, useStageReady } from "@/three/registry";
import { useStageSlot } from "@/three/Slot";
import { HeroStickers } from "@/three/Stickers";
import { Button } from "@/ui/Button";
import { TestnetPill } from "@/ui/TestnetPill";
import { StickerToy } from "./StickerToy";
import { scrollToSection } from "./scroll";
import { WordTicker } from "./WordTicker";

/** Stage slot id for the hero; the mascot listens for `boop` and `talk` on it. */
const HERO_SLOT = "hero";

const BOOPS = ["Boop!", "MOON!", "Say it!", "Hehe", "PIZZA?!", "Again!", "SAID!"] as const;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const enter = (delay: number) => ({
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE_OUT, delay },
});

/**
 * S0 hero: giant headline and CTAs on one side, the 3D mascot on the other, voxels scattered
 * across the whole hero. Phones stack the mascot band above the copy.
 */
export function Hero() {
  const section = useRef<HTMLElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const mascot = useRef<HTMLDivElement>(null);
  const live = useStageSlot(art, HERO_SLOT, { kind: "hero", mascot });
  const ready = useStageReady();
  const reduced = useReducedMotion() === true;
  const showStatic = !live || !ready;
  const [boop, setBoop] = useState(0);
  const [bubble, setBubble] = useState(false);

  useEffect(() => {
    if (boop === 0) return;
    setBubble(true);
    const id = window.setTimeout(() => setBubble(false), 1400);
    return () => window.clearTimeout(id);
  }, [boop]);

  const onBoop = () => {
    play("pop");
    sendSignal(HERO_SLOT, "boop");
    setBoop((n) => n + 1);
  };

  return (
    <section
      ref={section}
      aria-labelledby="hero-title"
      className="relative overflow-hidden bg-paper lg:min-h-[calc(100svh-72px)]"
    >
      {/* Art box: the whole hero on desktop, the band above the copy on phones. */}
      <div
        ref={art}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[var(--band)] [--band:clamp(240px,30svh,320px)] md:[--band:clamp(280px,38svh,400px)] lg:inset-0 lg:h-auto"
      >
        <HeroStickers
          className="size-full transition-opacity duration-300 ease-out"
          style={{ opacity: showStatic ? 1 : 0 }}
        />
      </div>

      <div className="relative z-[2] grid px-6 pb-14 md:px-8 lg:min-h-[calc(100svh-72px)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-center lg:gap-8 lg:px-12 lg:pb-10 2xl:gap-12">
        {/* Mascot column: a square anchor the 3D mascot sits on, plus the tap target. */}
        <div className="relative flex h-[clamp(240px,30svh,320px)] items-center justify-center md:h-[clamp(280px,38svh,400px)] lg:order-2 lg:h-auto lg:py-10">
          <div
            ref={mascot}
            className="relative aspect-square w-[min(56vw,86%)] md:w-[min(46vw,320px)] lg:w-[min(100%,68svh)] 2xl:w-[min(100%,76svh)]"
          >
            <motion.img
              src={mascotUrl}
              alt=""
              width={640}
              height={640}
              draggable={false}
              className="absolute inset-[3%] size-[94%] select-none transition-opacity duration-300 ease-out"
              style={{ opacity: showStatic ? 1 : 0 }}
              initial={reduced ? false : { scale: 0.7, y: -40 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ type: "spring", duration: 0.7, bounce: 0.45, delay: 0.15 }}
            />
            <button
              type="button"
              aria-label="Boop the SaySo mascot"
              onClick={onBoop}
              className="absolute inset-[12%] cursor-pointer rounded-full"
            />
            <BoopBubble count={boop} shown={bubble} />
          </div>
        </div>

        {/* Copy column. */}
        <div className="relative min-w-0 lg:order-1 lg:py-12">
          <motion.div {...enter(0.05)} className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-8 -rotate-2 items-center gap-2 rounded-full border-2 border-ink bg-sun px-3.5 text-sm font-bold shadow-sticker">
              The word-calling game show
            </span>
            <TestnetPill />
          </motion.div>

          <h1
            id="hero-title"
            className="mt-5 max-w-[11ch] font-headline text-[clamp(48px,12.6vw,64px)] leading-[0.92] text-balance md:text-[clamp(64px,8.6vw,88px)] lg:mt-7 lg:text-[clamp(80px,6.9vw,160px)] lg:leading-[0.9]"
          >
            <Words text="Bet on the" delay={0.1} />{" "}
            <motion.span
              className="relative inline-block rounded-[0.18em] border-2 border-ink bg-card px-[0.12em] pb-[0.04em] shadow-sticker"
              initial={{ opacity: 0, rotate: 0, scale: 0.8 }}
              animate={{ opacity: 1, rotate: -2.5, scale: 1 }}
              transition={{ type: "spring", duration: 0.6, bounce: 0.5, delay: 0.32 }}
            >
              words
            </motion.span>{" "}
            <Words text="before they’re" delay={0.4} />{" "}
            <Words text="spoken." delay={0.55} className="text-said" />
          </h1>

          <motion.p
            {...enter(0.6)}
            className="mt-6 max-w-[34ch] text-lg leading-normal text-pretty text-ink-soft md:text-xl lg:mt-8 lg:text-[22px]"
          >
            Six words, one replayed clip. Back the ones you think get said, then watch them flip
            SAID live.
          </motion.p>

          <motion.div {...enter(0.7)} className="mt-8 flex flex-wrap items-center gap-3 lg:mt-10">
            <Button href="/arena" variant="brand" size="xl" className="max-md:h-14 max-md:px-5">
              Play now
            </Button>
            <Button
              href="#how-it-plays"
              variant="secondary"
              size="xl"
              className="max-md:h-14 max-md:px-5"
              onClick={(event) => scrollToSection(event, "how-it-plays")}
            >
              How it works
            </Button>
          </motion.div>

          <motion.div {...enter(0.85)} className="mt-8 lg:mt-10">
            <p className="mb-3 text-sm font-semibold text-ink-soft">
              Sample board · words flip the moment they’re said
            </p>
            <WordTicker onSaid={() => sendSignal(HERO_SLOT, "talk")} />
          </motion.div>
        </div>
      </div>

      <StickerToy
        name="omg-message"
        size={84}
        tilt={-10}
        bounds={section}
        className="bottom-6 left-[46%] hidden xl:block"
      />
      <StickerToy
        name="like-message"
        size={76}
        tilt={8}
        bounds={section}
        className="top-[3%] left-[52%] hidden lg:block"
      />
    </section>
  );
}

/** Headline words rise in one by one; spaces stay real text for wrapping and screen readers. */
function Words({ text, delay, className }: { text: string; delay: number; className?: string }) {
  return text.split(" ").map((word, i, all) => (
    <Fragment key={word}>
      <span className="inline-block overflow-hidden pb-[0.08em] align-bottom">
        <motion.span
          className={`inline-block ${className ?? ""}`}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT, delay: delay + i * 0.06 }}
        >
          {word}
        </motion.span>
      </span>
      {i < all.length - 1 ? " " : null}
    </Fragment>
  ));
}

/** A speech bubble that pops out of the mascot on each boop, then floats away. */
function BoopBubble({ count, shown }: { count: number; shown: boolean }) {
  return (
    <AnimatePresence>
      {shown && (
        <motion.span
          key={count}
          role="status"
          className="pointer-events-none absolute top-[2%] left-[-4%] z-[3] rounded-[20px] border-2 border-ink bg-card px-4 py-2 font-headline text-2xl whitespace-nowrap shadow-sticker md:text-3xl"
          initial={{ opacity: 0, scale: 0.6, rotate: -14, x: 40, y: 30 }}
          animate={{ opacity: 1, scale: 1, rotate: -6, x: 0, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -16, transition: { duration: 0.2 } }}
          transition={{ type: "spring", duration: 0.45, bounce: 0.5 }}
        >
          {BOOPS[count % BOOPS.length]}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
