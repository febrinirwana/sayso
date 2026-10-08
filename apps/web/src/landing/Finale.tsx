import { useRef } from "react";
import { PlayLink } from "@/account/PlayLink";
import { StageSlot } from "@/three/Slot";
import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";
import { RevealGroup, RevealItem } from "./Reveal";
import { StickerToy } from "./StickerToy";
import { scrollToSection } from "./scroll";

/** Section 8: the last call, with the big 3D star sliding in from the right edge. */
export function Finale() {
  const section = useRef<HTMLElement>(null);
  return (
    <section
      ref={section}
      aria-labelledby="finale-title"
      className="relative mx-2 mt-6 overflow-hidden rounded-[40px] border-2 border-ink bg-ink px-6 py-20 text-paper md:mx-4 md:px-8 md:py-28 lg:px-12 lg:py-36"
    >
      <StageSlot
        scene={{ kind: "finale" }}
        rollOnTouch
        className="absolute top-[4%] right-0 h-[46%] w-full cursor-pointer md:h-[52%] lg:top-0 lg:h-full lg:w-[52%]"
        fallback={
          <div className="flex size-full items-center justify-center">
            <Voxel name="star" size={256} className="w-[46%] max-w-80 -rotate-6" />
          </div>
        }
      />
      <div className="mx-auto max-w-[1520px] pt-[44vw] md:pt-[42vw] lg:pt-0">
        <RevealGroup className="relative z-[2] max-w-[720px]">
          <RevealItem>
            <h2
              id="finale-title"
              className="font-headline text-[clamp(52px,8.4vw,124px)] leading-[0.92] text-balance"
            >
              Someone’s about to say <span className="text-said">something.</span>
            </h2>
          </RevealItem>
          <RevealItem>
            <p className="mt-6 max-w-[34ch] text-xl leading-normal text-paper/80 md:text-[22px]">
              Get your words in before they do. Free to play on testnet, sign in with a passkey.
            </p>
          </RevealItem>
          <RevealItem className="mt-10 flex flex-wrap items-center gap-3">
            <PlayLink variant="brand" size="xl">
              Play now
            </PlayLink>
            <Button
              href="#try-it"
              variant="secondary"
              size="xl"
              onClick={(event) => scrollToSection(event, "try-it")}
            >
              Try the demo
            </Button>
          </RevealItem>
        </RevealGroup>
      </div>
      <StickerToy
        name="red-alien"
        size={84}
        tilt={-10}
        bounds={section}
        className="bottom-8 left-[48%] hidden lg:block"
      />
    </section>
  );
}

export function Footer() {
  return (
    <footer className="px-6 py-10 md:px-8 lg:px-12">
      <div className="mx-auto flex max-w-[1520px] flex-col items-center gap-5 text-sm text-ink-soft md:flex-row md:justify-between">
        <Logo variant="full" height={32} className="h-8 w-auto" />
        <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <TestnetPill />
          <span>Play money on Monad testnet. No real money.</span>
          <span>
            Sound effects:{" "}
            <a
              href="https://elevenlabs.io"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center font-semibold text-ink underline decoration-2 underline-offset-4"
            >
              elevenlabs.io
            </a>
          </span>
        </p>
      </div>
    </footer>
  );
}
