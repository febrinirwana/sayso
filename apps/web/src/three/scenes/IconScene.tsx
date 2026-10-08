import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { clamp, damp, springIn, worldPerPx } from "../camera";
import type { IconMotion } from "../registry";
import { pointer } from "../registry";
import { useRoll } from "../roll";
import { type VoxelMeshName, voxelMeshes } from "../voxels";

type IconSceneProps = {
  slotId: string;
  element: HTMLElement;
  name: VoxelMeshName;
  motion: IconMotion;
  /** Share of the slot's shorter side the voxel fills; the rest is room to roll and bob. */
  fill?: number | undefined;
};

/**
 * One voxel in its slot. Turns in from −90° the first time it scrolls into view, then floats,
 * leans toward the pointer and barrel-rolls on `roll` (hover or tap on the slot).
 */
export function IconScene({ slotId, element, name, motion, fill = 0.78 }: IconSceneProps) {
  const group = useRef<Group>(null);
  const roll = useRoll(slotId);
  const state = useRef({ shownAt: -1, rx: 0, ry: 0, phase: (slotId.length * 1.7) % 6.28 });
  const Mesh = voxelMeshes[name];

  useFrame(({ clock }, delta) => {
    const node = group.current;
    if (!node) return;
    const s = state.current;
    const t = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    const rect = element.getBoundingClientRect();
    if (s.shownAt < 0 && rect.top < window.innerHeight * 0.92 && rect.bottom > 0) {
      s.shownAt = t;
    }
    const since = s.shownAt < 0 ? 0 : t - s.shownAt;
    const pop = springIn(since);

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const k = damp(3, dt);
    const dx = pointer.active ? clamp((pointer.x - cx) / window.innerWidth, -1, 1) : 0;
    const dy = pointer.active ? clamp((pointer.y - cy) / window.innerHeight, -1, 1) : 0;
    s.ry += (dx * 1.2 - s.ry) * k;
    s.rx += (dy - s.rx) * k;

    const a = t + s.phase;
    let bob = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    switch (motion) {
      case "bob":
        bob = Math.sin(a * 2) * 0.05;
        break;
      case "rock":
        bob = Math.sin(a * 2) * 0.03;
        rz = Math.sin(a * 2) * 0.16;
        rx = Math.sin(a * 1.5) * 0.08;
        break;
      case "wobble":
        bob = Math.sin(a * 2) * 0.04;
        ry = Math.sin(a) * 0.4;
        rz = Math.sin(a * 1.5) * 0.08;
        break;
      case "spin":
        bob = Math.sin(a * 2) * 0.03;
        ry = a * 0.9;
        break;
    }

    const unit = worldPerPx(rect.height);
    const size = Math.min(rect.width, rect.height) * fill;
    node.position.set(0, bob * size * unit, 0);
    node.scale.setScalar(((size * unit) / Mesh.span) * (0.6 + 0.4 * pop));
    node.rotation.set(
      rx + s.rx * 0.8,
      ry + s.ry + roll.angle(t) - (1 - Math.min(pop, 1)) * (Math.PI / 2),
      rz,
    );
  });

  return (
    <group ref={group}>
      <Mesh />
    </group>
  );
}
