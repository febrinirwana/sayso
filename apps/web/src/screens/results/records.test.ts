import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Leaderboard } from "../leaderboard/Leaderboard";
import { Portfolio } from "../portfolio/Portfolio";
import { amount, positionValue, price, shares } from "./format";
import { Results } from "./Results";
import type { TranscriptEvidence } from "./types";
import { WordResult } from "./WordResult";

// These catch float precision loss, settled-side valuation errors, and unavailable actions.
describe("record amounts", () => {
  it("formats six-decimal amounts without converting the balance to a float", () => {
    expect(amount(9_007_199_254_740_993n)).toBe("9,007,199,254.74");
    expect(amount(-1_234_567n, true)).toBe("−1.23");
    expect(amount(1_230_000n, true)).toBe("+1.23");
    expect(shares(1_234_567n)).toBe("1.234567");
    expect(price(6200)).toBe("62¢");
  });
  it("values both sides independently and floors void payouts per side", () => {
    expect(positionValue(3_000_000n, 2_000_000n, "Yes", 6200)).toBe(3_000_000n);
    expect(positionValue(3_000_000n, 2_000_000n, "No", 6200)).toBe(2_000_000n);
    expect(positionValue(3n, 3n, "Void", 6200)).toBe(2n);
    expect(positionValue(3_000_000n, 2_000_000n, "Open", 6200)).toBe(2_620_000n);
  });
});

describe("record surfaces", () => {
  it("highlights normalized matches in both engines and exposes the supplied CRE transaction", () => {
    const engineA: TranscriptEvidence = {
      engine: "A",
      index: 0,
      startMs: 0,
      endMs: 10000,
      tokens: [["pressures", 7100, 7400]],
      root: "test-root-A",
      leaf: "test-leaf-A",
      proof: [],
    };
    const html = renderToStaticMarkup(
      createElement(WordResult, {
        index: 0,
        expanded: true,
        word: {
          id: "settled",
          text: "Pressure",
          state: "Yes",
          profit: 0n,
          trades: [],
          proof: {
            engines: [engineA, { ...engineA, engine: "B", root: "test-root-B" }],
            evidenceHash: "test-evidence",
            resolveTx: "test-tx",
            resolveTxUrl: "https://example.test/transaction",
            mode: "simulation",
          },
        },
      }),
    );
    expect(html.match(/<mark /g)).toHaveLength(2);
    expect(html).toContain("test-root-A");
    expect(html).toContain("test-root-B");
    expect(html).toContain('href="https://example.test/transaction"');
    expect(html).toContain("Verified by Chainlink CRE");
    expect(html).toContain("committed before trading");
  });
  it("never presents an unsettled word's profit as a final result", () => {
    const html = renderToStaticMarkup(
      createElement(WordResult, {
        index: 0,
        word: {
          id: "pending",
          text: "Pressure",
          state: "Open",
          profit: 9_990_000n,
          trades: [
            {
              id: "trade",
              side: 0,
              tokenAmount: 5_000_000n,
              ausdAmount: 2_500_000n,
              priceBps: 5000,
              timestamp: 0n,
              block: 0n,
            },
          ],
        },
      }),
    );
    expect(html).not.toContain("9.99");
    expect(html).toContain("waiting for CRE");
  });
  it("does not offer redemption while settlement is pending", () => {
    const html = renderToStaticMarkup(
      createElement(Results, {
        episodeId: "42",
        state: "settling",
        profit: 0n,
        redeemable: 0n,
        words: [],
        onRedeem: () => {},
        onPlayNext: () => {},
      }),
    );
    expect(html).toContain("Waiting for the final word");
    expect(html).not.toContain("Redeem AUSD");
  });
  it("gives empty portfolios a route back to play", () => {
    const html = renderToStaticMarkup(
      createElement(Portfolio, {
        tab: "open",
        onTabChange: () => {},
        positions: [],
        redeemable: 0n,
        redeemState: "idle",
        onRedeemAll: () => {},
        onPlay: () => {},
      }),
    );
    expect(html).toContain("Your next good call starts here");
    expect(html).toContain("Find an episode");
  });
  it("labels a pinned player even when they are outside the leading rows", () => {
    const html = renderToStaticMarkup(
      createElement(Leaderboard, {
        tab: "episode",
        episodeId: "42",
        onTabChange: () => {},
        leaders: [],
        you: {
          id: "specimen-player",
          nickname: "Cosmic Duck",
          rank: 18,
          previousRank: 20,
          profit: 1_230_000n,
          trades: 3,
          avatar: "duck",
        },
      }),
    );
    expect(html).toContain("Cosmic Duck");
    expect(html).toContain("Your place");
    expect(html).toContain("TESTNET");
  });
});
