import type { VoxelName } from "@/assets/voxels/names";
import { Voxel } from "@/ui/Voxel";
import { RevealList, RevealListItem } from "./Reveal";
import { SectionHeading } from "./SectionHeading";

const FACTS: readonly { title: string; body: string; voxel: VoxelName }[] = [
  {
    title: "Answers sealed first",
    body: "Two independent transcripts of the clip are fingerprinted onchain before the first trade. Nothing after that can change an outcome.",
    voxel: "mystery-box",
  },
  {
    title: "SAID within a block",
    body: "When a word is spoken, its card flips SAID within a single Monad block, for every player at once.",
    voxel: "zap",
  },
  {
    title: "Only Chainlink settles",
    body: "Chainlink CRE checks each word against both sealed transcripts and pays out. Not us, not the house.",
    voxel: "globe",
  },
];

export function Fair() {
  return (
    <section aria-labelledby="fair-title" className="mx-auto max-w-6xl px-4 py-20 md:px-8 md:py-32">
      <SectionHeading
        id="fair-title"
        title="Fair by construction"
        lede="Nobody can peek at the answers or rewrite them, including us."
      />
      <RevealList className="mt-12 grid gap-4 md:mt-16 md:grid-cols-3 md:gap-6">
        {FACTS.map((fact) => (
          <RevealListItem
            key={fact.title}
            className="sticker flex items-start gap-4 p-5 md:flex-col md:gap-0 md:p-7"
          >
            <Voxel name={fact.voxel} size={80} className="size-16 shrink-0 md:-ml-1 md:size-20" />
            <div>
              <h3 className="font-display-wide text-2xl leading-tight md:mt-5">{fact.title}</h3>
              <p className="mt-2 leading-normal text-pretty text-ink-soft">{fact.body}</p>
            </div>
          </RevealListItem>
        ))}
      </RevealList>
    </section>
  );
}
