import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const LoveMesh = defineVoxel(
  "LoveMesh",
  [
    "..rrr...rrr..",
    ".rrrrr.rrrrr.",
    "rrrrrrrrrrrrr",
    "rrrrrrrrrrrrr",
    "rrrrrrrrrrrrr",
    "rrrrrrrrrrrrr",
    ".rrrrrrrrrrr.",
    "..rrrrrrrrr..",
    "...rrrrrrr...",
    "....rrrrr....",
    ".....rrr.....",
    "......r......",
  ],
  {
    r: { color: VOXEL_COLOR.red },
  },
);
