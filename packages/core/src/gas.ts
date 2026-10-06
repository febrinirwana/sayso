// Monad-mode fork, block 68,394,814: isolated receipt gas, real AUSD + Kuru.
// SMART-CONTRACTS section 8 owns the measurements and their limits.
const CREATE = [
  974_249n,
  1_377_835n,
  1_781_421n,
  2_185_007n,
  2_588_594n,
  2_992_180n,
  3_395_766n,
] as const;
const LIST = [
  2_528_288n,
  3_698_380n,
  4_868_471n,
  6_038_563n,
  7_208_654n,
  8_378_746n,
  9_559_637n,
] as const;
const EVIDENCE = [
  49_483n,
  58_540n,
  67_596n,
  76_653n,
  85_709n,
  94_766n,
  103_822n,
  112_879n,
] as const;
const REPORT = [
  61_186n,
  77_999n,
  93_484n,
  108_981n,
  124_454n,
  139_951n,
  155_436n,
  170_921n,
] as const;
const SINGLE = {
  flagSaid: 53_221n,
  closeEpisode: 42_511n,
  mintSet: 323_680n,
  // Offline gas-report maximum for the real-signature permit path; remeasure live AUSD at S1.
  mintSetWithPermit: 375_872n,
  burnSet: 187_795n,
  redeem: 186_557n, // maximum observed: Void NO after the YES redemption
  voidWord: 106_086n,
  buyYes: 395_823n,
  sellYes: 422_343n,
  buyNo: 480_513n,
  sellNo: 598_681n,
} as const;

export type GasKind =
  | keyof typeof SINGLE
  | "createEpisode"
  | "listEpisode"
  | "markEvidence"
  | "onReport";

/** Measured gas + 20%, rounded up. Counts: episode words (2–8), evidence/report words (1–8).
 * Episode default is six words; batch default is one. Trade measurements use manual books;
 * this is not a universal upper bound for arbitrary order-book depth.
 */
export function gasLimit(kind: GasKind, count?: number): bigint {
  let measured: bigint;
  if (kind === "createEpisode" || kind === "listEpisode") {
    const words = count ?? 6;
    measured = forCount(kind === "createEpisode" ? CREATE : LIST, words, 2);
  } else if (kind === "markEvidence" || kind === "onReport") {
    const words = count ?? 1;
    measured = forCount(kind === "markEvidence" ? EVIDENCE : REPORT, words, 1);
  } else {
    measured = SINGLE[kind];
  }
  return gasWithMargin(measured);
}

/** Use the same margin for actual-call RPC estimates where no measured table entry exists. */
export function gasWithMargin(measured: bigint): bigint {
  if (measured <= 0n) throw new RangeError("Gas estimate must be positive");
  return (measured * 120n + 99n) / 100n;
}

function forCount(table: readonly bigint[], count: number, minimum: number): bigint {
  const measured = table[count - minimum];
  if (!Number.isInteger(count) || measured === undefined) {
    throw new RangeError(`Measured gas requires an integer word count from ${minimum} to 8`);
  }
  return measured;
}
