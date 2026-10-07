import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const AlienMesh = defineVoxel(
  "AlienMesh",
  [
    ".....gggg.....",
    "...ggllllgg...",
    "..gllllllllg..",
    ".gllllllllllg.",
    ".gllllllllllg.",
    "gllllllllllllg",
    "glKKKllllKKKlg",
    "glKWKKllKKWKlg",
    "glKKKKllKKKKlg",
    ".glKKKllKKKlg.",
    ".gllKKllKKllg.",
    "..gllllllllg..",
    "..gllllllllg..",
    "...gllllllg...",
    "....gllllg....",
    ".....gllg.....",
    "......gg......",
  ],
  {
    g: { color: VOXEL_COLOR.green },
    l: { color: VOXEL_COLOR.lime },
    K: { color: VOXEL_COLOR.ink, depth: 1.4 },
    W: { color: VOXEL_COLOR.white, depth: 1.4 },
  },
);
