import { createTestIndexer, type TestIndexerProcessConfig } from "envio";
import { describe, expect, it } from "vitest";

// Synthetic addresses only: no contract has been deployed.
const A = "0x00000000000000000000000000000000000000a1";
const B = "0x00000000000000000000000000000000000000b1";
const ZERO = "0x0000000000000000000000000000000000000000";
const MARKETS = "0x00000000000000000000000000000000000000c1";
const BOOK = "0x00000000000000000000000000000000000000d1";
const TX = `0x${"ab".repeat(32)}`;
const ROOT = `0x${"cd".repeat(32)}`;
const TEXT = `0x${Buffer.from("monad").toString("hex").padEnd(64, "0")}`;
const U = 1_000_000n;
type Sim = NonNullable<NonNullable<TestIndexerProcessConfig["chains"][10143]>["simulate"]>[number];
type MarketEvent = Extract<Sim, { contract: "SaysoMarkets" }>;
const yes = (id: bigint) => `0x${(1000n + id * 2n).toString(16).padStart(40, "0")}` as const;
const no = (id: bigint) => `0x${(1001n + id * 2n).toString(16).padStart(40, "0")}` as const;
function market(event: MarketEvent): Sim {
  return { srcAddress: MARKETS, transaction: { hash: TX }, block: { timestamp: 1000 }, ...event };
}
function transfer(
  token: `0x${string}`,
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
): Sim {
  return {
    contract: "OutcomeToken",
    event: "Transfer",
    srcAddress: token,
    params: { from, to, value },
    block: { timestamp: 1000 },
  };
}
function episode(episodeId = 1n, wordIds = [1n]): Sim[] {
  return [
    market({
      contract: "SaysoMarkets",
      event: "EpisodeCreated",
      params: { episodeId, clipId: ROOT, rootA: ROOT, rootB: ROOT, startsAt: 900n, endsAt: 1200n },
    }),
    ...wordIds.flatMap((wordId): Sim[] => [
      market({
        contract: "SaysoMarkets",
        event: "WordAdded",
        params: { episodeId, wordId, text: TEXT, yes: yes(wordId), no: no(wordId) },
      }),
      market({ contract: "SaysoMarkets", event: "WordListed", params: { wordId, market: BOOK } }),
    ]),
  ];
}
function trade(
  wordId: bigint,
  account: typeof A | typeof B,
  side: bigint,
  tokenAmount: bigint,
  ausdAmount: bigint,
): Sim {
  return market({
    contract: "SaysoMarkets",
    event: "Traded",
    params: { wordId, account, side, tokenAmount, ausdAmount },
  });
}
function resolve(wordId: bigint, outcome: bigint, episodeId = 1n): Sim {
  return market({
    contract: "SaysoMarkets",
    event: "WordResolved",
    params: { episodeId, wordId, outcome, evidenceHash: ROOT },
  });
}
const run = async (simulate: Sim[]) => {
  const indexer = createTestIndexer();
  await indexer.process({
    chains: {
      10143: {
        simulate: simulate.map((event) => ({ ...event, block: { ...event.block, number: 1 } })),
      },
    },
  });
  return indexer;
};

