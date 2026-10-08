// Pure placement shared by the 3D scenes and their sticker fallbacks, so both draw the same picture.
// No three.js here: the fallback ships in the page chunk.

export type PieceName =
  | "pixle-red"
  | "star"
  | "zap"
  | "money-1"
  | "money-2"
  | "music-blue"
  | "love"
  | "game-console"
  | "pink-arrow"
  | "globe";

/** Idle motion of a hero piece; all are gentle and loop. */
export type PieceMotion = "bob" | "sway" | "rock" | "spin";

export type Piece = {
  name: PieceName;
  /** Centre in CSS px from the box's top-left corner. */
  x: number;
  y: number;
  /** Largest side of the voxel in CSS px. */
  size: number;
  /** Resting rotation in radians [x, y, z]. */
  tilt: readonly [number, number, number];
  motion: PieceMotion;
  /** Phase offset in radians so pieces never move in lockstep. */
  phase: number;
  /** Parallax weight, 0 (far, barely moves) to 1 (near, moves most with pointer and scroll). */
  depth: number;
};

/** Art boxes at least this wide are the whole hero with the copy on the left; narrower are a band. */
export const HERO_WIDE_MIN = 1024;
/** In a wide hero the copy owns this box (fractions of the art box); pieces stay out of it. */
export const HERO_COPY = { right: 0.5, top: 0.12, bottom: 0.9 } as const;
/** Bands narrower than this show fewer pieces. */
export const HERO_PHONE_MAX = 600;

type Look = Pick<Piece, "name" | "tilt" | "motion" | "phase" | "depth">;
/** `u`/`v` place the centre across the box (0..1); `k` scales the base size. */
type Spec = { u: number; v: number; k: number; minWidth?: number; look: Look };

const WIDE: readonly Spec[] = [
  {
    u: 0.575,
    v: 0.15,
    k: 1.05,
    look: { name: "star", tilt: [0.15, -0.35, 0.18], motion: "sway", phase: 0, depth: 0.9 },
  },
  {
    u: 0.95,
    v: 0.15,
    k: 0.8,
    look: { name: "zap", tilt: [0, 0.3, -0.2], motion: "rock", phase: 1.3, depth: 0.55 },
  },
  {
    u: 0.955,
    v: 0.6,
    k: 0.82,
    look: { name: "money-1", tilt: [0.1, -0.4, 0.1], motion: "spin", phase: 2.1, depth: 1 },
  },
  {
    u: 0.585,
    v: 0.82,
    k: 0.9,
    look: { name: "love", tilt: [0, 0.35, -0.16], motion: "bob", phase: 0.7, depth: 0.75 },
  },
  {
    u: 0.86,
    v: 0.9,
    k: 0.82,
    look: { name: "game-console", tilt: [0.2, -0.3, 0.12], motion: "rock", phase: 2.8, depth: 0.5 },
  },
  {
    u: 0.455,
    v: 0.95,
    k: 0.62,
    look: { name: "music-blue", tilt: [0, 0.4, 0.2], motion: "sway", phase: 3.6, depth: 0.35 },
  },
  {
    u: 0.77,
    v: 0.08,
    k: 0.55,
    look: { name: "pink-arrow", tilt: [0, -0.2, -0.5], motion: "bob", phase: 4.2, depth: 0.3 },
  },
  {
    u: 0.035,
    v: 0.95,
    k: 0.55,
    minWidth: 1280,
    look: { name: "globe", tilt: [0.2, 0, 0.1], motion: "spin", phase: 5, depth: 0.25 },
  },
];

const BAND: readonly Spec[] = [
  {
    u: 0.13,
    v: 0.22,
    k: 0.95,
    look: { name: "star", tilt: [0.15, 0.35, 0.18], motion: "sway", phase: 0, depth: 0.9 },
  },
  {
    u: 0.88,
    v: 0.17,
    k: 0.78,
    look: { name: "zap", tilt: [0, -0.3, -0.2], motion: "rock", phase: 1.3, depth: 0.6 },
  },
  {
    u: 0.12,
    v: 0.76,
    k: 0.82,
    look: { name: "money-1", tilt: [0.1, 0.4, 0.1], motion: "spin", phase: 2.1, depth: 1 },
  },
  {
    u: 0.885,
    v: 0.74,
    k: 0.86,
    look: { name: "love", tilt: [0, -0.35, -0.16], motion: "bob", phase: 0.7, depth: 0.75 },
  },
  {
    u: 0.07,
    v: 0.5,
    k: 0.55,
    minWidth: HERO_PHONE_MAX,
    look: { name: "music-blue", tilt: [0, 0.4, 0.2], motion: "sway", phase: 3.6, depth: 0.35 },
  },
  {
    u: 0.93,
    v: 0.46,
    k: 0.55,
    minWidth: HERO_PHONE_MAX,
    look: { name: "game-console", tilt: [0.2, -0.3, 0.12], motion: "rock", phase: 2.8, depth: 0.5 },
  },
];

