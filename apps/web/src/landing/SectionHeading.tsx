import type { ReactNode } from "react";
import { RevealGroup, RevealItem } from "./Reveal";

type SectionHeadingProps = {
  id: string;
  /** Short tag above the title, set as a tilted sticker. */
  eyebrow: string;
  title: ReactNode;
  /** One plain sentence under the title. */
  lede: ReactNode;
  /** Small label beside the eyebrow, e.g. the Demo or TESTNET pill. */
  badge?: ReactNode;
  align?: "start" | "center";
  className?: string;
};

export function SectionHeading({
  id,
  eyebrow,
  title,
  lede,
  badge,
  align = "start",
  className,
}: SectionHeadingProps) {
  const centred = align === "center";
  return (
    <RevealGroup
      className={`relative z-[2] ${centred ? "mx-auto max-w-3xl text-center" : "max-w-3xl"} ${className ?? ""}`}
    >
      <RevealItem
        className={`flex flex-wrap items-center gap-2 ${centred ? "justify-center" : ""}`}
      >
        <span className="inline-flex h-8 -rotate-2 items-center rounded-full border-2 border-ink bg-card px-3.5 text-sm font-bold tracking-[0.02em] shadow-sticker">
          {eyebrow}
        </span>
        {badge}
      </RevealItem>
      <RevealItem>
        <h2
          id={id}
          className="mt-5 font-headline text-[clamp(44px,7vw,88px)] leading-[0.95] text-balance"
        >
          {title}
        </h2>
      </RevealItem>
      <RevealItem>
        <p
          className={`mt-5 max-w-[46ch] text-lg leading-normal text-pretty text-ink-soft md:text-xl ${centred ? "mx-auto" : ""}`}
        >
          {lede}
        </p>
      </RevealItem>
    </RevealGroup>
  );
}
