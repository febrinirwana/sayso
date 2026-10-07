import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const Money2Mesh = defineVoxel(
  "Money2Mesh",
  [
    ".......kkkkk......",
    ".......kyyyk......",
    "....kkkkyyykkkk...",
    "..kkkyyyyyyyyyk...",
    "kkkyyyyyyyyyyyyk..",
    "kyyyyyyyyyyyyyyyk.",
    "kyyyyyyyyyyyyyyyyk",
    "kyyyyyyyyyykkkyyk.",
    "kyyyyyyKyyyk..kk..",
    "kyyyyyKKyyyk......",
    ".kyyyyyKyyyk......",
    "..kyyyyyyyyykkk...",
    "...kkyyyyyyyyyyk..",
    ".....kkyyyyyyyyyk.",
    ".......kyyyyyyyyyk",
    "....kk.kyyyKyyyyyk",
    "...kyykkyyyKKyyyyk",
    ".kkyyyyyyyyKyyyyyk",
    ".kyyyyyyyyyyyyyyyk",
    "..kyyyyyyyyyyyyyk.",
    "...kyyyyyyyyyyyk..",
    "....kkkyyyyyykk...",
    "......kyyykkk.....",
    "......kyyykk......",
    "......kkkkk.......",
  ],
  {
    y: { color: VOXEL_COLOR.yellow },
    k: { color: VOXEL_COLOR.ink },
    K: { color: VOXEL_COLOR.ink, depth: 1.25 },
  },
);
