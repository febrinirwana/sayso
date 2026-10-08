import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect } from "react";
import { play } from "@/sound";
import { Voxel } from "@/ui/Voxel";

const SLIDE = { duration: 0.28, ease: [0.32, 0.72, 0, 1] } as const;

export type TicketDockProps = {
  /** The word the ticket is for; `null` shows the empty prompt. */
  word: string | null;
  children: ReactNode;
  className?: string;
};

/**
 * Desktop ticket: a panel docked under the clip that never moves the layout. Empty, it points at
 * the board; with a word it slides that word's ticket in and plays `sheet`.
 */
export function TicketDock({ word, children, className }: TicketDockProps) {
  const reduce = useReducedMotion() ?? false;
  useEffect(() => {
    if (word !== null) play("sheet");
  }, [word]);

  return (
    <section
      aria-label={word === null ? "Ticket" : `Ticket: ${word}`}
      className={`sticker relative grid overflow-hidden shadow-sticker-lg ${className ?? ""}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={word ?? "empty"}
          className="min-h-0 overflow-y-auto overscroll-contain p-4 xl:p-5"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, x: -40 }}
          transition={SLIDE}
        >
          {word === null ? <EmptyDock /> : children}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

function EmptyDock() {
  return (
    <div className="flex h-full items-center gap-5 bg-[radial-gradient(circle,rgb(10_10_10/0.07)_1.5px,transparent_1.6px)] bg-size-[16px_16px] px-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-soft">
          Your ticket
        </p>
        <p className="font-headline mt-1 text-[28px] leading-[1.05] xl:text-[34px]">
          Pick a word card.
        </p>
        <p className="mt-2 max-w-[34ch] text-[14px] leading-5 text-ink-soft">
          YES if you think it gets said before the clip ends, NO if you think it won't.
        </p>
      </div>
      <Voxel name="pink-arrow" size={112} className="size-24 shrink-0 rotate-[50deg] xl:size-28" />
    </div>
  );
}
