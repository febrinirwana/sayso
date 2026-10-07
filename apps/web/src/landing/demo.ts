import type { WordState } from "@/episode/WordCard";

/** Client-side landing demo only: no market, no chain, no real transcript. */
export type DemoWord = { word: string; priceCents: number };
export type DemoStates = readonly WordState[];

export const DEMO_WORDS: readonly DemoWord[] = [
  { word: "MOON", priceCents: 58 },
  { word: "ROCKET", priceCents: 66 },
  { word: "PIZZA", priceCents: 41 },
  { word: "MONEY", priceCents: 73 },
  { word: "CHAMPION", priceCents: 27 },
  { word: "EXTRAORDINARY", priceCents: 12 },
];

export const DEMO_SCRIPT = "Honestly? This pizza is extraordinary. Next stop: the moon.";

/** First caption word lands after this many ms, then one word every `CUE_STEP_MS`. */
const CUE_START_MS = 350;
const CUE_STEP_MS = 400;
/** Pause after the last spoken word before the board settles. */
export const SETTLE_DELAY_MS = 700;

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

export function freshStates(): DemoStates {
  return DEMO_WORDS.map(() => "open");
}

/** A tap flips an open card to SAID and a SAID card back; settled cards stay put. */
export function toggle(states: DemoStates, at: number): DemoStates {
  return states.map((state, i) => {
    if (i !== at) return state;
    if (state === "open") return "said";
    if (state === "said") return "open";
    return state;
  });
}

/** The caption just spoke `token`: the matching open card flips SAID. */
export function heardWord(states: DemoStates, token: string): DemoStates {
  const spoken = normaliseToken(token);
  return states.map((state, i) =>
    state === "open" && DEMO_WORDS[i]?.word === spoken ? "said" : state,
  );
}

/** End of clip: SAID settles YES, everything still open settles NO. */
export function settle(states: DemoStates): DemoStates {
  return states.map((state) => (state === "said" || state === "yes" ? "yes" : "no"));
}

/** A SAID word trades at the house's 98¢ cash-out bid until settlement pays 100¢ or 0¢. */
export function demoPrice(word: DemoWord, state: WordState): number {
  if (state === "said") return 98;
  if (state === "yes") return 100;
  if (state === "no") return 0;
  return word.priceCents;
}
