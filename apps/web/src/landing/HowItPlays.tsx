import type { VoxelName } from "@/assets/voxels/names";
import { Voxel } from "@/ui/Voxel";
import { RevealList, RevealListItem } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

const STEPS: readonly { title: string; body: string; voxel: VoxelName; tilt: string }[] = [
  {
    title: "Pick a word",
    body: "Six words sit on the board, each priced 1¢ to 99¢: the crowd’s odds it gets said. Back the ones you believe in.",
    voxel: "pink-arrow",
    tilt: "rotate-6",
  },
  {
    title: "Watch the clip",
    body: "The clip replays. The moment a word is spoken, its card flips SAID and its price jumps toward 100¢.",
    voxel: "computer",
    tilt: "-rotate-3",
  },
  {
    title: "Cash out or hold",
    body: "Cash out a SAID word on the spot, or hold to the end. Said words settle at 100¢, the rest at 0¢.",
    voxel: "money-2",
    tilt: "rotate-3",
  },
];

export function HowItPlays() {
  return (
    <section
      aria-labelledby="how-it-plays-title"
      id="how-it-plays"
      className="mx-auto max-w-6xl scroll-mt-16 px-4 py-20 md:px-8 md:py-32"
    >
      <SectionHeading
        id="how-it-plays-title"
        title="How it plays"
        lede="One round takes about as long as the clip. Three moves, no jargon."
      />
      <RevealList className="mt-16 grid gap-14 md:mt-20 md:grid-cols-3 md:gap-6">
        {STEPS.map((step, i) => (
          <RevealListItem key={step.title} className="sticker relative px-6 pt-8 pb-7">
            <Voxel
              name={step.voxel}
              size={112}
              className={`absolute -top-12 right-4 ${step.tilt}`}
            />
            <span className="font-display-wide inline-flex size-10 items-center justify-center rounded-full bg-ink text-lg text-paper">
              {i + 1}
            </span>
            <h3 className="font-display-wide mt-5 text-[28px] leading-none">{step.title}</h3>
            <p className="mt-3 leading-normal text-pretty text-ink-soft">{step.body}</p>
          </RevealListItem>
        ))}
      </RevealList>
    </section>
  );
}
