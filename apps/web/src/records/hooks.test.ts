import { stringToHex, zeroAddress } from "viem";
import { expect, it } from "vitest";
import type { ChainEpisode, ChainWord, RawChainWord, WordState } from "@/data/chain";
import { type Holding, readRedeemable } from "./hooks";

const player = "0x00000000000000000000000000000000000000aa";
const word = (id: bigint, state: WordState) =>
  ({ id, episodeId: 15, state, yes: zeroAddress, no: zeroAddress }) as unknown as ChainWord;
const rawWord = (state: number) =>
  ({
    episodeId: 15,
    state,
    text: stringToHex("market", { size: 32 }),
    yes: zeroAddress,
    no: zeroAddress,
    market: zeroAddress,
  }) as unknown as RawChainWord;

it("redeems against the settled chain state in one read, not the state cached with the holdings", async () => {
  // Episode 15: holdings rows still carried SaidPending, so redeem sent nothing. Episode 16: separate
  // state re-reads hit the public RPC's 15 requests/s limit, so states and balances share one call.
  const stale = {
    id: 15,
    words: [word(1n, "SaidPending"), word(2n, "SaidPending")],
  } as ChainEpisode;
  const holdings: Holding[] = stale.words.map((w) => ({
    word: w,
    episode: stale,
    yes: 2n,
    no: 0n,
  }));
  let calls = 0;
  const client = {
    getBlockNumber: async () => 1n,
    multicall: async () => {
      calls++;
      return [rawWord(2), 2n, 0n, rawWord(3), 2n, 0n]; // word 1 Yes, word 2 No
    },
  } as never;
  const redeemable = await readRedeemable(holdings, player, client);
  expect(redeemable.map((h) => [h.word.id, h.word.state, h.yes])).toEqual([[1n, "Yes", 2n]]);
  expect(calls).toBe(1);
});
