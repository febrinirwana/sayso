import { canonicalTokensJson, normalizeToken, type Token } from "@sayso/core";

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Expected a JSON object");
  }
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError("Expected a JSON array");
  return value;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("Expected word text");
  return value;
}

function lexical(raw: string): string {
  const word = normalizeToken(raw);
  if (/\s/u.test(word)) throw new Error("Multiword segment: use whisper -ml 1 -sow");
  return word;
}

function finish(tokens: Token[]): Token[] {
  canonicalTokensJson(tokens); // Core owns the safe-integer, ordered timestamp contract.
  return tokens.sort((a, b) => a[1] - b[1]);
}

export function parseWhisper(value: unknown): Token[] {
  const tokens: Token[] = [];
  let depth = 0;
  for (const item of array(object(value).transcription)) {
    const segment = object(item);
    const raw = text(segment.text);
    const annotation = depth > 0 || raw.includes("[");
    for (const character of raw) {
      if (character === "[") depth++;
      if (character === "]" && --depth < 0) throw new Error("Unbalanced sound annotation");
    }
    if (annotation) continue;
    const word = lexical(raw);
    if (!word) continue;
    const offsets = object(segment.offsets);
    if (typeof offsets.from !== "number" || typeof offsets.to !== "number") {
      throw new TypeError("Whisper segment offsets must be milliseconds");
    }
    tokens.push([word, offsets.from, offsets.to]);
  }
  if (depth !== 0) throw new Error("Unclosed sound annotation");
  return finish(tokens);
}

// S7 used Python round(seconds * 1000), including ties-to-even.
function milliseconds(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError("Vosk word times must be finite nonnegative seconds");
  }
  const ms = value * 1000;
  const floor = Math.floor(ms);
  return ms - floor === 0.5 ? floor + (floor % 2) : Math.round(ms);
}

export function parseVosk(value: unknown): Token[] {
  const tokens: Token[] = [];
  for (const item of array(value)) {
    const entry = object(item);
    const raw = text(entry.word);
    if (/^\s*\[.*\]\s*$/u.test(raw)) continue;
    const word = lexical(raw);
    if (!word) continue;
    if (
      typeof entry.start === "number" &&
      typeof entry.end === "number" &&
      entry.start > entry.end
    ) {
      throw new RangeError("Vosk word interval is reversed");
    }
    tokens.push([word, milliseconds(entry.start), milliseconds(entry.end)]);
  }
  return finish(tokens);
}
