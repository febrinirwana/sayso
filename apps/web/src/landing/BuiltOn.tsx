import { motion } from "motion/react";
import { useRef } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { Voxel } from "@/ui/Voxel";
import { RevealGroup, RevealItem } from "./Reveal";
import { SectionHeading } from "./SectionHeading";
import { StickerToy } from "./StickerToy";

/** Typographic stickers with voxel art: no third-party logo files. */
const STACK: readonly { name: string; job: string; art: VoxelName; tilt: number }[] = [
  {
    name: "Monad",
    job: "The fast network every trade and every SAID flip lands on.",
    art: "zap",
    tilt: -2.5,
  },
  {
    name: "Kuru",
    job: "Runs a live price board for each of the six words.",
    art: "money-2",
    tilt: 2,
  },
  {
    name: "Chainlink CRE",
    job: "The neutral referee: checks both transcripts and settles.",
    art: "globe",
    tilt: -1.5,
  },
  {
    name: "Mera",
    job: "Passkey sign-in: your face or fingerprint, no wallet app.",
    art: "smiley-face",
    tilt: 2.5,
  },
  {
    name: "Envio",
    job: "Keeps the board, results and leaderboard live.",
    art: "computer",
    tilt: -2,
  },
];

/** Section 6: who does what under the hood, one line each. */
export function BuiltOn() {
  const section = useRef<HTMLElement>(null);
  return (
    <section
      ref={section}
      aria-labelledby="built-on-title"
      className="relative px-4 py-24 md:px-8 md:py-32 lg:px-12"
    >
      <div className="mx-auto max-w-[1360px]">
        <SectionHeading
          id="built-on-title"
          eyebrow="Built on"
          align="center"
          title="Five pieces, one game show."
          lede="Each one has a single job here."
        />
        <RevealGroup className="relative z-[2] mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 md:mt-20 lg:grid-cols-5 lg:gap-5">
          {STACK.map((item) => (
            <RevealItem key={item.name}>
              <motion.article
                className="sticker flex h-full flex-col p-5 md:p-6"
                style={{ rotate: item.tilt }}
                whileHover={{ rotate: 0, y: -4 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
              >
                <Voxel
                  name={item.art}
                  size={72}
                  className="-mt-12 size-[72px] md:-mt-14 md:size-20"
                />
                <h3 className="mt-3 font-headline text-[26px] leading-none md:text-[28px]">
                  {item.name}
                </h3>
                <p className="mt-2 leading-normal text-pretty text-ink-soft">{item.job}</p>
              </motion.article>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
      <StickerToy
        name="cd-player"
        size={80}
        tilt={8}
        bounds={section}
        className="top-20 left-[6%] hidden md:block"
      />
      <StickerToy
        name="game-console"
        size={84}
        tilt={-10}
        bounds={section}
        className="top-28 right-[6%] hidden md:block"
      />
    </section>
  );
}
