import { defineVoxel } from "./define";
import { VOXEL_COLOR } from "./palette";

export const PinkArrowMesh = defineVoxel(
  "PinkArrowMesh",
  [
    ".....ppp.....",
    "....ppppp....",
    "...ppppppp...",
    "..ppppppppp..",
    ".ppppppppppp.",
    "pppp.ppp.pppp",
    "ppp..ppp..ppp",
    "pp...ppp...pp",
    "p....ppp....p",
    ".....ppp.....",
    ".....ppp.....",
    ".....ppp.....",
    ".....ppp.....",
    ".....ppp.....",
    ".....ppp.....",
    ".....ppp.....",
  ],
  {
    p: { color: VOXEL_COLOR.pink },
  },
);
