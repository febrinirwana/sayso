import { describe, expect, it } from "vitest";
import { stageCue } from "./cues";

const preroll = (secondsLeft: number) => ({ live: false, secondsLeft });

describe("stageCue", () => {
  it("stays silent on the first render, even mid-countdown", () => {
    expect(stageCue(null, preroll(3))).toBeNull();
    expect(stageCue(null, { live: true, secondsLeft: 120 })).toBeNull();
  });

  it("ticks once per second only in the last five seconds of pre-roll", () => {
    expect(stageCue(preroll(7), preroll(6))).toBeNull();
    expect(stageCue(preroll(6), preroll(5))).toBe("tick");
    expect(stageCue(preroll(2), preroll(1))).toBe("tick");
    expect(stageCue(preroll(1), preroll(0))).toBeNull();
  });

  it("does not tick again while the displayed second is unchanged", () => {
    expect(stageCue(preroll(4.6), preroll(4.2))).toBeNull();
    expect(stageCue(preroll(4.2), preroll(3.9))).toBe("tick");
  });

  it("plays the start sting when playback goes live", () => {
    expect(stageCue(preroll(0), { live: true, secondsLeft: 180 })).toBe("start");
  });

  it("never ticks during playback", () => {
    expect(stageCue({ live: true, secondsLeft: 5 }, { live: true, secondsLeft: 4 })).toBeNull();
  });
});
