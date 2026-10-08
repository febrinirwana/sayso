import { nicknameOf } from "../../../../../packages/core/src/nickname";
import type { AccountScreenProps } from "../account/AccountScreen";
import type {
  ArenaEpisode,
  ArenaSchedule,
  RecentArenaEpisode,
  StarterBalance,
} from "../arena/ArenaScreen";
import type { JoinState } from "./JoinScreen";

// Synthetic display fixtures only: no clip manifest, transcript or outcome plan.
// Public schedule names match studio runner.schedule(); amounts match DripStatus.
export const PLAYER_ADDRESS = "0x0000000000000000000000000000000000000001";
export const PLAYER_NICKNAME = nicknameOf(PLAYER_ADDRESS);
export const SPECIMEN_NOW = 1_791_417_600_000;
export const PLAYER_BALANCES: AccountScreenProps["balances"] = {
  monWei: 500_000_000_000_000_000n,
  ausd: 124_500_000n,
};
const words = ["Championship", "Pressure", "Legacy", "Fans", "Extraordinary", "Trophy"].map(
  (text, index) => ({ wordId: index + 1, text }),
);
const schedule: ArenaSchedule = {
  episodeId: 42,
  startsAtMs: SPECIMEN_NOW - 47_000,
  endsAtMs: SPECIMEN_NOW + 137_000,
  state: "Live",
  words,
};
export const RECENT_EPISODES: readonly RecentArenaEpisode[] = [
  {
    episodeId: 41,
    title: "A good call",
    saidWords: ["Tomorrow", "Team", "Believe"],
    settledAt: SPECIMEN_NOW - 600_000,
  },
  {
    episodeId: 40,
    title: "Big ideas, little words",
    saidWords: ["Future", "Imagine"],
    settledAt: SPECIMEN_NOW - 3_600_000,
  },
  {
    episodeId: 39,
    title: "The crowd goes wild",
    saidWords: ["Ready", "Game", "Together"],
    settledAt: SPECIMEN_NOW - 7_200_000,
  },
];
export const JOIN_STATES: Record<string, JoinState> = {
  "join-idle": { status: "idle" },
  "join-waiting": { status: "waiting" },
  "join-creating": { status: "creating" },
  "join-unsupported": { status: "prf-unavailable" },
  "join-error": {
    status: "error",
    message: "The passkey prompt was dismissed. Nothing was created. Try again when you’re ready.",
  },
};
export const ARENA_STATES: Record<string, ArenaEpisode> = {
  "arena-live": { status: "live", title: "The pressure is on.", schedule },
  "arena-next": {
    status: "scheduled",
    title: "Your next round awaits.",
    schedule: {
      ...schedule,
      state: "Scheduled",
      startsAtMs: SPECIMEN_NOW + 42_000,
      endsAtMs: SPECIMEN_NOW + 226_000,
    },
  },
  "arena-idle": { status: "idle" },
  "arena-starting": { status: "starting" },
  "arena-queued": { status: "queued", episodeId: 43 },
};
export const STARTER_STATES: Record<string, StarterBalance> = {
  "arena-claiming": { status: "claiming" },
  "arena-received": {
    status: "received",
    amounts: { monWei: "500000000000000000", ausd: "10000000" },
  },
  "arena-claimed": { status: "already-claimed" },
};
export const PLAYER_SPECIMENS = [
  ["join-idle", "Join · ready"],
  ["join-waiting", "Join · prompt"],
  ["join-creating", "Join · creating"],
  ["join-unsupported", "Join · unsupported"],
  ["join-error", "Join · error"],
  ["arena-live", "Arena · live"],
  ["arena-next", "Arena · next"],
  ["arena-idle", "Arena · idle"],
  ["arena-starting", "Arena · starting"],
  ["arena-queued", "Arena · queued"],
  ["arena-claiming", "Arena · claiming"],
  ["arena-received", "Arena · received"],
  ["arena-claimed", "Arena · claimed"],
  ["arena-empty", "Arena · first round"],
  ["account", "Account · ready"],
  ["account-copied", "Account · copied"],
  ["account-copy-error", "Account · copy error"],
  ["account-restore", "Account · restore guide"],
  ["account-verified", "Account · restored"],
] as const;
