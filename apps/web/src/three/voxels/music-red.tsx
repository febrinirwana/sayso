import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const MusicRedMesh = defineVoxel(
  "MusicRedMesh",
  [
    "...rrr..",
    "...rrrr.",
    "...r..rr",
    "...r..rr",
    "...r.rr.",
    "...r.r..",
    "...r....",
    ".rrr....",
    "rrrr....",
    "rrrr....",
    ".rr.....",
  ],
  {
    r: { color: VOXEL_COLOR.red },
  },
);
