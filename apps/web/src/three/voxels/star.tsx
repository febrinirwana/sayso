import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const StarMesh = defineVoxel(
  "StarMesh",
  [
    ".........k.........",
    "........kyk........",
    ".......kyyyk.......",
    ".......kyyyk.......",
    "......kyyyyyk......",
    "......kyyyyyk......",
    "kkkkkkyyyyyyykkkkkk",
    "kyyyyyyKyyyKyyyyyyk",
    ".kyyyyyKyyyKyyyyyk.",
    "..kyyypKyyyKpyyyk..",
    "...kyyppyyyppyyk...",
    "....kyyyyyyyyyk....",
    "....kyyyyyyyyyk....",
    "...kyyyyyyyyyyyk...",
    "...kyyyykkkyyyyk...",
    "..kyyykk...kkyyyk..",
    "..kyyk.......kyyk..",
    "..kkk.........kkk..",
  ],
  {
    y: { color: VOXEL_COLOR.yellow },
    k: { color: VOXEL_COLOR.ink },
    p: { color: VOXEL_COLOR.pink },
    K: { color: VOXEL_COLOR.ink, depth: 1.3 },
  },
);
