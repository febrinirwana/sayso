import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const ZapMesh = defineVoxel(
  "ZapMesh",
  [
    "....yyyyyyyyy.",
    "....yyyyyyyy..",
    "...yyyyyyyy...",
    "...yyyyyyy....",
    "..yyyyyyy.....",
    "..yyyyyy......",
    ".yyyyyy.......",
    ".yyyyy........",
    "yyyyyyyyyyyyyy",
    "yyyyyyyyyyyyy.",
    "........yyyy..",
    "........yyy...",
    ".......yyy....",
    ".......yy.....",
    "......yy......",
    "......y.......",
  ],
  {
    y: { color: VOXEL_COLOR.yellow },
  },
);
