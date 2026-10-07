import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const GameConsoleMesh = defineVoxel(
  "GameConsoleMesh",
  [
    ".rrrrrrr.",
    "rkkkkkkkr",
    "rkbbbbbkr",
    "rkbbbbbkr",
    "rkbbbbbkr",
    "rkbbbbbkr",
    "rkkkkkkkr",
    "rrrrrrrrr",
    "rrrrrrrrr",
    "rrKrrKrrr",
    "rKKKrrKrr",
    "rrKrrrrrr",
    "rrrrrrrrr",
    ".rrrrrrr.",
  ],
  {
    r: { color: VOXEL_COLOR.red },
    k: { color: VOXEL_COLOR.ink },
    K: { color: VOXEL_COLOR.ink, depth: 1.3 },
    b: { color: VOXEL_COLOR.blue },
  },
);
