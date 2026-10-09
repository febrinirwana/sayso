import { expect, it } from "vitest";
import type { ChainEpisode, ChainWord, WordState } from "@/data/chain";
import { type Holding, readRedeemable } from "./hooks";

const player = "0x00000000000000000000000000000000000000aa";
const word = (id: bigint, state: WordState) => ({ id, episodeId: 15, state }) as ChainWord;
const episode = (states: WordState[]) =>
  ({ id: 15, words: states.map((state, i) => word(BigInt(i + 1), state)) }) as ChainEpisode;

it("redeems against the settled chain state, not the state captured with the holdings", async () => {
  // Live episode 15: Results enabled Redeem from the fresh episode, but the holdings rows still
  // carried SaidPending, so redeem found nothing to send and silently reported success.
  const stale = episode(["SaidPending", "No"]);
  const holdings: Holding[] = stale.words.map((w) => ({
    word: w,
    episode: stale,
    yes: 2n,
    no: 0n,
  }));
  const settled = episode(["Yes", "No"]);
  const redeemable = await readRedeemable(holdings, player, {
    episode: async () => settled,
    holdings: async (episodes) =>
      episodes.flatMap((e) => e.words.map((w) => ({ word: w, episode: e, yes: 2n, no: 0n }))),
  });
  expect(redeemable.map((h) => [h.word.id, h.word.state])).toEqual([[1n, "Yes"]]);
});
