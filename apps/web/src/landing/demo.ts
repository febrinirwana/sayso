/** Client-side landing demo only: no market, no chain, no real transcript. */

export type DemoState = "open" | "said" | "yes" | "no";
export type DemoWord = { word: string; priceCents: number };
export type DemoCard = { state: DemoState; picked: boolean };
export type DemoBoard = { cards: readonly DemoCard[]; balanceCents: number };

export const DEMO_WORDS: readonly DemoWord[] = [
  { word: "MOON", priceCents: 58 },
  { word: "ROCKET", priceCents: 66 },
  { word: "PIZZA", priceCents: 41 },
  { word: "MONEY", priceCents: 73 },
  { word: "CHAMPION", priceCents: 27 },
  { word: "LEGENDARY", priceCents: 12 },
];

export const DEMO_SCRIPT = "Honestly? This pizza is legendary. Next stop: the moon.";

/** Demo coins a visitor starts with: enough for about three picks. */
export const START_CENTS = 200;
/** A SAID word is cashed out at the house's 98¢ bid the moment it flips. */
export const CASH_OUT_CENTS = 98;

/** First caption word lands after this many ms, then one word every `CUE_STEP_MS`. */
const CUE_START_MS = 450;
const CUE_STEP_MS = 420;
/** Pause after the last spoken word before the board settles. */
export const SETTLE_DELAY_MS = 900;

export type ScriptCue = { token: string; at: number };

export function scriptCues(script: string = DEMO_SCRIPT): ScriptCue[] {
  return script
    .split(/\s+/)
    .filter(Boolean)
    .map((token, i) => ({ token, at: CUE_START_MS + i * CUE_STEP_MS }));
}

/** Upper-case letters only, so "pizza," and "PIZZA" match the same card. */
export function normaliseToken(token: string): string {
  return token.toUpperCase().replace(/[^A-Z]/g, "");
}

export function freshBoard(): DemoBoard {
  return {
    cards: DEMO_WORDS.map(() => ({ state: "open", picked: false })),
    balanceCents: START_CENTS,
  };
}

/**
 * A tap on an open card buys YES at its price, a second tap sells it back at the same price.
 * Flipped or settled cards and unaffordable picks leave the board unchanged.
 */
export function pick(board: DemoBoard, at: number): DemoBoard {
  const card = board.cards[at];
  const word = DEMO_WORDS[at];
  if (!card || !word || card.state !== "open") return board;
  const cost = card.picked ? -word.priceCents : word.priceCents;
  if (cost > board.balanceCents) return board;
  return {
    cards: board.cards.map((c, i) => (i === at ? { ...c, picked: !c.picked } : c)),
    balanceCents: board.balanceCents - cost,
  };
}

/** The caption just spoke `token`: the matching open card flips SAID; a pick cashes out at 98¢. */
export function heardWord(board: DemoBoard, token: string): DemoBoard {
  const spoken = normaliseToken(token);
  let paid = 0;
  const cards = board.cards.map((card, i) => {
    if (card.state !== "open" || DEMO_WORDS[i]?.word !== spoken) return card;
    if (card.picked) paid += CASH_OUT_CENTS;
    return { ...card, state: "said" as const };
  });
  return paid === 0 && cards.every((c, i) => c === board.cards[i])
    ? board
    : { cards, balanceCents: board.balanceCents + paid };
}

/** End of clip: SAID settles YES, everything still open settles NO (picks there pay 0¢). */
export function settle(board: DemoBoard): DemoBoard {
  return {
    ...board,
    cards: board.cards.map((card) => ({
      ...card,
      state: card.state === "said" || card.state === "yes" ? "yes" : "no",
    })),
  };
}

/** A SAID word trades at the 98¢ cash-out bid until settlement pays 100¢ or 0¢. */
export function demoPrice(word: DemoWord, state: DemoState): number {
  if (state === "said") return CASH_OUT_CENTS;
  if (state === "yes") return 100;
  if (state === "no") return 0;
  return word.priceCents;
}

/** Signed cents: "+56¢", "−12¢", "0¢". */
export function formatCentsChange(cents: number): string {
  if (cents === 0) return "0¢";
  return `${cents > 0 ? "+" : "−"}${Math.abs(cents)}¢`;
}

/** Balance as coins with two decimals: 300 → "3.00". */
export function formatCoins(cents: number): string {
  return (cents / 100).toFixed(2);
}
