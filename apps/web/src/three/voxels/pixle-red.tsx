import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const PixleRedMesh = defineVoxel(
  "PixleRedMesh",
  [
    ".....rrrr.....",
    "...rrrrrrrr...",
    "..rrrrrrrrrr..",
    ".rrrwwrrrrwwr.",
    ".rrwwwwrrwwww.",
    ".rrwwwwrrwwww.",
    ".rrwwKKrrwwKK.",
    "rrrwwKKrrwwKKr",
    "rrrrwwrrrwwwwr",
    "rrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrr",
    "rrrrrrrrrrrrrr",
    "rr.rrr..rrr.rr",
    "r...rr..rr...r",
  ],
  {
    r: { color: VOXEL_COLOR.red },
    w: { color: VOXEL_COLOR.white },
    K: { color: VOXEL_COLOR.ink, depth: 1.4 },
  },
);
