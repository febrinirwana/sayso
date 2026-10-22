import { TRADING_CLOSE_LEAD_MS } from "@sayso/core";
import { describe, expect, it } from "vitest";
import { betsView, picksLabel } from "./bets";

describe("bets window copy", () => {
  it("counts down while bets are open and turns urgent in the last ten seconds", () => {
    const open = betsView({ status: "open", closesInMs: 42_000 }, false);
    expect(open).toMatchObject({ tone: "open", caption: "Bets close in 0:42 · tap a word" });
    expect(open.lockedReason).toBeUndefined();
    expect(betsView({ status: "open", closesInMs: 9_200 }, false)).toMatchObject({
      tone: "closing",
      caption: "Bets close in 0:10 · tap a word",
      closesInSeconds: 9.2,
    });
  });
  it("tells a locked player to watch, with the lead the house uses", () => {
    const locked = betsView({ status: "closed" }, false);
    expect(locked.caption).toBe("Bets locked · watch");
    expect(locked.closesInSeconds).toBeUndefined();
    expect(locked.lockedReason).toContain(`${TRADING_CLOSE_LEAD_MS / 1_000} s before kickoff`);
  });
  it("moves on to results once the clip is over", () => {
    expect(betsView({ status: "closed" }, true).caption).toBe("Clip over · results next");
  });
  it("waits for the studio clock rather than guessing the window", () => {
    const unsynced = betsView({ status: "unsynced" }, false);
    expect(unsynced.tone).toBe("locked");
    expect(unsynced.lockedReason).toBeDefined();
  });
});

describe("picks counter", () => {
  const open = betsView({ status: "open", closesInMs: 30_000 }, false);
  it("shows the count while bets are open", () => {
    expect(picksLabel(open, 2, true)).toBe("2/3 words picked");
    expect(picksLabel(open, 3, true)).toBe("3/3 words picked");
  });
  it("hides once bets close or the clock is unsynced", () => {
    expect(picksLabel(betsView({ status: "closed" }, false), 3, true)).toBeUndefined();
    expect(picksLabel(betsView({ status: "unsynced" }, false), 1, true)).toBeUndefined();
  });
  it("waits for the count to be known", () => {
    expect(picksLabel(open, 0, false)).toBeUndefined();
  });
});
