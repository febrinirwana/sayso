import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const MusicBlueMesh = defineVoxel(
  "MusicBlueMesh",
  [
    "...bbbbbb",
    "...bbbbbb",
    "...b....b",
    "...b....b",
    "...b....b",
    ".bbb....b",
    "bbbb..bbb",
    "bbbb.bbbb",
    ".bb..bbbb",
    "......bb.",
  ],
  {
    b: { color: VOXEL_COLOR.blue },
  },
);
