import { createFileRoute, notFound } from "@tanstack/react-router";
import { type ReactNode, useRef, useState } from "react";
import markUrl from "@/assets/brand/mascot-640.webp";
import { play } from "@/sound";
import { LazyStage, LazyWinBurst } from "@/three/Lazy";
import { sendSignal, useStageReady } from "@/three/registry";
import { StageSlot, useStageSlot } from "@/three/Slot";
import { BurstStickers } from "@/three/Stickers";
import { type VoxelMeshName, voxelMeshes } from "@/three/voxels";
import { Button } from "@/ui/Button";
import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";

export const Route = createFileRoute("/design_/3d")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  component: Design3d,
});

const FILL = "pointer-events-none absolute inset-0 h-full w-full";
const MESHES = Object.keys(voxelMeshes) as VoxelMeshName[];
const MASCOT_SLOT = "gallery-mascot";

/** Dev gallery: the mascot and every voxel mesh on the shared stage, plus the S5 win burst. */
function Design3d() {
  const [stickers, setStickers] = useState(false);
  const [burst, setBurst] = useState(0);
  const [settled, setSettled] = useState(false);

  const replay = () => {
    setSettled(false);
    setBurst((n) => n + 1);
  };

  return (
    <main className="min-h-dvh pb-24">
      <header className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pt-10 pb-8 md:px-8">
        <p className="text-sm font-semibold tracking-[0.08em] text-ink-soft">DEV SPECIMEN</p>
        <h1 className="font-headline text-5xl leading-none md:text-6xl">Voxels in 3D</h1>
        <p className="max-w-prose text-ink-soft">
          Everything on the landing's single WebGL stage: one fixed canvas, one view per box. Hover
          or tap a voxel to roll it; boop the mascot. Static stickers are what reduced motion and
          browsers without WebGL see.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            aria-pressed={stickers}
            onClick={() => {
              setStickers((on) => !on);
              replay();
            }}
          >
            {stickers ? "Showing static stickers" : "Show static stickers"}
          </Button>
          <Button onClick={replay}>Replay win burst</Button>
        </div>
      </header>

      <Frame label="SaySo mascot · voxel grid sampled from the mark">
        <div className="sticker mx-auto grid max-w-6xl items-center gap-6 p-6 md:grid-cols-[1fr_auto]">
          {stickers ? (
            <img src={markUrl} alt="" className="mx-auto aspect-square w-full max-w-[460px]" />
          ) : (
            <MascotStage />
          )}
          <div className="flex flex-wrap gap-3 md:flex-col">
            <Button
              variant="brand"
              onClick={() => {
                play("pop");
                sendSignal(MASCOT_SLOT, "boop");
              }}
            >
              Boop
            </Button>
            <Button variant="secondary" onClick={() => sendSignal(MASCOT_SLOT, "talk")}>
              Talk
            </Button>
          </div>
        </div>
      </Frame>

      <Frame label={`Voxel meshes · ${MESHES.length}`}>
        <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          {MESHES.map((name) => (
            <li key={name} className="sticker flex flex-col items-center gap-1 p-3">
              {stickers ? (
                <Voxel name={name} size={140} className="size-32 p-[11%]" />
              ) : (
                <StageSlot
                  scene={{ kind: "icon", name, motion: "wobble" }}
                  rollOnTouch
                  className="size-32"
                  fallback={<Voxel name={name} size={140} className="size-full p-[11%]" />}
                />
              )}
              <span className="text-sm font-semibold">{name}</span>
            </li>
          ))}
        </ul>
      </Frame>

      <Frame label={settled ? "Win burst · settled" : "Win burst · playing"}>
        <div className="sticker relative mx-auto aspect-square w-full max-w-[412px] overflow-hidden bg-paper">
          {stickers ? (
            <BurstStickers key={burst} className={FILL} onShown={() => setSettled(true)} />
          ) : (
            <LazyWinBurst key={burst} className={FILL} onDone={() => setSettled(true)} />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-semibold text-ink-soft">You won</p>
            <p className="font-headline tabular text-5xl leading-none text-gain">+12.40</p>
            <p className="flex items-center gap-2 text-sm font-semibold">
              AUSD <TestnetPill />
            </p>
          </div>
        </div>
      </Frame>

      <LazyStage />
    </main>
  );
}

function MascotStage() {
  const ref = useRef<HTMLDivElement>(null);
  const live = useStageSlot(ref, MASCOT_SLOT, { kind: "mascot" });
  const ready = useStageReady();
  return (
    <div ref={ref} className="mx-auto aspect-square w-full max-w-[460px]">
      {(!live || !ready) && <img src={markUrl} alt="" className="size-full" />}
    </div>
  );
}

function Frame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-10 px-4 md:px-8">
      <h2 className="mx-auto mb-3 max-w-6xl text-sm font-semibold text-ink-soft">{label}</h2>
      {children}
    </section>
  );
}
