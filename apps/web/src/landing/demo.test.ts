import { describe, expect, it } from "vitest";
import {
  DEMO_WORDS,
  type DemoStates,
  demoPrice,
  freshStates,
  heardWord,
  scriptCues,
  settle,
  toggle,
} from "./demo";

const index = (word: string) => DEMO_WORDS.findIndex((w) => w.word === word);

describe("landing demo board", () => {
  it("flips a tapped card to SAID and back on a second tap", () => {
    const once = toggle(freshStates(), 0);
    expect(once[0]).toBe("said");
    expect(once.slice(1).every((s) => s === "open")).toBe(true);
    expect(toggle(once, 0)[0]).toBe("open");
  });

  it("ignores taps once the board has settled", () => {
    const settled = settle(toggle(freshStates(), 2));
    expect(toggle(settled, 2)).toEqual(settled);
  });

  it("flips only the word the caption just spoke, ignoring case and punctuation", () => {
    const states = heardWord(freshStates(), "pizza,");
    expect(states[index("PIZZA")]).toBe("said");
    expect(states.filter((s) => s === "said")).toHaveLength(1);
    expect(heardWord(states, "this")).toEqual(states);
  });

  it("settles SAID words to YES and the rest to NO", () => {
    const states: DemoStates = settle(heardWord(freshStates(), "moon."));
    expect(states[index("MOON")]).toBe("yes");
    expect(states.filter((s) => s === "no")).toHaveLength(DEMO_WORDS.length - 1);
  });

  it("prices a SAID word at the 98¢ cash-out bid and settled words at 100¢ or 0¢", () => {
    const moon = DEMO_WORDS[index("MOON")];
    if (!moon) throw new Error("MOON missing from demo words");
    expect(demoPrice(moon, "open")).toBe(moon.priceCents);
    expect(demoPrice(moon, "said")).toBe(98);
    expect(demoPrice(moon, "yes")).toBe(100);
    expect(demoPrice(moon, "no")).toBe(0);
  });

  it("speaks exactly the scripted board words within about four seconds", () => {
    const cues = scriptCues();
    const spoken = cues.reduce((states, cue) => heardWord(states, cue.token), freshStates());
    const said = DEMO_WORDS.filter((_, i) => spoken[i] === "said").map((w) => w.word);
    expect(said.sort()).toEqual(["EXTRAORDINARY", "MOON", "PIZZA"]);
    expect(cues.at(-1)?.at).toBeLessThanOrEqual(4_000);
    expect(cues.every((cue, i) => i === 0 || cue.at > (cues[i - 1]?.at ?? 0))).toBe(true);
  });
});
