import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const RedAlienMesh = defineVoxel(
  "RedAlienMesh",
  [
    "...r........r...",
    "....r......r....",
    "...rrrrrrrrrr...",
    "..rrrrrrrrrrrr..",
    ".rrrrrrrrrrrrrr.",
    "rrrrrrrrrrrrrrrr",
    "r..r........r..r",
    "r..r........r..r",
    "r..r........r..r",
    "....rrr..rrr....",
  ],
  {
    r: { color: VOXEL_COLOR.red },
  },
);
