import { describe, expect, it } from "vitest";
import { mapEpisode, mapEpisodePlayer, mapPosition, mapWord } from "./indexer";
import { mapDripResponse, mapEpisodeResponse, parseEpisodeEvent, selectOffset } from "./studio";

const episode = {
  id: "12",
  clipId: "clip",
  rootA: "a",
  rootB: "b",
  startsAt: "1790000000",
  endsAt: "1790000300",
  state: "Settled",
  wordCount: 6,
  resolvedCount: 6,
  closedAt: "1790000301",
  settledAt: null,
};
const word = {
  id: "72",
  episode_id: "12",
  text: "monad",
  yes: "yes",
  no: "no",
  market: null,
  state: "Open",
  offsetMs: null,
  flaggedAt: null,
  outcome: null,
  evidenceHash: null,
  resolvedAt: null,
  resolveTx: null,
};

describe("studio clock selection", () => {
  it("uses the shortest round trip and its midpoint rather than the last ping", () => {
    expect(
      selectOffset([
        { sentMs: 1000, receivedMs: 1100, serverMs: 2100 },
        { sentMs: 2000, receivedMs: 2020, serverMs: 3050 },
        { sentMs: 3000, receivedMs: 3200, serverMs: 4000 },
      ]),
    ).toEqual({ offsetMs: 1040, rttMs: 20 });
  });
  it("refuses missing and invalid samples rather than inventing clock accuracy", () => {
    expect(() => selectOffset([])).toThrow();
    expect(() => selectOffset([{ sentMs: 2, receivedMs: 1, serverMs: 1 }])).toThrow();
  });
});
describe("public studio event boundary", () => {
  it("accepts schedule words without ids before listing and all lifecycle states", () => {
    expect(
      parseEpisodeEvent(
        "schedule",
        JSON.stringify({
          episodeId: 12,
          startsAtMs: 1000,
          endsAtMs: 2000,
          state: "Closed",
          words: [{ text: "monad" }],
        }),
      ),
    ).toMatchObject({ state: "Closed", words: [{ text: "monad" }] });
    expect(parseEpisodeEvent("state", '{"episodeId":12,"state":"Settled"}')).toEqual({
      episodeId: 12,
      state: "Settled",
    });
  });
  it("accepts announced flags without receipts and preserves confirmed hashes", () => {
    expect(
      parseEpisodeEvent("flag", '{"wordId":72,"t":150,"scheduledMs":1150,"txHash":null}'),
    ).toEqual({ wordId: 72, t: 150, scheduledMs: 1150, txHash: null });
    const hash = `0x${"a".repeat(64)}`;
    expect(
      parseEpisodeEvent(
        "flag",
        JSON.stringify({ wordId: 72, t: 150, scheduledMs: 1150, txHash: hash }),
      ),
    ).toMatchObject({ txHash: hash });
  });
  it("rejects malformed or incomplete events without firing a valid handler", () => {
    for (const data of [
      "{",
      "null",
      '{"episodeId":12,"state":"Fake"}',
      '{"episodeId":-1,"state":"Live"}',
    ])
      expect(() => parseEpisodeEvent("state", data)).toThrow();
    expect(() =>
      parseEpisodeEvent("flag", '{"wordId":72,"t":-1,"scheduledMs":1150,"txHash":null}'),
    ).toThrow();
    expect(() =>
      parseEpisodeEvent(
        "schedule",
        '{"episodeId":12,"startsAtMs":2000,"endsAtMs":1000,"state":"Live","words":[]}',
      ),
    ).toThrow();
  });
});
describe("studio HTTP admission", () => {
  it.each([
    [404, "unclaimed"],
    [409, "already-claimed"],
    [429, "rate-limited"],
    [503, "unavailable"],
  ])("maps drip HTTP %s to %s", (status, expected) => {
    expect(mapDripResponse(Number(status), null)).toEqual({ status: expected });
  });
  it("distinguishes partial pending claims and validates testnet completion", () => {
    const drip = {
      address: `0x${"1".repeat(40)}`,
      network: "TESTNET",
      chainId: 10143,
      amounts: { monWei: "500000000000000000", ausd: "10000000" },
      status: "pending",
      mon: { status: "confirmed", hash: null, block: 1 },
      ausd: { status: "signed", hash: null, block: null },
    };
    expect(mapDripResponse(201, drip)).toMatchObject({
      status: "pending",
      drip: { amounts: drip.amounts },
    });
    expect(
      mapDripResponse(200, {
        ...drip,
        status: "completed",
        ausd: { ...drip.ausd, status: "confirmed" },
      }),
    ).toMatchObject({ status: "completed" });
    expect(() => mapDripResponse(200, { ...drip, chainId: 1 })).toThrow();
    expect(mapDripResponse(503, { error: "pending" })).toEqual({
      status: "unavailable",
      reason: "pending",
    });
  });
  it.each([
    [409, "busy"],
    [429, "rate-limited"],
    [503, "unavailable"],
  ])("maps episode HTTP %s to %s", (status, expected) => {
    expect(mapEpisodeResponse(Number(status), null)).toEqual({ status: expected });
  });
  it("requires a real positive episode id on admission", () => {
    expect(mapEpisodeResponse(201, { episodeId: 12 })).toEqual({
      status: "created",
      episodeId: 12,
    });
    expect(() => mapEpisodeResponse(201, { episodeId: 0 })).toThrow();
  });
});
describe("Envio row mapping", () => {
  it("converts seconds and large integers losslessly while retaining nullable fields", () => {
    expect(mapEpisode(episode)).toMatchObject({ startsAt: 1790000000n, settledAt: null });
    expect(mapWord(word)).toMatchObject({ id: 72n, market: null, outcome: null });
    expect(
      mapPosition({
        id: "player-72",
        player_id: "player",
        word: { ...word, episode },
        yes: "9007199254740993123",
        no: "0",
        cashIn: "123",
        cashOut: "500",
        redeemed: "0",
      }),
    ).toMatchObject({ yes: 9007199254740993123n, cashOut: 500n, word: { episode: { id: 12 } } });
  });
  it("decodes episode leaderboard membership from the actual compound id", () => {
    expect(
      mapEpisodePlayer({ id: `12-0x${"a".repeat(40)}`, profit: "-1250000", trades: 3, rank: 2 }),
    ).toMatchObject({ episodeId: 12, address: `0x${"a".repeat(40)}`, profit: -1250000n, rank: 2 });
  });
});