const PAD = 8;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Hero voxels for an art box of `width` × `height` CSS px. Wide boxes are the whole hero and keep
 * clear of the copy column (`HERO_COPY`); narrower ones are the band around the mascot.
 */
export function heroLayout(width: number, height: number): Piece[] {
  if (width <= 0 || height <= 0) return [];
  const wide = width >= HERO_WIDE_MIN;
  const base = wide
    ? clamp(height * 0.13, 72, 132)
    : clamp(Math.min(width * 0.2, height * 0.3), 56, 112);
  return (wide ? WIDE : BAND)
    .filter((spec) => width >= (spec.minWidth ?? 0))
    .map((spec) => {
      const size = base * spec.k;
      const half = size / 2 + PAD;
      let x = clamp(spec.u * width, half, width - half);
      const y = clamp(spec.v * height, half, height - half);
      // A wide piece that would poke into the copy column slides right, out of it.
      if (wide && y + half > HERO_COPY.top * height && y - half < HERO_COPY.bottom * height) {
        x = Math.max(x, HERO_COPY.right * width + half);
      }
      return { ...spec.look, x, y, size };
    });
}

type BurstSpec = Pick<Piece, "name"> & {
  /** Angle around the centre, radians, 0 = right, counter-clockwise. */
  angle: number;
  /** Radius relative to the halo. */
  r: number;
  k: number;
  /** Final z tilt in radians. */
  roll: number;
};

const BURST: readonly BurstSpec[] = [
  { name: "star", angle: 1.62, r: 1, k: 1, roll: 0.12 },
  { name: "money-1", angle: 0.78, r: 0.95, k: 0.85, roll: -0.2 },
  { name: "love", angle: 0.05, r: 1, k: 0.9, roll: -0.14 },
  { name: "money-2", angle: -0.72, r: 0.95, k: 0.82, roll: 0.18 },
  { name: "star", angle: -1.52, r: 0.9, k: 0.7, roll: -0.22 },
  { name: "money-1", angle: -2.4, r: 0.95, k: 0.78, roll: 0.24 },
  { name: "love", angle: 3.08, r: 1, k: 0.88, roll: 0.16 },
  { name: "money-2", angle: 2.36, r: 0.95, k: 0.9, roll: -0.12 },
];

export type BurstPiece = Pick<Piece, "name" | "x" | "y" | "size"> & {
  /** Stable key: the same name appears more than once in the halo. */
  id: string;
  roll: number;
  /** Seconds after the burst starts that this piece leaves the centre. */
  delay: number;
  /** Signed full turns the piece spins before it settles facing front. */
  turns: number;
};

/** Where each win-burst piece comes to rest: a rounded-square halo around the box centre. */
export function burstLayout(width: number, height: number): BurstPiece[] {
  if (width <= 0 || height <= 0) return [];
  const base = Math.min(width, height) * 0.18;
  const rx = width / 2 - base * 0.56 - PAD;
  const ry = height / 2 - base * 0.56 - PAD;
  return BURST.map((spec, i) => {
    const cos = Math.cos(spec.angle);
    const sin = Math.sin(spec.angle);
    // Superellipse (n = 4) pushes diagonal pieces into the corners, away from the centre.
    const r = spec.r / (cos ** 4 + sin ** 4) ** 0.25;
    return {
      id: `${spec.name}@${spec.angle}`,
      name: spec.name,
      size: base * spec.k,
      x: width / 2 + cos * rx * r,
      y: height / 2 - sin * ry * r,
      roll: spec.roll,
      delay: i * 0.045,
      turns: (i % 2 === 0 ? 1 : -1) * (1 + (i % 3 === 0 ? 1 : 0)),
    };
  });
}
