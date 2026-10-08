import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { clamp, damp, springIn, worldPerPx } from "../camera";
import { onSignal, pointer } from "../registry";
import { useRoll } from "../roll";
import { BatchMesh } from "../voxels/define";
import { FACE_Z, MASCOT_FOOT, MASCOT_PARTS, MASCOT_SPAN } from "./model";

/** Where the mascot sits this frame, in viewport px. */
export type MascotPlace = { view: DOMRect; box: DOMRect };

type MascotProps = {
  /** Slot that sends `boop` (roll, wink) and `talk` (squash, mouth) signals. */
  slotId: string;
  place: () => MascotPlace | null;
  /** Seconds after the stage starts before the mascot drops in. */
  delay?: number;
};

/** Small deterministic jitter so blinks never fall into a metronome. */
function jitter(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The SaySo mascot, alive: drops in with a squash, bobs, leans and looks toward the pointer,
 * blinks, squashes and opens its mouth on `talk`, and barrel-rolls with a wink on `boop`.
 */
export function Mascot({ slotId, place, delay = 0.15 }: MascotProps) {
  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const face = useRef<Group>(null);
  const eyeL = useRef<Group>(null);
  const eyeR = useRef<Group>(null);
  const smile = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const shadowMaterial = useRef<MeshBasicMaterial>(null);
  const roll = useRoll(slotId, ["boop"]);
  const motion = useRef({
    start: -1,
    lookX: 0,
    lookY: 0,
    blinkAt: 2.2,
    blinks: 0,
    talkAt: Number.NEGATIVE_INFINITY,
    pendingTalk: false,
  });

  useEffect(
    () =>
      onSignal(slotId, (signal) => {
        if (signal === "talk") motion.current.pendingTalk = true;
      }),
    [slotId],
  );

  useFrame(({ clock }, delta) => {
    const node = root.current;
    const where = place();
    if (!node || !spin.current || !where) return;
    const s = motion.current;
    const t = clock.elapsedTime;
    const dt = Math.min(delta, 1 / 30);
    if (s.start < 0) s.start = t + delay;
    const since = t - s.start;
    node.visible = since >= 0;
    if (!node.visible) return;
    if (s.pendingTalk) {
      s.pendingTalk = false;
      s.talkAt = t;
    }

    const { view, box } = where;
    const unit = worldPerPx(view.height);
    const size = Math.min(box.width, box.height);
    const scale = (size * unit) / MASCOT_SPAN;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;

    // Look toward the pointer, normalised by the window so far corners give a full turn.
    const towardX = pointer.active ? clamp((pointer.x - cx) / (window.innerWidth * 0.5), -1, 1) : 0;
    const towardY = pointer.active
      ? clamp((pointer.y - cy) / (window.innerHeight * 0.5), -1, 1)
      : 0;
    const k = damp(4, dt);
    s.lookX += (towardX - s.lookX) * k;
    s.lookY += (towardY - s.lookY) * k;

    // Drop in from above and land with a squash; never from scale zero.
    const pop = springIn(since);
    const dropPx = (1 - pop) * size * 0.9;
    const landed = Math.max(0, since - 0.18);
    const landSquash =
      Math.exp(-5 * landed) * Math.sin(13 * landed) * 0.16 * (since > 0.18 ? 1 : 0);
    const talked = t - s.talkAt;
    const talkSquash = talked < 1.2 ? Math.exp(-5 * talked) * Math.sin(16 * talked) * 0.1 : 0;
    const squash = landSquash + talkSquash;

    const rollP = roll.progress(t);
    const hop = rollP >= 0 ? Math.sin(Math.PI * rollP) * 2.6 : 0;
    const bob = Math.sin(t * 1.7) * 0.45 + hop;

    const px = cx - (view.left + view.width / 2);
    const py = cy - (view.top + view.height / 2) - dropPx;
    node.position.set(px * unit, -py * unit + bob * scale, 0);
    const grow = 0.75 + 0.25 * Math.min(pop, 1.04);
    node.scale.set(scale * grow * (1 + squash), scale * grow * (1 - squash), scale * grow);
    node.rotation.z = Math.sin(t * 0.9) * 0.05 - s.lookX * 0.06;

    spin.current.rotation.set(s.lookY * 0.32, s.lookX * 0.5 + (rollP >= 0 ? roll.angle(t) : 0), 0);

    // Face slides toward the pointer: the eyes "look".
    if (face.current) face.current.position.set(s.lookX * 0.9, -s.lookY * 0.7, 0);

    // Blink every 2–5 s, sometimes twice; the right eye winks through a roll.
    if (t > s.blinkAt + 0.18) {
      s.blinks++;
      const again = jitter(s.blinks) < 0.22;
      s.blinkAt = t + (again ? 0.24 : 2 + jitter(s.blinks + 99) * 3);
    }
    const b = (t - s.blinkAt) / 0.16;
    const blink = b >= 0 && b <= 1 ? Math.sin(Math.PI * b) : 0;
    const wink = rollP >= 0 ? Math.sin(Math.PI * Math.min(rollP * 1.4, 1)) : 0;
    eyeL.current?.scale.set(1, 1 - 0.88 * blink, 1);
    eyeR.current?.scale.set(1, 1 - 0.88 * Math.max(blink, wink), 1);
    const mouth = talked < 1.2 ? Math.exp(-4 * talked) * Math.abs(Math.sin(14 * talked)) : 0;
    smile.current?.scale.set(1 + 0.12 * wink + 0.1 * mouth, 1 + 0.5 * wink + 1.1 * mouth, 1);

    if (shadow.current && shadowMaterial.current) {
      const lift = Math.max(0, bob) / 4;
      shadow.current.position.set(px * unit, -py * unit - (MASCOT_FOOT + 1.6) * scale, -4 * scale);
      shadow.current.scale.set(
        scale * MASCOT_SPAN * 0.36 * (1 - lift * 0.3),
        scale * 2.2 * (1 - lift * 0.3),
        1,
      );
      shadowMaterial.current.opacity = 0.14 * (1 - lift * 0.5) * grow;
    }
  });

  const { body, eyeL: l, eyeR: r, smile: sm } = MASCOT_PARTS;
  return (
    <>
      <mesh ref={shadow} renderOrder={-1}>
        <circleGeometry args={[1, 40]} />
        <meshBasicMaterial
          ref={shadowMaterial}
          color="#0A0A0A"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <group ref={root} visible={false}>
        <group ref={spin}>
          {body.map((part) => (
            <BatchMesh key={part.key} batch={part} />
          ))}
          <group ref={face}>
            <group ref={eyeL} position={[l.x, l.y, FACE_Z]}>
              <BatchMesh batch={l.batch} />
            </group>
            <group ref={eyeR} position={[r.x, r.y, FACE_Z]}>
              <BatchMesh batch={r.batch} />
            </group>
            <group ref={smile} position={[sm.x, sm.y, FACE_Z]}>
              <BatchMesh batch={sm.batch} />
            </group>
          </group>
        </group>
      </group>
    </>
  );
}
