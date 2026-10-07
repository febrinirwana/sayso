import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { type Group, LinearToneMapping } from "three";
import { VoxelLights } from "./Lights";
import { heroLayout, type Piece } from "./layout";
import { voxelMeshes } from "./voxels";

/** Pointer position in CSS px relative to the scene box; `active` is false once it leaves. */
type Pointer = { x: number; y: number; active: boolean };

type HeroSceneProps = {
  className?: string | undefined;
  /** Fires once, after the first frame is on screen. */
  onReady?: (() => void) | undefined;
};

/** Landing hero voxels: one transparent canvas that fills its box and keeps clear of the copy. */
export default function HeroScene({ className, onReady }: HeroSceneProps) {
  const box = useRef<HTMLDivElement>(null);
  const pointer = useRef<Pointer>({ x: 0, y: 0, active: false });
  const [visible, setVisible] = useState(true);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? true),
      {
        rootMargin: "64px",
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const rect = box.current?.getBoundingClientRect();
      if (!rect) return;
      pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top, active: true };
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType === "touch" || event.relatedTarget === null) {
        pointer.current.active = false;
      }
    };
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", leave, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", leave);
      document.removeEventListener("pointerout", leave);
    };
  }, []);

  return (
    <div
      ref={box}
      aria-hidden="true"
      className={className}
      style={{ opacity: shown ? 1 : 0, transition: "opacity 300ms var(--ease-out)" }}
    >
      <Canvas
        frameloop={visible ? "always" : "demand"}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, toneMapping: LinearToneMapping }}
        camera={{ position: [0, 0, 20], fov: 30 }}
        style={{ pointerEvents: "none" }}
      >
        <VoxelLights />
        <Pieces pointer={pointer} />
        <FirstFrame
          onFrame={() => {
            setShown(true);
            onReady?.();
          }}
        />
      </Canvas>
    </div>
  );
}

function FirstFrame({ onFrame }: { onFrame: () => void }) {
  const fired = useRef(false);
  useFrame(() => {
    if (fired.current) return;
    fired.current = true;
    onFrame();
  });
  return null;
}

function Pieces({ pointer }: { pointer: RefObject<Pointer> }) {
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const pieces = useMemo(() => heroLayout(width, height), [width, height]);
  return pieces.map((piece, index) => (
    <HeroPiece key={piece.name} piece={piece} index={index} pointer={pointer} />
  ));
}

/** Seconds between each piece popping in. */
const STAGGER = 0.08;
/** Pointer lean: px of drift and radians of turn at full depth. */
const DRIFT_PX = 14;
const TURN = 0.7;

function HeroPiece({
  piece,
  index,
  pointer,
}: {
  piece: Piece;
  index: number;
  pointer: RefObject<Pointer>;
}) {
  const group = useRef<Group>(null);
  // Critically-damped-ish spring toward the pointer; deeper pieces react faster.
  const lean = useRef({ x: 0, y: 0, vx: 0, vy: 0 });
  const Mesh = voxelMeshes[piece.name];

  useFrame(({ clock, size, viewport }, delta) => {
    const node = group.current;
    if (!node) return;
    const t = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    const since = t - 0.1 - index * STAGGER;
    node.visible = since >= 0;
    if (!node.visible) return;

    const p = pointer.current;
    const towardX = p.active ? Math.max(-1, Math.min(1, ((p.x - piece.x) / size.width) * 2)) : 0;
    const towardY = p.active ? Math.max(-1, Math.min(1, ((p.y - piece.y) / size.height) * 2)) : 0;
    const s = lean.current;
    const stiffness = 30 + 40 * piece.depth;
    const damping = 1.7 * Math.sqrt(stiffness);
    s.vx += ((towardX - s.x) * stiffness - s.vx * damping) * dt;
    s.vy += ((towardY - s.y) * stiffness - s.vy * damping) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    const a = t + piece.phase;
    let bob = 0;
    let rx = 0;
    let ry = 0;
    let rz = 0;
    switch (piece.motion) {
      case "bob":
        bob = Math.sin(a * 1.5) * 0.05;
        ry = Math.sin(a * 0.6) * 0.2;
        break;
      case "sway":
        bob = Math.sin(a * 1.3) * 0.04;
        ry = Math.sin(a * 0.8) * 0.4;
        rz = Math.sin(a * 1.2) * 0.05;
        break;
      case "rock":
        bob = Math.sin(a * 1.6) * 0.035;
        rx = Math.sin(a * 1.1) * 0.08;
        rz = Math.sin(a * 1.4) * 0.12;
        break;
      case "spin":
        bob = Math.sin(a * 1.4) * 0.04;
        ry = a * 0.7;
        break;
    }

    // Pop in from 60 % with a small overshoot, never from zero.
    const pop = 1 - Math.exp(-6 * since) * Math.cos(9 * since);
    const unit = 1 / viewport.factor;
    const x = piece.x + s.x * DRIFT_PX * piece.depth;
    const y = piece.y + s.y * DRIFT_PX * piece.depth - bob * piece.size;
    node.position.set((x - size.width / 2) * unit, (size.height / 2 - y) * unit, 0);
    node.scale.setScalar(((piece.size * unit) / Mesh.span) * (0.6 + 0.4 * pop));
    node.rotation.set(
      piece.tilt[0] + rx + s.y * TURN * 0.7,
      piece.tilt[1] + ry + s.x * TURN,
      piece.tilt[2] + rz,
    );
  });

  return (
    <group ref={group} visible={false}>
      <Mesh />
    </group>
  );
}
