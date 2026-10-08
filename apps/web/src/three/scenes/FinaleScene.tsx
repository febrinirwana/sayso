import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { clamp, damp, easeOutCubic, worldPerPx } from "../camera";
import { pointer } from "../registry";
import { useRoll } from "../roll";
import { voxelMeshes } from "../voxels";

const { star: Star, "money-1": Coin, love: Heart } = voxelMeshes;

/**
 * The closing star, bloop's signature beat done bigger: as its slot scrolls in it slides from the
 * right edge and turns from −90°, two small voxels orbit it, and hover or tap rolls it once.
 */
export function FinaleScene({ slotId, element }: { slotId: string; element: HTMLElement }) {
  const outer = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const coin = useRef<Group>(null);
  const heart = useRef<Group>(null);
  const roll = useRoll(slotId);
  const state = useRef({ p: 0, rx: 0, ry: 0 });

  useFrame(({ clock }, delta) => {
    if (!outer.current || !inner.current) return;
    const s = state.current;
    const t = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    const rect = element.getBoundingClientRect();
    const vh = window.innerHeight;
    // Scroll-linked, smoothed: 0 while the slot's top is at the fold, 1 once it is 70 % up.
    const target = clamp((vh - rect.top) / (vh * 0.7), 0, 1);
    s.p += (target - s.p) * damp(6, dt);
    const p = easeOutCubic(s.p);

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const k = damp(3, dt);
    const dx = pointer.active ? clamp((pointer.x - cx) / window.innerWidth, -1, 1) : 0;
    const dy = pointer.active ? clamp((pointer.y - cy) / vh, -1, 1) : 0;
    s.ry += (dx * 0.9 - s.ry) * k;
    s.rx += (dy * 0.6 - s.rx) * k;

    const unit = worldPerPx(rect.height);
    // The star fills 56 % of the slot so its orbit (0.78 star widths out) stays inside it.
    const size = Math.min(rect.width, rect.height) * 0.56;
    const scale = (size * unit) / Star.span;
    const slide = (1 - p) * (rect.width / 2 + size * 0.7);
    outer.current.position.set(slide * unit, Math.sin(t * 1.2) * 0.04 * size * unit, 0);
    outer.current.rotation.set(-0.12 + s.rx, -Math.PI / 6 - (1 - p) * (Math.PI / 2) + s.ry, 0.08);
    outer.current.scale.setScalar(scale);
    inner.current.rotation.y = roll.angle(t);

    // Orbiters ride a tilted ring in the star's own cell units.
    const r = Star.span * 0.78;
    const orbit = (node: Group | null, offset: number) => {
      if (!node) return;
      const a = t * 0.7 + offset;
      node.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.32 + 1, Math.sin(a) * r * 0.55);
      node.rotation.set(0.2, a * 1.6, Math.sin(a) * 0.2);
    };
    orbit(coin.current, 0);
    orbit(heart.current, Math.PI);
  });

  return (
    <group ref={outer}>
      <group ref={inner}>
        <Star />
      </group>
      <group ref={coin} scale={0.42}>
        <Coin />
      </group>
      <group ref={heart} scale={0.36}>
        <Heart />
      </group>
    </group>
  );
}
