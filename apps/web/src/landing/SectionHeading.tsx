import type { ReactNode } from "react";
import { RevealGroup, RevealItem } from "./Reveal";

type SectionHeadingProps = {
  id: string;
  title: string;
  /** One plain sentence under the title. */
  lede: ReactNode;
  /** Small label beside the title, e.g. the Demo pill. */
  badge?: ReactNode;
  align?: "start" | "center";
};

export function SectionHeading({ id, title, lede, badge, align = "start" }: SectionHeadingProps) {
  const centred = align === "center";
  return (
    <RevealGroup className={centred ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <RevealItem className={`flex items-center gap-3 ${centred ? "justify-center" : ""}`}>
        <h2
          id={id}
          className="font-display-wide text-[40px] leading-[0.95] text-balance md:text-7xl"
        >
          {title}
        </h2>
        {badge}
      </RevealItem>
      <RevealItem>
        <p className="mt-4 text-lg leading-normal text-ink-soft md:mt-5 md:text-xl">{lede}</p>
      </RevealItem>
    </RevealGroup>
  );
}
