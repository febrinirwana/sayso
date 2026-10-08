import type { VoxelName } from "@/assets/voxels/names";

/** Envio BigInt fields are normalized to bigint at the adapter boundary. All money is 6-decimal AUSD. */
export type RecordWordState = "Open" | "SaidPending" | "Yes" | "No" | "Void";
export type RecordTrade = {
  id: string;
  side: 0 | 1 | 2 | 3;
  tokenAmount: bigint;
  ausdAmount: bigint;
  priceBps: number;
  timestamp: bigint;
  block: bigint;
  txUrl?: string;
};
export type TranscriptEvidence = {
  engine: "A" | "B";
  index: number;
  startMs: number;
  endMs: number;
  tokens: readonly (readonly [word: string, startMs: number, endMs: number])[];
  leaf: string;
  proof: readonly string[];
  root: string;
  /** NO requires all verified chunks, not just one absent word in a snippet. */
  verifiedChunkCount?: number;
  totalChunkCount?: number;
};
export type WordProof = {
  engines: readonly [TranscriptEvidence, TranscriptEvidence];
  evidenceHash: string;
  resolveTx: string | null;
  resolveTxUrl?: string;
  commitmentTxUrl?: string;
  mode: "don" | "simulation";
  specimen?: boolean;
};
export type ResultWord = {
  id: string;
  text: string;
  state: RecordWordState;
  profit: bigint;
  trades: readonly RecordTrade[];
  proof?: WordProof;
  proofStatus?: string;
  roots?: readonly [string, string];
  evidenceHash?: string | null;
  resolveTxUrl?: string;
  settlementMode?: "simulation" | "don";
  accountingUnavailable?: boolean;
};
export type PortfolioPosition = {
  id: string;
  episode: { id: string; state: "Scheduled" | "Live" | "Closed" | "Settled"; label: string };
  word: { id: string; text: string; state: RecordWordState; marketUrl?: string };
  yes: bigint;
  no: bigint;
  cashIn: bigint;
  cashOut: bigint;
  redeemed: bigint;
  /** Derived from side-specific indexed fills; not stored on Position. */
  averageYesPriceBps: number | null;
  averageNoPriceBps: number | null;
  /** A fresh book quote, separate from Envio's balance. */
  currentYesPriceBps: number | null;
};
export type LeaderboardEntry = {
  id: string;
  nickname: string;
  profit: bigint;
  trades: number;
  rank: number;
  /** Previous settled rank supplied by the adapter; schema doesn't retain it. */
  previousRank: number | null;
  avatar: VoxelName;
};
