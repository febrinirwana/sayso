import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import type { IconMotion } from "@/three/registry";
import { StageSlot } from "@/three/Slot";
import type { VoxelMeshName } from "@/three/voxels";
import { Voxel } from "@/ui/Voxel";
import { RevealGroup, RevealItem } from "./Reveal";
import { RoundMockup, type RoundStep } from "./RoundMockup";
import { SectionHeading } from "./SectionHeading";
import { StickerToy } from "./StickerToy";

type Step = {
  title: string;
  body: string;
  icon: VoxelMeshName & VoxelName;
  motion: IconMotion;
  tint: string;
};

const STEPS: readonly Step[] = [
  {
    title: "Pick your words",
    body: "Six words sit on the board, each priced 1¢ to 99¢: the crowd’s odds it gets said. Back the ones you believe in.",
    icon: "pink-arrow",
    motion: "rock",
    tint: "bg-bubble-tint",
  },
  {
    title: "Watch the clip",
    body: "The clip replays for everyone at once. Prices move as players change their minds.",
    icon: "music-red",
    motion: "wobble",
    tint: "bg-sun-tint",
  },
  {
    title: "It flips SAID",
    body: "The moment a word is spoken, its card flips SAID within one Monad block, for every player at once.",
    icon: "zap",
    motion: "rock",
    tint: "bg-said-tint",
  },
  {
    title: "Cash out or hold",
    body: "Cash out a SAID word at 98¢ on the spot, or hold to the end: said words pay 100¢, the rest 0¢.",
    icon: "money-1",
    motion: "spin",
    tint: "bg-mint-tint",
  },
];

/**
 * Section 3. Desktop: a sticky phone acts out the step whose card is centred in the viewport.
 * Phones: stacked cards, each with its own little board.
 */
export function HowItPlays() {
  const section = useRef<HTMLElement>(null);
  const [active, setActive] = useState<RoundStep>(0);
  return (
    <section
      ref={section}
      id="how-it-plays"
      aria-labelledby="how-it-plays-title"
      className="relative mx-2 scroll-mt-20 rounded-[40px] border-2 border-ink bg-sky-tint px-6 py-20 md:mx-4 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1520px]">
        <SectionHeading
          id="how-it-plays-title"
          eyebrow="How a round plays"
          title="Four beats. About as long as the clip."
          lede="No charts, no jargon. You read the room, call the words, and watch them land."
        />

        <div className="mt-16 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16 xl:gap-24">
          <div className="hidden lg:block">
            <div className="sticky top-[calc(50svh-300px)] flex justify-center py-12">
              <RoundMockup step={active} framed />
            </div>
          </div>

          <ol className="flex flex-col gap-24 lg:gap-0">
            {STEPS.map((step, i) => (
              <StepCard
                key={step.title}
                step={step}
                index={i as RoundStep}
                onActive={() => setActive(i as RoundStep)}
              />
            ))}
          </ol>
        </div>
      </div>

      <StickerToy
        name="pizza"
        size={88}
        tilt={-12}
        bounds={section}
        className="top-16 right-[6%] hidden md:block"
      />
      <StickerToy
        name="duck"
        size={80}
        tilt={10}
        bounds={section}
        className="bottom-10 left-[5%] hidden lg:block"
      />
    </section>
  );
}

function StepCard({
  step,
  index,
  onActive,
}: {
  step: Step;
  index: RoundStep;
  onActive: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  // Active while the card crosses the middle fifth of the viewport.
  const centred = useInView(ref, { margin: "-40% 0px -40% 0px" });
  const activeRef = useRef(onActive);
  useEffect(() => {
    activeRef.current = onActive;
  }, [onActive]);
  useEffect(() => {
    if (centred) activeRef.current();
  }, [centred]);

  return (
    <li ref={ref} className="lg:flex lg:min-h-[78svh] lg:items-center">
      <RevealGroup className="w-full">
        <RevealItem>
          <article
            className={`sticker-lg relative px-6 pt-24 pb-8 md:px-10 md:pt-28 md:pb-10 ${centred ? "lg:-translate-y-1" : ""}`}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-3 right-6 font-headline text-[120px] leading-none text-ink/[0.07] select-none md:text-[160px]"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <StageSlot
              scene={{ kind: "icon", name: step.icon, motion: step.motion }}
              rollOnTouch
              className="absolute -top-20 left-4 size-40 md:-top-24 md:left-8 md:size-44"
              fallback={<Voxel name={step.icon} size={176} className="size-full p-[11%]" />}
            />
            <p className="text-sm font-bold tracking-[0.08em] text-ink-soft">STEP {index + 1}</p>
            <h3 className="mt-2 font-headline text-[34px] leading-[1] md:text-[44px]">
              {step.title}
            </h3>
            <p className="mt-4 max-w-[42ch] text-lg leading-normal text-pretty text-ink-soft">
              {step.body}
            </p>
            <div className={`mt-8 rounded-[24px] border-2 border-ink p-4 lg:hidden ${step.tint}`}>
              <RoundMockup step={index} />
            </div>
          </article>
        </RevealItem>
      </RevealGroup>
    </li>
  );
}
