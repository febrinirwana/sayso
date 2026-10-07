import type { VoxelName } from "@/assets/voxels/names";
import { AlienMesh } from "./alien";
import type { VoxelMesh } from "./define";
import { GameConsoleMesh } from "./game-console";
import { GlobeMesh } from "./globe";
import { LoveMesh } from "./love";
import { Money1Mesh } from "./money-1";
import { Money2Mesh } from "./money-2";
import { MusicBlueMesh } from "./music-blue";
import { MusicRedMesh } from "./music-red";
import { PinkArrowMesh } from "./pink-arrow";
import { PixleMesh } from "./pixle";
import { PixleRedMesh } from "./pixle-red";
import { RedAlienMesh } from "./red-alien";
import { StarMesh } from "./star";
import { ZapMesh } from "./zap";

export type { VoxelMesh, VoxelMeshProps } from "./define";
export { VOXEL_COLOR } from "./palette";

/** Procedural voxel meshes, keyed by the name of their matching WebP sticker. */
export const voxelMeshes = {
  alien: AlienMesh,
  "game-console": GameConsoleMesh,
  globe: GlobeMesh,
  love: LoveMesh,
  "money-1": Money1Mesh,
  "money-2": Money2Mesh,
  "music-blue": MusicBlueMesh,
  "music-red": MusicRedMesh,
  "pink-arrow": PinkArrowMesh,
  pixle: PixleMesh,
  "pixle-red": PixleRedMesh,
  "red-alien": RedAlienMesh,
  star: StarMesh,
  zap: ZapMesh,
} as const satisfies Partial<Record<VoxelName, VoxelMesh>>;

export type VoxelMeshName = keyof typeof voxelMeshes;
