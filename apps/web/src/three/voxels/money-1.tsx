import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const Money1Mesh = defineVoxel(
  "Money1Mesh",
  [
    "....ccccccc....",
    "..ccccccccccc..",
    ".ccccccKcccccc.",
    ".cccKKKKKKKccc.",
    ".cccKccccccccc.",
    "ccccKcccccccccc",
    "ccccKcccccccccc",
    "cccccKKKKKccccc",
    "ccccccccccKcccc",
    ".cccccccccKccc.",
    ".cccKKKKKKKccc.",
    ".ccccccKcccccc.",
    "..ccccccccccc..",
    "....ccccccc....",
  ],
  {
    c: { color: VOXEL_COLOR.coin },
    K: { color: VOXEL_COLOR.ink, depth: 1.25 },
  },
);
