import { View } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { LinearToneMapping } from "three";
import { CAMERA } from "./camera";
import { VoxelLights } from "./Lights";
import { Mascot } from "./mascot/Mascot";
import { markStageReady, type Slot, trackPointer, useSlots } from "./registry";
import { FinaleScene } from "./scenes/FinaleScene";
import { HeroScene } from "./scenes/HeroScene";
import { IconScene } from "./scenes/IconScene";

/**
 * The page's only WebGL context: a fixed, transparent, click-through canvas over the page (z 1),
 * with one drei View per registered slot. Views draw inside their slot's box only, so content that
 * must stay above the voxels sits at z 2. The loop stops while no slot is near the viewport.
 */
export default function Stage() {
  const slots = useSlots();
  const near = useNearViewport(slots);
  useEffect(() => trackPointer(), []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1]"
      style={{ visibility: near ? "visible" : "hidden" }}
    >
      <Canvas
        frameloop={near ? "always" : "never"}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, toneMapping: LinearToneMapping }}
        camera={CAMERA}
        style={{ pointerEvents: "none" }}
      >
        <Clear />
        {slots.map((slot) => (
          <SlotView key={slot.id} slot={slot} />
        ))}
        <FirstFrame />
      </Canvas>
    </div>
  );
}

function SlotView({ slot }: { slot: Slot }) {
  const track = useMemo(() => ({ current: slot.element }), [slot.element]);
  return (
    <View track={track}>
      <VoxelLights />
      <SceneFor slot={slot} />
    </View>
  );
}

function SceneFor({ slot }: { slot: Slot }) {
  const { scene, id, element } = slot;
  switch (scene.kind) {
    case "hero":
      return <HeroScene slotId={id} element={element} mascot={scene.mascot} />;
    case "icon":
      return (
        <IconScene
          slotId={id}
          element={element}
          name={scene.name}
          motion={scene.motion}
          fill={scene.fill}
        />
      );
    case "finale":
      return <FinaleScene slotId={id} element={element} />;
    case "mascot":
      return (
        <Mascot
          slotId={id}
          place={() => {
            const rect = element.getBoundingClientRect();
            return { view: rect, box: rect };
          }}
        />
      );
  }
}

/** Views render without clearing; wipe the whole canvas once at the start of each frame. */
function Clear() {
  useFrame(({ gl }) => {
    gl.setScissorTest(false);
    gl.clear(true, true);
  }, -10);
  return null;
}

function FirstFrame() {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    markStageReady();
  });
  return null;
}

/** True while any slot is within a screen of the viewport, so the loop is warm before it shows. */
function useNearViewport(slots: readonly Slot[]): boolean {
  const [count, setCount] = useState(1);
  useEffect(() => {
    if (slots.length === 0) {
      setCount(0);
      return;
    }
    const visible = new Set<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        setCount(visible.size);
      },
      { rootMargin: "50% 0px" },
    );
    for (const slot of slots) observer.observe(slot.element);
    return () => observer.disconnect();
  }, [slots]);
  return count > 0;
}
