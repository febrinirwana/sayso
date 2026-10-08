import { AnimatePresence, motion } from "motion/react";
import markUrl from "@/assets/brand/mark.webp";
import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";

/** 0 pick words, 1 watch the clip, 2 the word flips SAID, 3 cash out or hold. */
export type RoundStep = 0 | 1 | 2 | 3;

const BOARD = [
  { word: "MOON", cents: 42 },
  { word: "PIZZA", cents: 61 },
  { word: "CHAMPION", cents: 27 },
  { word: "OOPS", cents: 73 },
  { word: "TACO", cents: 55 },
  { word: "LEGEND", cents: 18 },
] as const;

const CAPTION = "…honestly, next stop is the moon.";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/**
 * A simplified episode screen that acts out one step of a round. `framed` wraps it in a phone
 * shell for the desktop scroll story; unframed it sits inside a step card on phones.
 */
export function RoundMockup({ step, framed = false }: { step: RoundStep; framed?: boolean }) {
  const said = step >= 2;
  const body = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <img src={markUrl} alt="" width={28} height={28} className="size-7" />
        <span className="font-headline text-[15px]">Episode 7</span>
        <TestnetPill className="ml-auto h-6 px-2 text-[10px]" />
      </div>

      {/* Clip */}
      <div className="relative aspect-video overflow-hidden rounded-2xl border-2 border-ink bg-sky">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_35%,#8b8ef5_0,transparent_55%)]" />
        <Voxel
          name="alien"
          size={96}
          className="absolute bottom-0 left-1/2 size-[46%] -translate-x-1/2 translate-y-[8%]"
        />
        <span
          className={`absolute top-2 left-2 inline-flex h-6 items-center rounded-full border-2 border-ink px-2 text-[11px] font-bold tracking-[0.08em] transition-colors duration-200 ${
            step >= 1 ? "bg-said text-ink" : "bg-card text-ink"
          }`}
        >
          {step >= 1 ? "LIVE" : "0:42"}
        </span>
        <AnimatePresence>
          {step >= 1 && (
            <motion.p
              key="caption"
              className="absolute inset-x-2 bottom-2 rounded-lg bg-ink/85 px-2 py-1 text-center text-[12px] font-semibold text-white"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
            >
              {step === 1 ? CAPTION.slice(0, 22) : CAPTION}
              {step === 1 && <span className="animate-pulse">▍</span>}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Board */}
      <div className="grid grid-cols-3 gap-2">
        {BOARD.map((card, i) => {
          const picked = i === 0;
          const flipped = picked && said;
          return (
            <div key={card.word} className="relative h-[58px] [perspective:500px]">
              <motion.div
                className="relative size-full [transform-style:preserve-3d]"
                initial={false}
                animate={{ rotateX: flipped ? -180 : 0 }}
                transition={{ type: "spring", duration: 0.45, bounce: 0.25 }}
              >
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 border-ink bg-card [backface-visibility:hidden] ${
                    picked && step === 0 ? "outline-[3px] outline-offset-2 outline-sky outline" : ""
                  }`}
                >
                  <span className="font-headline text-[12px] leading-none">{card.word}</span>
                  <span className="tabular mt-1 text-[12px] font-semibold text-ink-soft">
                    {card.cents}¢
                  </span>
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl border-2 border-ink bg-said [backface-visibility:hidden] [transform:rotateX(180deg)]">
                  <span className="font-headline text-[12px] leading-none">{card.word}</span>
                  <span className="mt-1 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-[0.08em] text-white">
                    SAID
                  </span>
                </div>
              </motion.div>
              <AnimatePresence>
                {flipped && step === 2 && (
                  <motion.div
                    className="absolute -top-8 -right-6 z-10"
                    initial={{ opacity: 0, scale: 0.6, rotate: -20, y: 12 }}
                    animate={{ opacity: 1, scale: 1, rotate: 8, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", duration: 0.6, bounce: 0.5, delay: 0.25 }}
                  >
                    <Voxel name="omg-message" size={56} className="size-14" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Step-specific tray */}
      <div className="relative h-[92px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            className="absolute inset-0"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
          >
            <Tray step={step} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  if (!framed) return body;
  return (
    <div className="relative mx-auto w-[340px] rounded-[44px] border-2 border-ink bg-ink p-2.5 shadow-[0_10px_0_var(--color-ink),0_30px_60px_-24px_rgb(10_10_10/0.45)]">
      <div className="rounded-[34px] bg-paper px-4 pt-5 pb-4">{body}</div>
    </div>
  );
}

function Tray({ step }: { step: RoundStep }) {
  const sheet = "flex h-full items-center gap-3 rounded-2xl border-2 border-ink bg-card px-3";
  switch (step) {
    case 0:
      return (
        <div className={sheet}>
          <div className="min-w-0 flex-1">
            <p className="font-headline text-[15px] leading-tight">YES on MOON</p>
            <p className="tabular text-[12px] text-ink-soft">42¢ now · pays 100¢ if said</p>
          </div>
          <span className="inline-flex h-11 items-center rounded-full border-2 border-ink bg-ink px-4 font-headline text-[14px] text-paper">
            Buy
          </span>
        </div>
      );
    case 1:
      return (
        <div className={sheet}>
          <Voxel name="music-red" size={48} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-headline text-[15px] leading-tight">Listening…</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full border-2 border-ink bg-paper">
              <motion.div
                className="h-full origin-left bg-ink"
                initial={{ scaleX: 0.15 }}
                animate={{ scaleX: 0.7 }}
                transition={{ duration: 3, ease: "linear" }}
              />
            </div>
          </div>
        </div>
      );
    case 2:
      return (
        <div className={`${sheet} bg-said-tint`}>
          <Voxel name="zap" size={48} className="size-12 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-headline text-[15px] leading-tight">MOON was said!</p>
            <p className="tabular text-[12px] text-ink-soft">Flipped within one block</p>
          </div>
        </div>
      );
    case 3:
      return (
        <div className={`${sheet} justify-between`}>
          <div>
            <p className="font-headline text-[15px] leading-tight">Cash out 98¢</p>
            <p className="tabular text-[12px] text-gain">+56¢ on 42¢</p>
          </div>
          <div className="flex gap-1.5">
            <span className="inline-flex h-11 items-center rounded-full border-2 border-ink bg-card px-3 font-headline text-[13px]">
              Hold
            </span>
            <span className="inline-flex h-11 items-center rounded-full border-2 border-ink bg-ink px-3 font-headline text-[13px] text-paper">
              Cash out
            </span>
          </div>
        </div>
      );
  }
}
