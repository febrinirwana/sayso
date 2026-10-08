import { describe, expect, it } from "vitest";
import {
  CASH_OUT_CENTS,
  DEMO_WORDS,
  demoPrice,
  formatCentsChange,
  formatCoins,
  freshBoard,
  heardWord,
  pick,
  START_CENTS,
  scriptCues,
  settle,
} from "./demo";

const index = (word: string) => DEMO_WORDS.findIndex((w) => w.word === word);
const price = (word: string) => DEMO_WORDS[index(word)]?.priceCents ?? Number.NaN;

describe("landing demo round", () => {
  it("charges a pick at its price and refunds it on a second tap", () => {
    const picked = pick(freshBoard(), index("MOON"));
    expect(picked.cards[index("MOON")]?.picked).toBe(true);
    expect(picked.balanceCents).toBe(START_CENTS - price("MOON"));
    const unpicked = pick(picked, index("MOON"));
    expect(unpicked.cards[index("MOON")]?.picked).toBe(false);
    expect(unpicked.balanceCents).toBe(START_CENTS);
  });

  it("refuses a pick the balance cannot cover", () => {
    let board = freshBoard();
    for (const word of ["MONEY", "ROCKET", "MOON", "PIZZA"]) board = pick(board, index(word));
    expect(board.balanceCents).toBe(START_CENTS - price("MONEY") - price("ROCKET") - price("MOON"));
    expect(board.cards[index("PIZZA")]?.picked).toBe(false);
  });

  it("flips only the word the caption just spoke, ignoring case and punctuation", () => {
    const board = heardWord(freshBoard(), "pizza,");
    expect(board.cards[index("PIZZA")]?.state).toBe("said");
    expect(board.cards.filter((c) => c.state === "said")).toHaveLength(1);
    expect(heardWord(board, "this")).toBe(board);
  });

  it("cashes a picked word out at 98¢ the moment it is said, and pays nothing for unpicked ones", () => {
    const picked = pick(freshBoard(), index("MOON"));
    const said = heardWord(picked, "moon.");
    expect(said.balanceCents).toBe(picked.balanceCents + CASH_OUT_CENTS);
    expect(heardWord(freshBoard(), "moon.").balanceCents).toBe(START_CENTS);
    // A second mention does not pay twice.
    expect(heardWord(said, "MOON").balanceCents).toBe(said.balanceCents);
  });

  it("settles SAID words to YES, the rest to NO, and ignores taps afterwards", () => {
    const settled = settle(heardWord(pick(freshBoard(), index("ROCKET")), "moon"));
    expect(settled.cards[index("MOON")]?.state).toBe("yes");
    expect(settled.cards.filter((c) => c.state === "no")).toHaveLength(DEMO_WORDS.length - 1);
    expect(pick(settled, index("PIZZA"))).toBe(settled);
  });

  it("prices a SAID word at the cash-out bid and settled words at 100¢ or 0¢", () => {
    const moon = DEMO_WORDS[index("MOON")];
    if (!moon) throw new Error("MOON missing from demo words");
    expect(demoPrice(moon, "open")).toBe(moon.priceCents);
    expect(demoPrice(moon, "said")).toBe(CASH_OUT_CENTS);
    expect(demoPrice(moon, "yes")).toBe(100);
    expect(demoPrice(moon, "no")).toBe(0);
  });

  it("speaks exactly three board words, in order, within about five seconds", () => {
    const cues = scriptCues();
    const board = cues.reduce((b, cue) => heardWord(b, cue.token), freshBoard());
    const said = DEMO_WORDS.filter((_, i) => board.cards[i]?.state === "said").map((w) => w.word);
    expect(said.sort()).toEqual(["LEGENDARY", "MOON", "PIZZA"]);
    expect(cues.at(-1)?.at).toBeLessThanOrEqual(5_000);
    expect(cues.every((cue, i) => i === 0 || cue.at > (cues[i - 1]?.at ?? 0))).toBe(true);
  });

  it("formats balances and changes the way the board shows them", () => {
    expect(formatCoins(START_CENTS)).toBe("2.00");
    expect(formatCoins(256)).toBe("2.56");
    expect(formatCentsChange(56)).toBe("+56¢");
    expect(formatCentsChange(-12)).toBe("−12¢");
    expect(formatCentsChange(0)).toBe("0¢");
  });
});
