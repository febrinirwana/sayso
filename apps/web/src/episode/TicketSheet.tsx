import { AnimatePresence, motion, type PanInfo, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { play } from "@/sound";

const DRAWER = { duration: 0.28, ease: [0.32, 0.72, 0, 1] } as const;
/** Drag past this many px, or flick faster than this many px/s, and the sheet closes. */
const DISMISS_OFFSET = 96;
const DISMISS_VELOCITY = 500;

/**
 * Phone and tablet ticket: a bottom sheet over a dimmed screen. Drag it down, tap outside or press
 * Escape to close. Plays `sheet` whenever it opens on a word. `word` keys the content so each word
 * opens fresh.
 */
export function TicketSheet({
  word,
  onClose,
  children,
}: {
  /** The word the ticket is for; `null` hides the sheet. */
  word: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (word === null) return;
    play("sheet");
    opener.current ??= document.activeElement;
    sheet.current?.focus({ preventScroll: true });
  }, [word]);

  useEffect(() => {
    if (word !== null) return;
    if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true });
    opener.current = null;
  }, [word]);

  useEffect(() => {
    if (word === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [word, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) onClose();
  };

  return (
    <AnimatePresence>
      {word !== null ? (
        <motion.div
          key="backdrop"
          aria-hidden
          className="fixed inset-0 z-50 bg-ink/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={DRAWER}
          onClick={onClose}
        />
      ) : null}
      {word !== null ? (
        <motion.div
          key="sheet"
          ref={sheet}
          role="dialog"
          aria-modal="true"
          aria-label={`Ticket: ${word}`}
          tabIndex={-1}
          className="fixed inset-x-0 bottom-0 z-[60] mx-auto max-h-[92dvh] w-full max-w-[560px] touch-none overflow-y-auto rounded-t-sheet border-2 border-b-0 border-ink bg-card px-4 pt-2 pb-[max(20px,env(safe-area-inset-bottom))] shadow-[0_-10px_0_rgb(10_10_10/0.08)] outline-none md:px-6"
          initial={reduce ? { opacity: 0 } : { y: "100%" }}
          animate={reduce ? { opacity: 1 } : { y: 0 }}
          exit={reduce ? { opacity: 0 } : { y: "100%" }}
          transition={DRAWER}
          drag={reduce ? false : "y"}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.04, bottom: 0.7 }}
          dragSnapToOrigin
          onDragEnd={onDragEnd}
        >
          <div aria-hidden className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink/25" />
          <motion.div
            key={word}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: DRAWER.ease }}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
