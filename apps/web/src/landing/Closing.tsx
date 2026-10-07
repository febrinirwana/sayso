import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";
import { RevealGroup, RevealItem } from "./Reveal";

export function Closing() {
  return (
    <section
      aria-labelledby="closing-title"
      className="mx-auto max-w-6xl px-4 pt-8 pb-20 md:px-8 md:pb-28"
    >
      <RevealGroup className="sticker relative px-6 pt-20 pb-12 text-center md:px-12 md:py-24">
        <Voxel
          name="smiley-face"
          size={96}
          className="absolute -top-10 left-5 -rotate-6 md:-top-12 md:left-12 md:size-32"
        />
        <Voxel
          name="music-red"
          size={88}
          className="absolute -top-9 right-6 rotate-6 md:-top-12 md:right-14 md:size-28"
        />
        <RevealItem>
          <h2
            id="closing-title"
            className="font-display-wide mx-auto max-w-3xl text-[44px] leading-[0.95] text-balance md:text-[88px]"
          >
            Someone’s about to say something.
          </h2>
        </RevealItem>
        <RevealItem>
          <p className="mt-5 text-lg text-ink-soft md:text-xl">Get your words in before they do.</p>
        </RevealItem>
        <RevealItem className="mt-8 flex justify-center">
          <Button href="/arena" size="lg">
            Play now
          </Button>
        </RevealItem>
      </RevealGroup>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t-2 border-ink py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 text-sm text-ink-soft md:flex-row md:justify-between md:px-8">
        <Logo variant="full" height={28} className="h-7 w-auto" />
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          <TestnetPill />
          <span>No real money.</span>
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
