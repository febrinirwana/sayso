import { stringToHex, zeroAddress } from "viem";
import { expect, it } from "vitest";
import { readEpisodes } from "./chain";

const rawEpisode = (wordCount: number, resolvedCount: number, closed: boolean) => ({
  clipId: `0x${"11".repeat(32)}`,
  rootA: `0x${"22".repeat(32)}`,
  rootB: `0x${"33".repeat(32)}`,
  startsAt: 100n,
  endsAt: 200n,
  closedAt: closed ? 210n : 0n,
  wordCount,
  resolvedCount,
  listed: true,
  closed,
});
const rawWord = (episodeId: number, state: number, text: string) => ({
  episodeId,
  state,
  text: stringToHex(text, { size: 32 }),
  yes: zeroAddress,
  no: zeroAddress,
  market: zeroAddress,
  sets: 0n,
  chunkA: 0,
  chunkB: 0,
  offsetMs: 0,
});

it("reads any number of episodes in three requests and keeps each word with its episode", async () => {
  // Live run 2026-10-10: Portfolio read 19 episodes at ~9 calls each and the public RPC's 15/s
  // limit answered 429, leaving "could not provide a complete snapshot" on screen.
  const calls: string[] = [];
  const client = {
    getBlock: async () => {
      calls.push("getBlock");
      return { number: 50n, timestamp: 300n };
    },
    multicall: async ({
      contracts,
    }: {
      contracts: { functionName: string; args: [unknown] }[];
    }) => {
      calls.push(`multicall:${contracts.length}`);
      return contracts.map(({ functionName, args: [arg] }) => {
        if (functionName === "episode")
          return arg === 1 ? rawEpisode(2, 2, true) : rawEpisode(1, 0, false);
        if (functionName === "episodeWords") return arg === 1 ? [11n, 12n] : [21n];
        const id = arg as bigint;
        return id === 11n
          ? rawWord(1, 2, "block")
          : id === 12n
            ? rawWord(1, 3, "ocean")
            : rawWord(2, 1, "monad");
      });
    },
  } as never;
  const episodes = await readEpisodes([1, 2], client);
  expect(calls).toEqual(["getBlock", "multicall:4", "multicall:3"]);
  expect(episodes.map((e) => [e.id, e.state, e.words.map((w) => [w.id, w.text, w.state])])).toEqual(
    [
      [
        1,
        "Settled",
        [
          [11n, "block", "Yes"],
          [12n, "ocean", "No"],
        ],
      ],
      [2, "Live", [[21n, "monad", "SaidPending"]]],
    ],
  );
});
