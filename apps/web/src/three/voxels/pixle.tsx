import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const PixleMesh = defineVoxel(
  "PixleMesh",
  [
    "....yyyyyy...",
    "..yyyyyyyyyy.",
    ".yyyyyyyyyyyy",
    ".yyyyKKyyyyyy",
    ".yyyyKKyyyyyy",
    "yyyyyyyyyy...",
    "yyyyyyy......",
    "yyyy.........",
    "yyyyyyy......",
    ".yyyyyyyyy...",
    ".yyyyyyyyyyyy",
    ".yyyyyyyyyyyy",
    "..yyyyyyyyyy.",
    "....yyyyyy...",
  ],
  {
    y: { color: VOXEL_COLOR.yellow },
    K: { color: VOXEL_COLOR.ink, depth: 1.3 },
  },
);
