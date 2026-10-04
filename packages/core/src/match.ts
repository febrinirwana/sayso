export type Token = readonly [word: string, startMs: number, endMs: number];

export const AGREEMENT_WINDOW_MS = 1500;

export function normalizeToken(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function isValidTarget(target: string): boolean {
  // Valid targets are ASCII, so string length equals UTF-8 byte length.
  return target.length <= 32 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target) && !/^\d+$/.test(target);
}

function requireTarget(target: string): void {
  if (!isValidTarget(target)) {
    throw new Error("Invalid word target");
  }
}

function matchesNormalized(target: string, token: string): boolean {
  const matchesForm = (word: string): boolean =>
    word === target ||
    word === `${target}s` ||
    word === `${target}es` ||
    word === `${target}'s` ||
    word === `${target}s'`;

  return matchesForm(token) || (token.includes("-") && token.split("-").some(matchesForm));
}

export function matchesTarget(target: string, rawToken: string): boolean {
  requireTarget(target);
  return matchesNormalized(target, normalizeToken(rawToken));
}

export function agreedSpokenTime(
  target: string,
  tokensA: readonly Token[],
  tokensB: readonly Token[],
): { atMs: number; aStartMs: number; bStartMs: number } | null {
  requireTarget(target);
  const matchingStarts = (tokens: readonly Token[]): number[] =>
    tokens
      .filter(([word]) => matchesNormalized(target, normalizeToken(word)))
      .map(([, startMs]) => startMs)
      .sort((a, b) => a - b);

  const a = matchingStarts(tokensA);
  const b = matchingStarts(tokensB);
  let i = 0;
  let j = 0;
  let aStartMs = a[i];
  let bStartMs = b[j];
  while (aStartMs !== undefined && bStartMs !== undefined) {
    if (Math.abs(aStartMs - bStartMs) <= AGREEMENT_WINDOW_MS) {
      return { atMs: Math.min(aStartMs, bStartMs), aStartMs, bStartMs };
    }
    if (aStartMs < bStartMs) {
      aStartMs = a[++i];
    } else {
      bStartMs = b[++j];
    }
  }
  return null;
}
