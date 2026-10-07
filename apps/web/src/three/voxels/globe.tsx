import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const GlobeMesh = defineVoxel(
  "GlobeMesh",
  [
    ".....GGGGG.....",
    "...GGGGGGGGb...",
    ".GGGGGGGGGGbbb.",
    ".GGGGGGGGGGbbb.",
    "GGGGGbbbGbbbbbb",
    "bGGGGbbbbbbbbGG",
    "bbbbGGGbbbbbbGG",
    "bbbbGGGGbbbbbGG",
    "bbbGGGGGGbbbbbG",
    "GbbGGGGGGGbbbbG",
    ".bbbbGGGGGbbbb.",
    ".bbbbGGGGGbbbb.",
    "...bbGGGGbbb...",
    ".....GGbbb.....",
  ],
  {
    b: { color: VOXEL_COLOR.blue },
    G: { color: VOXEL_COLOR.green, depth: 1.3 },
  },
);
