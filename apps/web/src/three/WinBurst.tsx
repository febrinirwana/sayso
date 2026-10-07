import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Group, LinearToneMapping } from "three";
import { VoxelLights } from "./Lights";
import { burstLayout } from "./layout";
import { voxelMeshes } from "./voxels";

type WinBurstProps = {
  className?: string | undefined;
  /** Fires once when the burst has settled and the canvas has stopped rendering. */
  onDone?: (() => void) | undefined;
};

/** Seconds from the first frame until every piece rests; the canvas stops drawing after this. */
const END = 2.1;
/** Seconds a piece spins before it faces front. */
const SPIN = 1.5;

const easeOutCubic = (x: number) => 1 - (1 - Math.min(Math.max(x, 0), 1)) ** 3;

/**
 * S5 win moment: coins, stars and hearts pop out of the centre, spin, and settle into a halo that
 * leaves the centre clear. Plays once (≤ 2.5 s), keeps its last frame, then calls `onDone`.
 */
export default function WinBurst({ className, onDone }: WinBurstProps) {
  const [running, setRunning] = useState(true);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  return (
    <div aria-hidden="true" className={className}>
      <Canvas
        frameloop={running ? "always" : "demand"}
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true, toneMapping: LinearToneMapping }}
        camera={{ position: [0, 0, 20], fov: 30 }}
        style={{ pointerEvents: "none" }}
      >
        <VoxelLights />
        <Burst
          onSettled={() => {
            setRunning(false);
            done.current?.();
          }}
        />
      </Canvas>
    </div>
  );
}

function Burst({ onSettled }: { onSettled: () => void }) {
  const width = useThree((state) => state.size.width);
  const height = useThree((state) => state.size.height);
  const pieces = useMemo(() => burstLayout(width, height), [width, height]);
  const groups = useRef<(Group | null)[]>([]);
  const start = useRef<number | null>(null);
  const settled = useRef(false);

  useFrame(({ clock, size, viewport }) => {
    start.current ??= clock.elapsedTime;
    // Clamped, so redraws after the burst (resize) repeat the resting pose.
    const t = Math.min(clock.elapsedTime - start.current, END);
    const unit = 1 / viewport.factor;
    const hop = Math.min(size.width, size.height) * 0.12;

    pieces.forEach((piece, i) => {
      const node = groups.current[i];
      if (!node) return;
      const since = t - piece.delay;
      node.visible = since >= 0;
      if (!node.visible) return;
      const Mesh = voxelMeshes[piece.name];
      // Out from the centre with a small overshoot, on an arc that rises then lands.
      const out = 1 - Math.exp(-6 * since) * Math.cos(8 * since);
      const arc = Math.sin(Math.PI * Math.min(since / 0.8, 1)) * hop;
      const x = size.width / 2 + (piece.x - size.width / 2) * out;
      const y = size.height / 2 + (piece.y - size.height / 2) * out - arc;
      node.position.set((x - size.width / 2) * unit, (size.height / 2 - y) * unit, 0);
      // Grows from 35 %, never from zero.
      const grow = 1 - Math.exp(-7 * since) * Math.cos(10 * since);
      node.scale.setScalar(((piece.size * unit) / Mesh.span) * (0.35 + 0.65 * grow));
      const spin = 1 - easeOutCubic(since / SPIN);
      node.rotation.set(
        Math.sin(since * 9) * 0.3 * spin,
        piece.turns * Math.PI * 2 * spin,
        piece.roll * easeOutCubic(since / 1.2),
      );
    });

    if (t >= END && !settled.current) {
      settled.current = true;
      onSettled();
    }
  });

  return pieces.map((piece, i) => {
    const Mesh = voxelMeshes[piece.name];
    return (
      <Mesh
        key={piece.id}
        visible={false}
        ref={(node) => {
          groups.current[i] = node;
        }}
      />
    );
  });
}
