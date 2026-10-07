import { useReducedMotion } from "motion/react";
import { lazy, Suspense, useState } from "react";
import { BurstStickers, HeroStickers } from "./Stickers";

// The only entry points pages import. three.js lives behind these dynamic imports, so it ships
// in its own chunk and loads on S0 and S5 alone.
const HeroScene = lazy(() => import("./HeroScene"));
const WinBurst = lazy(() => import("./WinBurst"));

let webgl: boolean | undefined;

/** Whether this browser can create a WebGL context; probed once, then cached. */
function hasWebGL(): boolean {
  if (webgl === undefined) {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      webgl = gl !== null;
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      webgl = false;
    }
  }
  return webgl;
}

/** Live 3D is skipped under reduced motion and without WebGL; stickers stand in. */
function useLive(): boolean {
  const reduced = useReducedMotion();
  return reduced !== true && hasWebGL();
}

const LAYER = "[grid-area:1/1] min-h-0 min-w-0";

/**
 * Landing hero voxels. Fills the box `className` gives it. Stickers hold the layout while the 3D
 * chunk loads, then fade out as the canvas fades in.
 */
export function LazyHeroScene({ className }: { className?: string }) {
  const live = useLive();
  const [ready, setReady] = useState(false);
  return (
    <div className={`grid ${className ?? ""}`} aria-hidden="true">
      <HeroStickers
        className={`${LAYER} transition-opacity duration-300 ease-out ${live && ready ? "opacity-0" : ""}`}
      />
      {live && (
        <Suspense fallback={null}>
          <HeroScene className={LAYER} onReady={() => setReady(true)} />
        </Suspense>
      )}
    </div>
  );
}

/**
 * S5 win burst. Plays once, keeps its resting frame, then calls `onDone`. Under reduced motion or
 * without WebGL the resting halo fades in over 150 ms instead.
 */
export function LazyWinBurst({ className, onDone }: { className?: string; onDone?: () => void }) {
  const live = useLive();
  if (!live) return <BurstStickers className={className} onShown={onDone} />;
  return (
    <Suspense fallback={null}>
      <WinBurst className={className} onDone={onDone} />
    </Suspense>
  );
}
