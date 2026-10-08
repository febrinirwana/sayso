import { Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useId, useRef, useState } from "react";
import { play } from "@/sound";
import { Voxel } from "@/ui/Voxel";
import { SectionHeading } from "./SectionHeading";
import { StickerToy } from "./StickerToy";

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: "Is it real money?",
    a: "No. SAYSO runs on Monad testnet with test coins. You get a starter balance when you sign in, and it has no cash value.",
  },
  {
    q: "How is it fair?",
    a: "Before trading opens, fingerprints of two independent transcripts are locked onchain. A word only counts when both transcripts heard it, and nothing can change after the lock.",
  },
  {
    q: "What is a passkey?",
    a: "The face, fingerprint or screen lock your phone already uses. It signs you in: no app, no password, no seed phrase. The same passkey on a new device brings back the same account.",
  },
  {
    q: "What if nobody says my word?",
    a: "It settles NO when the clip ends: YES pays 0¢ and NO pays 100¢. You can back NO from the start if you think a word won’t come up.",
  },
  {
    q: "Who settles the result?",
    a: "Chainlink CRE, a neutral network. It re-checks each word against both sealed transcripts and posts the result. We can show a word as SAID on screen, but only Chainlink can settle it.",
  },
];

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

/** Section 7: five short answers in an accessible accordion. */
export function Faq() {
  const section = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <section
      ref={section}
      id="faq"
      aria-labelledby="faq-title"
      className="relative mx-2 scroll-mt-20 rounded-[40px] border-2 border-ink bg-bubble-tint px-4 py-20 md:mx-4 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto grid max-w-[1360px] gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-20">
        <div>
          <SectionHeading
            id="faq-title"
            eyebrow="FAQ"
            title="Fair questions."
            lede="The five things everyone asks before their first round."
          />
          <Voxel
            name="mystery-box"
            size={256}
            className="mt-10 hidden size-56 -rotate-6 lg:block xl:size-64"
          />
        </div>
        <ul className="relative z-[2] flex flex-col gap-4">
          {FAQ.map((item, i) => {
            const expanded = open === i;
            const button = `${base}-q${i}`;
            const panel = `${base}-a${i}`;
            return (
              <li key={item.q} className="sticker overflow-hidden">
                <h3>
                  <button
                    id={button}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panel}
                    onClick={() => {
                      play("tap");
                      setOpen(expanded ? null : i);
                    }}
                    className="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-4 text-left font-headline text-[22px] leading-tight md:px-7 md:text-[26px]"
                  >
                    {item.q}
                    <motion.span
                      aria-hidden="true"
                      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-ink transition-colors duration-150 ${expanded ? "bg-ink text-paper" : "bg-card"}`}
                      animate={{ rotate: expanded ? 45 : 0 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                    >
                      <Plus size={20} strokeWidth={2.5} />
                    </motion.span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      id={panel}
                      role="region"
                      aria-labelledby={button}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.26, ease: EASE_OUT }}
                    >
                      <p className="max-w-[60ch] px-5 pb-6 text-lg leading-normal text-pretty text-ink-soft md:px-7">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
      </div>
      <StickerToy
        name="wtf-message"
        size={84}
        tilt={-8}
        bounds={section}
        className="right-[4%] -bottom-8 hidden md:block"
      />
      <StickerToy
        name="pixle"
        size={72}
        tilt={12}
        bounds={section}
        className="top-10 right-[8%] hidden lg:block"
      />
    </section>
  );
}