describe("SAYSO event read model", () => {
  it("commits episode roots, discovers clones, and only CRE outcomes settle a flag", async () => {
    const indexer = await run([
      ...episode(),
      market({
        contract: "SaysoMarkets",
        event: "WordFlagged",
        params: { episodeId: 1n, wordId: 1n, chunkA: 2n, chunkB: 3n, offsetMs: 22500n },
      }),
      market({
        contract: "SaysoMarkets",
        event: "EvidenceReady",
        params: { episodeId: 1n, wordIds: [1n] },
      }),
      market({ contract: "SaysoMarkets", event: "EpisodeClosed", params: { episodeId: 1n } }),
    ]);
    expect(await indexer.Episode.get("1")).toMatchObject({
      clipId: ROOT,
      rootA: ROOT,
      rootB: ROOT,
      startsAt: 900n,
      endsAt: 1200n,
      state: "Closed",
      wordCount: 1,
      resolvedCount: 0,
      closedAt: 1000n,
    });
    expect(await indexer.Word.get("1")).toMatchObject({
      episode_id: "1",
      text: "monad",
      yes: yes(1n),
      no: no(1n),
      market: BOOK,
      state: "SaidPending",
      offsetMs: 22500,
      flaggedAt: 1000n,
      outcome: undefined,
    });
    expect(indexer.chains[10143].OutcomeToken.addresses).toContain(yes(1n));
    expect(indexer.chains[10143].OutcomeToken.addresses).toContain(no(1n));
  });

  it("counts all four trade cash flows once and takes balances including sellNo dust from Transfers", async () => {
    const indexer = await run([
      ...episode(),
      transfer(yes(1n), ZERO, A, 4n * U),
      trade(1n, A, 0n, 4n * U, 2n * U),
      transfer(yes(1n), A, ZERO, U),
      trade(1n, A, 1n, U, 980_000n),
      transfer(no(1n), ZERO, A, 2n * U),
      trade(1n, A, 2n, 2n * U, 600_000n),
      transfer(no(1n), A, ZERO, U),
      transfer(yes(1n), ZERO, A, 195n),
      trade(1n, A, 3n, U, 700_000n),
      // Zero-fill trades cannot divide by zero and do not invent volume.
      trade(1n, A, 0n, 0n, 0n),
    ]);
    expect(await indexer.Position.get(`${A}-1`)).toMatchObject({
      yes: 3n * U + 195n,
      no: U,
      cashOut: 2_600_000n,
      cashIn: 1_680_000n,
    });
    expect(await indexer.Player.get(A)).toMatchObject({
      trades: 5,
      volume: 4_280_000n,
      cashIn: 1_680_000n,
      cashOut: 2_600_000n,
      settledValue: 0n,
      profit: 0n,
      episodesPlayed: 1,
      firstSeen: 1000n,
    });
    const trades = await indexer.Trade.getAll();
    expect(trades.map((row) => [row.side, row.priceBps])).toEqual([
      [0, 5000],
      [1, 9800],
      [2, 3000],
      [3, 7000],
      [0, 0],
    ]);
    expect(trades[0]).toMatchObject({
      word_id: "1",
      player_id: A,
      tokenAmount: 4n * U,
      ausdAmount: 2n * U,
      timestamp: 1000n,
    });
    expect(trades[0]?.id).toMatch(new RegExp(`^${TX}-[0-9]+$`));
  });

  it("mints and burns complete sets without doubling Transfer balances", async () => {
    const indexer = await run([
      ...episode(),
      transfer(yes(1n), ZERO, A, 3n * U),
      transfer(no(1n), ZERO, A, 3n * U),
      market({
        contract: "SaysoMarkets",
        event: "SetMinted",
        params: { wordId: 1n, payer: A, account: A, amount: 3n * U },
      }),
      transfer(yes(1n), A, ZERO, U),
      transfer(no(1n), A, ZERO, U),
      market({
        contract: "SaysoMarkets",
        event: "SetBurned",
        params: { wordId: 1n, account: A, recipient: A, amount: U },
      }),
      transfer(yes(1n), A, B, 500_000n),
      transfer(yes(1n), B, B, 100_000n),
      resolve(1n, 2n),
    ]);
    expect(await indexer.Position.get(`${A}-1`)).toMatchObject({
      yes: 1_500_000n,
      no: 2n * U,
      cashOut: 3n * U,
      cashIn: U,
    });
    expect(await indexer.Position.get(`${B}-1`)).toMatchObject({
      yes: 500_000n,
      no: 0n,
      cashOut: 0n,
    });
    expect(await indexer.Player.get(A)).toMatchObject({
      settledValue: 1_500_000n,
      profit: -500_000n,
    });
    expect(await indexer.Player.get(B)).toMatchObject({
      settledValue: 500_000n,
      profit: 500_000n,
      episodesPlayed: 1,
    });
  });

  it("matches hand-calculated two-player profit across a 0.98 cash-out, NO winner, and Void", async () => {
    const indexer = await run([
      ...episode(1n, [1n, 2n, 3n]),
      transfer(yes(1n), ZERO, A, 10n * U),
      trade(1n, A, 0n, 10n * U, 5n * U),
      transfer(yes(1n), A, ZERO, 4n * U),
      trade(1n, A, 1n, 4n * U, 3_920_000n),
      transfer(no(2n), ZERO, B, 8n * U),
      trade(2n, B, 2n, 8n * U, 3_200_000n),
      transfer(yes(3n), ZERO, A, 2n * U),
      transfer(no(3n), ZERO, A, 2n * U),
      market({
        contract: "SaysoMarkets",
        event: "SetMinted",
        params: { wordId: 3n, payer: A, account: A, amount: 2n * U },
      }),
      transfer(no(3n), ZERO, B, 3n * U),
      trade(3n, B, 2n, 3n * U, 1_200_000n),
      market({ contract: "SaysoMarkets", event: "EpisodeClosed", params: { episodeId: 1n } }),
      resolve(1n, 2n),
      resolve(2n, 3n),
      market({ contract: "SaysoMarkets", event: "WordVoided", params: { wordId: 3n } }),
      market({ contract: "SaysoMarkets", event: "EpisodeSettled", params: { episodeId: 1n } }),
    ]);
    // A: cash in 3.92 - cash out (5 + 2) + held (6 YES + 2 Void) = 4.92.
    // B: cash in 0 - cash out (3.2 + 1.2) + held (8 NO + 1.5 Void) = 5.10.
    expect(await indexer.Player.get(A)).toMatchObject({
      cashIn: 3_920_000n,
      cashOut: 7n * U,
      settledValue: 8n * U,
      profit: 4_920_000n,
    });
    expect(await indexer.Player.get(B)).toMatchObject({
      cashIn: 0n,
      cashOut: 4_400_000n,
      settledValue: 9_500_000n,
      profit: 5_100_000n,
    });
    expect(await indexer.EpisodePlayer.get(`1-${B}`)).toEqual({
      id: `1-${B}`,
      profit: 5_100_000n,
      trades: 2,
      rank: 1,
    });
    expect(await indexer.EpisodePlayer.get(`1-${A}`)).toEqual({
      id: `1-${A}`,
      profit: 4_920_000n,
      trades: 2,
      rank: 2,
    });
    expect(await indexer.Episode.get("1")).toMatchObject({
      state: "Settled",
      wordCount: 3,
      resolvedCount: 3,
      settledAt: 1000n,
    });
    expect(await indexer.Word.get("1")).toMatchObject({
      state: "Yes",
      outcome: 2,
      evidenceHash: ROOT,
      resolveTx: TX,
      resolvedAt: 1000n,
    });
    expect(await indexer.Word.get("2")).toMatchObject({ state: "No", outcome: 3 });
    expect(await indexer.Word.get("3")).toMatchObject({
      state: "Void",
      outcome: 4,
      resolveTx: TX,
      resolvedAt: 1000n,
    });
    // Redeeming winners moves value to cash without counting the payout twice.
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            transfer(yes(1n), A, ZERO, 6n * U),
            market({
              contract: "SaysoMarkets",
              event: "Redeemed",
              params: { wordId: 1n, account: A, tokenAmount: 6n * U, ausdOut: 6n * U },
            }),
            transfer(no(2n), B, ZERO, 8n * U),
            market({
              contract: "SaysoMarkets",
              event: "Redeemed",
              params: { wordId: 2n, account: B, tokenAmount: 8n * U, ausdOut: 8n * U },
            }),
          ],
        },
      },
    });
    expect(await indexer.Player.get(A)).toMatchObject({
      cashIn: 9_920_000n,
      settledValue: 2n * U,
      profit: 4_920_000n,
    });
    expect(await indexer.Player.get(B)).toMatchObject({
      cashIn: 8n * U,
      settledValue: 1_500_000n,
      profit: 5_100_000n,
    });
    expect(await indexer.Position.get(`${A}-1`)).toMatchObject({ yes: 0n, redeemed: 6n * U });
  });

  it("excludes an unresolved episode's costs and values from all-time profit", async () => {
    const indexer = await run([
      ...episode(),
      transfer(yes(1n), ZERO, A, U),
      trade(1n, A, 0n, U, 600_000n),
      resolve(1n, 2n),
      market({ contract: "SaysoMarkets", event: "EpisodeSettled", params: { episodeId: 1n } }),
      ...episode(2n, [2n]),
      transfer(no(2n), ZERO, A, 100n * U),
      trade(2n, A, 2n, 100n * U, 90n * U),
    ]);
    expect(await indexer.Player.get(A)).toMatchObject({
      cashOut: 90_600_000n,
      settledValue: U,
      profit: 400_000n,
      episodesPlayed: 2,
    });
    expect(await indexer.EpisodePlayer.get(`2-${A}`)).toMatchObject({ profit: 0n, rank: 0 });
  });

  it("uses per-side integer Void payouts and exact redemption cash, even after settlement", async () => {
    const indexer = await run([
      ...episode(),
      transfer(yes(1n), ZERO, A, 3n),
      transfer(no(1n), ZERO, A, 3n),
      market({
        contract: "SaysoMarkets",
        event: "SetMinted",
        params: { wordId: 1n, payer: A, account: A, amount: 3n },
      }),
      market({ contract: "SaysoMarkets", event: "WordVoided", params: { wordId: 1n } }),
      market({ contract: "SaysoMarkets", event: "EpisodeSettled", params: { episodeId: 1n } }),
    ]);
    expect(await indexer.Player.get(A)).toMatchObject({ settledValue: 2n, profit: -1n });
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            transfer(yes(1n), A, ZERO, 1n),
            market({
              contract: "SaysoMarkets",
              event: "Redeemed",
              params: { wordId: 1n, account: A, tokenAmount: 1n, ausdOut: 0n },
            }),
            transfer(yes(1n), A, B, 2n),
          ],
        },
      },
    });
    expect(await indexer.Position.get(`${A}-1`)).toMatchObject({
      yes: 0n,
      no: 3n,
      redeemed: 1n,
      cashIn: 0n,
    });
    expect(await indexer.Player.get(A)).toMatchObject({ settledValue: 1n, profit: -2n });
    expect(await indexer.Player.get(B)).toMatchObject({ settledValue: 1n, profit: 1n });
    expect(await indexer.EpisodePlayer.get(`1-${B}`)).toMatchObject({ profit: 1n, rank: 1 });
    expect(await indexer.EpisodePlayer.get(`1-${A}`)).toMatchObject({ profit: -2n, rank: 2 });
  });

  it("governance updates cannot change committed episodes, positions, or CRE outcomes", async () => {
    const indexer = await run([
      ...episode(),
      transfer(yes(1n), ZERO, A, U),
      trade(1n, A, 0n, U, 500_000n),
      resolve(1n, 2n),
      market({
        contract: "SaysoMarkets",
        event: "OperatorUpdated",
        params: { previousOperator: A, newOperator: B },
      }),
      market({
        contract: "SaysoMarkets",
        event: "EpisodesPausedUpdated",
        params: { paused: true },
      }),
      market({
        contract: "SaysoMarkets",
        event: "ReportOriginUpdated",
        params: { previousOrigin: A, newOrigin: B },
      }),
    ]);
    expect(await indexer.Word.get("1")).toMatchObject({
      state: "Yes",
      outcome: 2,
      evidenceHash: ROOT,
    });
    expect(await indexer.Episode.get("1")).toMatchObject({
      rootA: ROOT,
      rootB: ROOT,
      resolvedCount: 1,
    });
    expect(await indexer.Player.get(A)).toMatchObject({ profit: 500_000n, settledValue: U });
    expect(await indexer.Player.get(B)).toBeUndefined();
  });

  it("ranks only finalized word P&L during partial episode settlement", async () => {
    const indexer = await run([
      ...episode(1n, [1n, 2n]),
      transfer(yes(1n), ZERO, A, U),
      trade(1n, A, 0n, U, 600_000n),
      transfer(no(2n), ZERO, A, 10n * U),
      trade(2n, A, 2n, 10n * U, 9n * U),
      resolve(1n, 2n),
    ]);
    expect(await indexer.Player.get(A)).toMatchObject({ cashOut: 9_600_000n, profit: 400_000n });
    expect(await indexer.EpisodePlayer.get(`1-${A}`)).toMatchObject({ profit: 400_000n, rank: 0 });
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            resolve(2n, 2n),
            market({
              contract: "SaysoMarkets",
              event: "EpisodeSettled",
              params: { episodeId: 1n },
            }),
          ],
        },
      },
    });
    expect(await indexer.Player.get(A)).toMatchObject({ profit: -8_600_000n, settledValue: U });
    expect(await indexer.EpisodePlayer.get(`1-${A}`)).toMatchObject({
      profit: -8_600_000n,
      rank: 1,
    });
  });

  it("tracks real custody transfers without putting protocol inventory on the player leaderboard", async () => {
    const indexer = await run([
      ...episode(),
      transfer(yes(1n), ZERO, MARKETS, 2n * U),
      transfer(yes(1n), MARKETS, BOOK, 2n * U),
      transfer(yes(1n), BOOK, MARKETS, U),
      transfer(yes(1n), MARKETS, A, U),
      trade(1n, A, 0n, U, 500_000n),
      transfer(yes(1n), A, MARKETS, 200_000n),
      transfer(yes(1n), MARKETS, A, 200_000n),
      resolve(1n, 2n),
    ]);
    expect(await indexer.Position.get(`${A}-1`)).toMatchObject({ yes: U });
    expect(await indexer.Player.get(A)).toMatchObject({ profit: 500_000n });
    expect(await indexer.Player.get(MARKETS)).toBeUndefined();
    expect(await indexer.Player.get(BOOK)).toBeUndefined();
    expect(await indexer.Player.get(ZERO)).toBeUndefined();
  });

  it("charges a gifted set to the contract caller and pays a gifted burn to its recipient, not tx.origin", async () => {
    const CALLER = "0x00000000000000000000000000000000000000e1";
    const ORIGIN = "0x00000000000000000000000000000000000000f1";
    // Override raw transaction metadata without selecting it for production handlers.
    const originMetadata: Record<string, string> = { from: ORIGIN };
    const indexer = await run([
      ...episode(),
      transfer(yes(1n), ZERO, A, 3n * U),
      transfer(no(1n), ZERO, A, 3n * U),
      market({
        contract: "SaysoMarkets",
        event: "SetMinted",
        params: { wordId: 1n, payer: CALLER, account: A, amount: 3n * U },
        transaction: { hash: TX, ...originMetadata },
      }),
      transfer(yes(1n), A, CALLER, U),
      transfer(no(1n), A, CALLER, U),
      transfer(yes(1n), CALLER, ZERO, U),
      transfer(no(1n), CALLER, ZERO, U),
      market({
        contract: "SaysoMarkets",
        event: "SetBurned",
        params: { wordId: 1n, account: CALLER, recipient: B, amount: U },
        transaction: { hash: TX, ...originMetadata },
      }),
      resolve(1n, 2n),
      market({ contract: "SaysoMarkets", event: "EpisodeSettled", params: { episodeId: 1n } }),
    ]);
    expect(await indexer.Position.get(`${CALLER}-1`)).toMatchObject({
      yes: 0n,
      no: 0n,
      cashOut: 3n * U,
      cashIn: 0n,
    });
    expect(await indexer.Position.get(`${A}-1`)).toMatchObject({
      yes: 2n * U,
      no: 2n * U,
      cashOut: 0n,
      cashIn: 0n,
    });
    expect(await indexer.Position.get(`${B}-1`)).toMatchObject({
      yes: 0n,
      no: 0n,
      cashOut: 0n,
      cashIn: U,
    });
    expect(await indexer.Player.get(CALLER)).toMatchObject({ profit: -3n * U });
    expect(await indexer.Player.get(A)).toMatchObject({ profit: 2n * U });
    expect(await indexer.Player.get(B)).toMatchObject({ profit: U });
    expect(await indexer.Player.get(ORIGIN)).toBeUndefined();
    expect(await indexer.EpisodePlayer.get(`1-${A}`)).toMatchObject({ rank: 1 });
    expect(await indexer.EpisodePlayer.get(`1-${B}`)).toMatchObject({ rank: 2 });
    expect(await indexer.EpisodePlayer.get(`1-${CALLER}`)).toMatchObject({ rank: 3 });
  });
});
