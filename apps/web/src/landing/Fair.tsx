import { motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, useRef } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { Voxel } from "@/ui/Voxel";
import { SectionHeading } from "./SectionHeading";
import { StickerToy } from "./StickerToy";

type Stage = {
  when: string;
  title: string;
  body: string;
  art: readonly VoxelName[];
  extra?: ReactNode;
};

const STAGES: readonly Stage[] = [
  {
    when: "Before the episode",
    title: "Two transcripts",
    body: "Two different speech engines write down every word of the clip, separately.",
    art: ["computer", "cd-player"],
  },
  {
    when: "Before the first trade",
    title: "Sealed onchain",
    body: "A fingerprint of each transcript is locked on Monad. After that, nobody can change the answers. Not even us.",
    art: ["mystery-box"],
    extra: (
      <span className="mt-4 flex flex-wrap gap-1.5 font-mono text-[12px]">
        <span className="rounded-md border-2 border-ink bg-card px-1.5 py-0.5">A · 7f3a…e1c9</span>
        <span className="rounded-md border-2 border-ink bg-card px-1.5 py-0.5">B · 91c2…0b44</span>
      </span>
    ),
  },
  {
    when: "During the clip",
    title: "SAID in one block",
    body: "The moment a word is spoken, its card flips for every player at once, within a single Monad block.",
    art: ["zap"],
  },
  {
    when: "After the clip",
    title: "Chainlink settles",
    body: "Chainlink CRE checks each word against both sealed transcripts and pays out. Only it can.",
    art: ["globe"],
  },
];

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Section 5: the commit-then-settle pipeline, drawn left to right (top to bottom on phones). */
export function Fair() {
  const section = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const inView = useInView(list, { once: true, amount: 0.25 });
  const visible = useInView(section);
  const reduced = useReducedMotion() === true;
  return (
    <section
      ref={section}
      id="fair"
      aria-labelledby="fair-title"
      className="relative mx-2 mt-6 scroll-mt-20 rounded-[40px] border-2 border-ink bg-mint-tint px-6 py-20 md:mx-4 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1520px]">
        <SectionHeading
          id="fair-title"
          eyebrow="Fair by construction"
          title="Nobody can peek. Nobody can rewrite."
          lede="The answers are locked in before anyone trades, and a neutral network settles them. Here is the whole trip."
        />

        <Track on={inView} running={visible} reduced={reduced} />
        <ol
          ref={list}
          className="relative z-[2] mt-14 grid gap-5 md:mt-20 lg:mt-6 lg:grid-cols-4 lg:gap-6"
        >
          {STAGES.map((stage, i) => (
            <li key={stage.title} className="relative flex lg:block">
              {i < STAGES.length - 1 && <Connector index={i} on={inView} />}
              <motion.article
                className="sticker relative ml-14 flex-1 p-5 md:p-6 lg:ml-0 lg:h-full"
                initial={{ opacity: 0, y: 32 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, ease: EASE_OUT, delay: i * 0.28 }}
              >
                <div className="flex h-20 items-end gap-1">
                  {stage.art.map((name, k) => (
                    <motion.div
                      key={name}
                      initial={{ scale: 0.6, rotate: -12 }}
                      animate={inView ? { scale: 1, rotate: k === 0 ? -4 : 6 } : {}}
                      transition={{
                        type: "spring",
                        duration: 0.6,
                        bounce: 0.5,
                        delay: i * 0.28 + 0.15,
                      }}
                    >
                      <Voxel name={name} size={80} className="size-20" />
                    </motion.div>
                  ))}
                </div>
                <p className="mt-4 text-xs font-bold tracking-[0.08em] text-ink-soft uppercase">
                  {stage.when}
                </p>
                <h3 className="mt-1 font-headline text-[26px] leading-[1.05] md:text-[28px]">
                  {stage.title}
                </h3>
                <p className="mt-2 leading-normal text-pretty text-ink-soft">{stage.body}</p>
                {stage.extra}
              </motion.article>
              <span
                aria-hidden="true"
                className="absolute top-6 left-0 inline-flex size-10 items-center justify-center rounded-full border-2 border-ink bg-ink font-headline text-lg text-paper lg:hidden"
              >
                {i + 1}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <StickerToy
        name="skull"
        size={76}
        tilt={-10}
        bounds={section}
        className="top-14 right-[7%] hidden md:block"
      />
    </section>
  );
}

/** Phones: a vertical ink line from one numbered stage to the next. */
function Connector({ index, on }: { index: number; on: boolean }) {
  return (
    <motion.div
      aria-hidden="true"
      className="absolute top-16 bottom-[-20px] left-[19px] w-0.5 origin-top bg-ink lg:hidden"
      initial={{ scaleY: 0 }}
      animate={on ? { scaleY: 1 } : {}}
      transition={{ duration: 0.35, ease: EASE_OUT, delay: index * 0.28 + 0.35 }}
    />
  );
}

const RIDE = { duration: 3.4, delay: 1.6, repeat: Number.POSITIVE_INFINITY, repeatDelay: 0.6 };

/**
 * Desktop: a lane above the cards with one numbered stop per stage, drawn left to right as the
 * stages land, and a red word chip that keeps riding from transcript to settlement.
 */
function Track({ on, running, reduced }: { on: boolean; running: boolean; reduced: boolean }) {
  return (
    <div aria-hidden="true" className="relative z-[2] mt-20 hidden h-11 lg:block">
      <div className="absolute top-1/2 right-[12.5%] left-[12.5%] h-1 -translate-y-1/2">
        <motion.div
          className="size-full origin-left rounded-full bg-ink"
          initial={{ scaleX: 0 }}
          animate={on ? { scaleX: 1 } : {}}
          transition={{ duration: 1.1, ease: EASE_OUT, delay: 0.3 }}
        />
        {!reduced && on && running && (
          <motion.div
            className="absolute inset-0"
            initial={{ x: "0%", opacity: 0 }}
            animate={{ x: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
            transition={{
              x: { ...RIDE, ease: "easeInOut" },
              opacity: { ...RIDE, times: [0, 0.06, 0.94, 1] },
            }}
          >
            <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-said px-3 py-1.5 font-headline text-[15px] leading-none whitespace-nowrap shadow-sticker">
              MOON
            </span>
          </motion.div>
        )}
      </div>
      <div className="grid h-full grid-cols-4 gap-6">
        {STAGES.map((stage, i) => (
          <div key={stage.title} className="flex items-center justify-center">
            <motion.span
              className="relative inline-flex size-11 items-center justify-center rounded-full border-2 border-ink bg-ink font-headline text-lg text-paper"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={on ? { scale: 1, opacity: 1 } : {}}
              transition={{ type: "spring", duration: 0.5, bounce: 0.5, delay: 0.3 + i * 0.28 }}
            >
              {i + 1}
            </motion.span>
          </div>
        ))}
      </div>
    </div>
  );
}
