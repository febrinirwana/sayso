import { describe, expect, it } from "vitest";
import { claimCelebration, confirmRedeem, redeemPayout } from "./celebration";

describe("redeem celebration", () => {
  it("plays once per confirmed redeem, even when the card remounts", () => {
    const first = confirmRedeem(20_000_000n);
    expect(claimCelebration(first)).toBe(true);
    expect(claimCelebration(first)).toBe(false);
    const second = confirmRedeem(7_500_000n);
    expect(claimCelebration(second)).toBe(true);
    expect(claimCelebration(first)).toBe(false);
    expect(claimCelebration(second)).toBe(false);
  });

  it.each([
    ["Yes", 5_000_000n, 5_000_000n],
    ["No", 5_000_000n, 5_000_000n],
    ["Void", 5_000_001n, 2_500_000n],
  ] as const)("counts up the AUSD a %s word actually paid", (state, shares, paid) => {
    expect(redeemPayout(state, shares)).toBe(paid);
  });
});
