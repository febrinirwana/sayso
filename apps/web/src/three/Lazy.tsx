import { useReducedMotion } from "motion/react";
import { lazy, Suspense } from "react";
import { BurstStickers } from "./Stickers";

// The only entry points pages import. three.js lives behind these dynamic imports, so it ships
// in its own chunks and loads on S0 and S5 alone.
const Stage = lazy(() => import("./Stage"));
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
export function useLive(): boolean {
  const reduced = useReducedMotion();
  return reduced !== true && hasWebGL();
}

/**
 * The landing's one WebGL context: a fixed, click-through canvas that draws every registered
 * `StageSlot`. Mount once per page; renders nothing when 3D is off.
 */
export function LazyStage() {
  const live = useLive();
  if (!live) return null;
  return (
    <Suspense fallback={null}>
      <Stage />
    </Suspense>
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
