import { Matrix4 } from "three";
import { type Batch, voxelGeometry, voxelMaterial } from "../voxels/define";
import { VOXEL_COLOR } from "../voxels/palette";
import { MASCOT_BODY, MASCOT_FACE, MASCOT_FACE_ORIGIN, MASCOT_FACE_SCALE } from "./grid";

// The SaySo mascot as voxels: a red bubble body inside an ink rim that stands proud of it, like a
// thick sticker, with the eyes and smile as separate pieces so they can blink, wink and talk.

const ROWS = MASCOT_BODY.length;
const COLS = MASCOT_BODY[0].length;

/** Largest side in cells; one cell is one world unit before scaling. */
export const MASCOT_SPAN = Math.max(ROWS, COLS);
/** Half-depth of the ink rim and of the red body, in cells. */
const RIM = 1.9;
const BODY = 1.45;
/** Face pieces sit on the body's front with this much proud, and are this deep. */
const FACE_DEPTH = 0.55;
export const FACE_Z = BODY + FACE_DEPTH / 2 - 0.1;
/** Bottom of the body in cells below its centre: where a contact shadow sits. */
export const MASCOT_FOOT = ROWS / 2;

const m = new Matrix4();

function batch(key: string, color: string, cells: [number, number, number, number][]): Batch {
  // [x, y, size, depth] per cell; one shared unit box scaled per instance.
  const matrices = new Float32Array(cells.length * 16);
  cells.forEach(([x, y, size, depth], i) => {
    m.makeScale(size, size, depth).setPosition(x, y, 0);
    m.toArray(matrices, i * 16);
  });
  return {
    key,
    geometry: voxelGeometry(1),
    material: voxelMaterial(color),
    count: cells.length,
    matrices,
  };
}

function buildBody(): Batch[] {
  const rim: [number, number, number, number][] = [];
  const red: [number, number, number, number][] = [];
  MASCOT_BODY.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const v = row.charAt(c);
      if (v === ".") continue;
      const x = c + 0.5 - COLS / 2;
      const y = ROWS / 2 - (r + 0.5);
      if (v === "k") rim.push([x, y, 1, RIM * 2]);
      else red.push([x, y, 1, BODY * 2]);
    }
  });
  return [batch("rim", VOXEL_COLOR.ink, rim), batch("body", VOXEL_COLOR.red, red)];
}

export type FacePart = { batch: Batch; x: number; y: number };

/** One face part, its cells relative to its own centre so it scales about itself. */
function buildFacePart(tag: "L" | "R" | "S"): FacePart {
  const s = MASCOT_FACE_SCALE;
  const [ox, oy] = MASCOT_FACE_ORIGIN;
  const points: [number, number][] = [];
  MASCOT_FACE.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row.charAt(c) !== tag) continue;
      points.push([(ox + c + 0.5) / s - COLS / 2, ROWS / 2 - (oy + r + 0.5) / s]);
    }
  });
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  cx /= points.length;
  cy /= points.length;
  // Cells overlap a hair so the white reads as one shape, not a mosaic.
  const size = 1 / s + 0.02;
  return {
    batch: batch(
      tag,
      VOXEL_COLOR.white,
      points.map(([x, y]) => [x - cx, y - cy, size, FACE_DEPTH]),
    ),
    x: cx,
    y: cy,
  };
}

export const MASCOT_PARTS = {
  body: buildBody(),
  eyeL: buildFacePart("L"),
  eyeR: buildFacePart("R"),
  smile: buildFacePart("S"),
};
