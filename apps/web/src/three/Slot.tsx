import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { useLive } from "./Lazy";
import { registerSlot, type StageScene, sendSignal, useStageReady } from "./registry";

type StageSlotProps = {
  scene: StageScene;
  /** Static art shown under reduced motion, without WebGL, and until the stage's first frame. */
  fallback: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Fine-pointer hover and taps barrel-roll the voxel. */
  rollOnTouch?: boolean;
};

/**
 * A box the landing stage draws a voxel scene into. Click-through by default; with `rollOnTouch`
 * it catches hover and taps and rolls its voxel.
 */
export function StageSlot({ scene, fallback, className, style, rollOnTouch }: StageSlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const live = useStageSlot(ref, id, scene);
  const ready = useStageReady();
  const roll = () => sendSignal(id, "roll");
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`${rollOnTouch ? "" : "pointer-events-none"} ${className ?? ""}`}
      style={style}
      onPointerEnter={rollOnTouch ? (e) => e.pointerType === "mouse" && roll() : undefined}
      onPointerDown={rollOnTouch ? roll : undefined}
    >
      <div
        className="size-full transition-opacity duration-300 ease-out"
        style={{ opacity: live && ready ? 0 : 1 }}
      >
        {fallback}
      </div>
    </div>
  );
}

/**
 * Registers `ref`'s element with the stage under `id` while 3D is live. Returns whether it is.
 * Scenes are compared by kind and fields, so inline objects do not re-register every render.
 */
export function useStageSlot(
  ref: RefObject<HTMLElement | null>,
  id: string,
  scene: StageScene | null,
): boolean {
  const live = useLive();
  const key = scene ? sceneKey(scene) : null;
  const latest = useRef(scene);
  latest.current = scene;
  useEffect(() => {
    const element = ref.current;
    const current = latest.current;
    if (!live || !element || !current || key === null) return;
    return registerSlot({ id, element, scene: current });
  }, [live, id, key, ref]);
  return live;
}

function sceneKey(scene: StageScene): string {
  return scene.kind === "icon"
    ? `icon:${scene.name}:${scene.motion}:${scene.fill ?? ""}`
    : scene.kind;
}
