import { useInView } from "motion/react";
import { useRef } from "react";
import type { VoxelName } from "@/assets/voxels/names";
import { Voxel } from "@/ui/Voxel";

type Item = { word: string; said?: boolean } | { voxel: VoxelName };

const ITEMS: readonly Item[] = [
  { word: "MOON", said: true },
  { voxel: "omg-message" },
  { word: "PIZZA" },
  { voxel: "money-2" },
  { word: "CHAMPION", said: true },
  { voxel: "dino" },
  { word: "LEGENDARY" },
  { voxel: "like-message" },
  { word: "TACO", said: true },
  { voxel: "ice-cream" },
  { word: "OOPS" },
  { voxel: "ghost" },
  { word: "ROCKET" },
  { voxel: "wtf-message" },
  { word: "VIBES", said: true },
  { voxel: "burger" },
  { voxel: "cd-player" },
  { word: "WAIT", said: true },
  { voxel: "computer" },
  { voxel: "mystery-box" },
  { word: "SURPRISE" },
  { voxel: "skull" },
  { voxel: "music-blue" },
  { word: "YES", said: true },
  { voxel: "pixle" },
  { voxel: "pixle-red" },
];

/**
 * An endless, slightly tilted ink band of word stickers and voxel stickers. Pauses off-screen and
 * stands still under reduced motion.
 */
export function Marquee() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  return (
    <div ref={ref} aria-hidden="true" className="relative z-[2] overflow-x-clip py-10 md:py-14">
      <div className="-mx-[5%] -rotate-2 border-y-2 border-ink bg-ink py-4 md:py-5">
        <div
          className="flex w-max animate-marquee items-center motion-reduce:animate-none"
          style={{ animationPlayState: inView ? "running" : "paused" }}
        >
          {[0, 1].map((copy) => (
            <div key={copy} className="flex items-center gap-5 pr-5 md:gap-7 md:pr-7">
              {ITEMS.map((item, i) =>
                "voxel" in item ? (
                  <Voxel
                    key={`${copy}-${item.voxel}`}
                    name={item.voxel}
                    size={64}
                    className={`size-14 md:size-16 ${i % 4 === 1 ? "rotate-6" : "-rotate-6"}`}
                  />
                ) : (
                  <span
                    key={`${copy}-${item.word}`}
                    className={`inline-flex h-12 items-center gap-2 rounded-full border-2 border-ink px-5 font-headline text-xl md:h-14 md:text-2xl ${
                      item.said ? "bg-said text-ink" : "bg-card text-ink"
                    } ${i % 3 === 0 ? "rotate-2" : "-rotate-1"}`}
                  >
                    {item.word}
                    {item.said && (
                      <span className="rounded-full bg-ink px-2 py-1 text-[11px] leading-none tracking-[0.08em] text-white">
                        SAID
                      </span>
                    )}
                  </span>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
