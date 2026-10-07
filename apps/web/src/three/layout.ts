// Pure placement shared by the 3D scenes and their sticker fallbacks, so both draw the same picture.
// No three.js here: the fallback ships in the page chunk.

export type PieceName =
  | "pixle-red"
  | "star"
  | "zap"
  | "money-1"
  | "money-2"
  | "music-blue"
  | "love";

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
  /** Parallax weight, 0 (still) to 1 (moves most with the pointer). */
  depth: number;
};

/** Hero boxes at least this wide have side columns beside the text; narrower ones use bands. */
export const HERO_WIDE_MIN = 1100;
/** Widest text column the landing hero centres. */
export const HERO_TEXT_MAX = 820;
/** Fractions of the hero height the landing keeps free of text below 1100 px. */
export const HERO_CLEAR_TOP = 0.16;
export const HERO_CLEAR_BOTTOM = 0.2;
/** Below this width the hero shows fewer, smaller pieces. */
export const HERO_MOBILE_MAX = 768;

const PAD = 10;

type Look = Pick<Piece, "name" | "tilt" | "motion" | "phase" | "depth">;

/** `u`/`v` place the piece across its slot (0..1); `k` scales the slot's base size. */
type ColumnSpec = { side: "left" | "right"; u: number; v: number; k: number; look: Look };
type BandSpec = { band: "top" | "bottom"; u: number; k: number; minWidth?: number; look: Look };

const COLUMN: readonly ColumnSpec[] = [
  {
    side: "left",
    u: 0.5,
    v: 0.22,
    k: 1,
    look: { name: "pixle-red", tilt: [0, 0.35, -0.12], motion: "sway", phase: 0, depth: 1 },
  },
  {
    side: "left",
    u: 0.7,
    v: 0.52,
    k: 0.72,
    look: { name: "zap", tilt: [0, 0.2, 0.18], motion: "rock", phase: 2.1, depth: 0.55 },
  },
  {
    side: "left",
    u: 0.4,
    v: 0.8,
    k: 0.82,
    look: { name: "money-1", tilt: [0.1, 0.4, 0.1], motion: "spin", phase: 4.2, depth: 0.8 },
  },
  {
    side: "right",
    u: 0.5,
    v: 0.2,
    k: 0.95,
    look: { name: "star", tilt: [0, -0.35, 0.1], motion: "sway", phase: 1, depth: 0.9 },
  },
  {
    side: "right",
    u: 0.3,
    v: 0.5,
    k: 0.62,
    look: { name: "music-blue", tilt: [0, -0.25, -0.15], motion: "rock", phase: 3.3, depth: 0.5 },
  },
  {
    side: "right",
    u: 0.55,
    v: 0.8,
    k: 0.88,
    look: { name: "love", tilt: [0, -0.4, -0.08], motion: "bob", phase: 5.1, depth: 1 },
  },
];

const BAND: readonly BandSpec[] = [
  {
    band: "top",
    u: 0.13,
    k: 0.8,
    look: { name: "star", tilt: [0, 0.35, -0.14], motion: "sway", phase: 1, depth: 0.8 },
  },
  {
    band: "top",
    u: 0.87,
    k: 1,
    look: { name: "pixle-red", tilt: [0, -0.35, 0.1], motion: "sway", phase: 0, depth: 1 },
  },
  {
    band: "bottom",
    u: 0.15,
    k: 0.86,
    look: { name: "money-1", tilt: [0.1, 0.4, 0.12], motion: "spin", phase: 4.2, depth: 0.8 },
  },
  {
    band: "bottom",
    u: 0.5,
    k: 0.7,
    minWidth: HERO_MOBILE_MAX,
    look: { name: "zap", tilt: [0, 0.2, 0.16], motion: "rock", phase: 2.1, depth: 0.5 },
  },
  {
    band: "bottom",
    u: 0.85,
    k: 1,
    look: { name: "love", tilt: [0, -0.4, -0.1], motion: "bob", phase: 5.1, depth: 1 },
  },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/**
 * Hero pieces for a box of `width` × `height` CSS px. Wide boxes fill the side columns beside the
 * centred text; narrower ones sit in the clear top and bottom bands. Pieces never cross into text.
 */
export function heroLayout(width: number, height: number): Piece[] {
  if (width <= 0 || height <= 0) return [];
  if (width >= HERO_WIDE_MIN) {
    const column = (width - HERO_TEXT_MAX) / 2;
    const base = Math.min(column * 0.62, height * 0.2, 180);
    return COLUMN.map((spec) => {
      const size = base * spec.k;
      const across = clamp(spec.u * column, size / 2 + PAD, column - size / 2 - PAD);
      return {
        ...spec.look,
        size,
        x: spec.side === "left" ? across : width - across,
        y: clamp(spec.v * height, size / 2 + PAD, height - size / 2 - PAD),
      };
    });
  }
  return BAND.filter((spec) => width >= (spec.minWidth ?? 0)).map((spec) => {
    const band = height * (spec.band === "top" ? HERO_CLEAR_TOP : HERO_CLEAR_BOTTOM);
    const size = Math.min((band - 2 * PAD) * 0.92, width * 0.24, 132) * spec.k;
    return {
      ...spec.look,
      size,
      x: clamp(spec.u * width, size / 2 + PAD, width - size / 2 - PAD),
      y: spec.band === "top" ? band / 2 : height - band / 2,
    };
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
