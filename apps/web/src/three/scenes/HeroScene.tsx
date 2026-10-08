import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { Group } from "three";
import { clamp, damp, springIn, worldPerPx } from "../camera";
import { heroLayout, type Piece } from "../layout";
import { Mascot } from "../mascot/Mascot";
import { pointer } from "../registry";
import { useRoll } from "../roll";
import { voxelMeshes } from "../voxels";

type HeroSceneProps = {
  slotId: string;
  element: HTMLElement;
  mascot: RefObject<HTMLElement | null>;
};

/** Seconds between voxels flying in, after the mascot lands. */
const STAGGER = 0.07;
const FIRST = 0.45;
/** Pointer parallax in px at full depth; scroll parallax as a share of scroll distance. */
const DRIFT_PX = 22;
const SCROLL = 0.32;

/**
 * Landing hero: the mascot on its anchor and voxels scattered across the art box. Pieces fly in
 * from the edges, float, face the pointer (bloop's lerp 0.05), drift with depth on pointer and
 * scroll, and barrel-roll when the pointer passes over them.
 */
export function HeroScene({ slotId, element, mascot }: HeroSceneProps) {
  const view = useRef<DOMRect>(element.getBoundingClientRect());
  const [box, setBox] = useState(() => ({
    width: view.current.width,
    height: view.current.height,
  }));
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  const pieces = useMemo(() => heroLayout(box.width, box.height), [box.width, box.height]);

  // Read the box once per frame, before any piece needs it.
  useFrame(() => {
    view.current = element.getBoundingClientRect();
  }, -2);

  return (
    <>
      <Mascot
        slotId={slotId}
        place={() => {
          const anchor = mascot.current?.getBoundingClientRect();
          return anchor ? { view: view.current, box: anchor } : null;
        }}
      />
      {pieces.map((piece, i) => (
        <FieldPiece key={piece.name} piece={piece} index={i} view={view} />
      ))}
    </>
  );
}

function FieldPiece({
  piece,
  index,
  view,
}: {
  piece: Piece;
  index: number;
  view: RefObject<DOMRect>;
}) {
  const group = useRef<Group>(null);
  const roll = useRoll();
  const state = useRef({
    start: -1,
    rx: 0,
    ry: 0,
    px: 0,
    py: 0,
    down: pointer.down,
    hovered: false,
  });
  const Mesh = voxelMeshes[piece.name];

  useFrame(({ clock }, delta) => {
    const node = group.current;
    const rect = view.current;
    if (!node) return;
    const s = state.current;
    const t = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    if (s.start < 0) s.start = t + FIRST + index * STAGGER;
    const since = t - s.start;
    node.visible = since >= 0;
    if (!node.visible) return;

    const unit = worldPerPx(rect.height);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const screenX = rect.left + piece.x;
    const screenY = rect.top + piece.y;

    // Face the pointer, bloop-style: rotate toward it, eased 0.05 per 60 Hz frame.
    const k = damp(3, dt);
    const dx = pointer.active ? clamp((pointer.x - screenX) / vw, -1, 1) : 0;
    const dy = pointer.active ? clamp((pointer.y - screenY) / vh, -1, 1) : 0;
    s.ry += (dx * 1.2 - s.ry) * k;
    s.rx += (dy * 1.0 - s.rx) * k;
    const towardX = pointer.active ? clamp((pointer.x - vw / 2) / (vw / 2), -1, 1) : 0;
    const towardY = pointer.active ? clamp((pointer.y - vh / 2) / (vh / 2), -1, 1) : 0;
    s.px += (towardX - s.px) * k;
    s.py += (towardY - s.py) * k;

    // Pass over (or tap) a piece to roll it.
    const near =
      pointer.active && Math.hypot(pointer.x - screenX, pointer.y - screenY) < piece.size * 0.5;
    if (near && !s.hovered) roll.request();
    s.hovered = near;
    if (pointer.down !== s.down) {
      s.down = pointer.down;
      if (near) roll.request();
    }

    const a = t + piece.phase;
    let bob = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    switch (piece.motion) {
      case "bob":
        bob = Math.sin(a * 1.5) * 0.06;
        ry = Math.sin(a * 0.6) * 0.2;
        break;
      case "sway":
        bob = Math.sin(a * 1.3) * 0.05;
        ry = Math.sin(a * 0.8) * 0.35;
        rz = Math.sin(a * 1.2) * 0.06;
        break;
      case "rock":
        bob = Math.sin(a * 1.6) * 0.04;
        rx = Math.sin(a * 1.1) * 0.08;
        rz = Math.sin(a * 1.4) * 0.14;
        break;
      case "spin":
        bob = Math.sin(a * 1.4) * 0.05;
        ry = a * 0.7;
        break;
    }

    // Fly in from beyond the nearest edge with a spin, landing with a little overshoot.
    const pop = springIn(since * 0.85);
    const fromX = piece.x - rect.width / 2;
    const fromY = piece.y - rect.height / 2;
    const reach = Math.max(rect.width, rect.height) * 0.75;
    const len = Math.hypot(fromX, fromY) || 1;
    const fly = 1 - Math.min(pop, 1);
    const scroll = Math.min(0, rect.top) * piece.depth * SCROLL;

    const x = piece.x + (fromX / len) * reach * fly - s.px * DRIFT_PX * piece.depth;
    const y =
      piece.y +
      (fromY / len) * reach * fly -
      s.py * DRIFT_PX * piece.depth +
      scroll -
      bob * piece.size;
    node.position.set((x - rect.width / 2) * unit, (rect.height / 2 - y) * unit, 0);
    node.scale.setScalar(((piece.size * unit) / Mesh.span) * (0.7 + 0.3 * pop));
    node.rotation.set(
      piece.tilt[0] + rx + s.rx * 0.9,
      piece.tilt[1] + ry + s.ry + roll.angle(t) + fly * Math.PI * 2,
      piece.tilt[2] + rz,
    );
  });

  return (
    <group ref={group} visible={false}>
      <Mesh />
    </group>
  );
}
