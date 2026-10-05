import { describe, expect, it } from "vitest";
import { parseVosk, parseWhisper } from "./parsers.ts";

const segment = (text: string, from = 123, to = 456) => ({ text, offsets: { from, to } });

describe("whisper word segments", () => {
  it("uses segment milliseconds, normalizes lexical words and sorts", () => {
    expect(
      parseWhisper({ transcription: [segment(" Market!", 900, 950), segment(" Monad’s,")] }),
    ).toEqual([
      ["monad's", 123, 456],
      ["market", 900, 950],
    ]);
  });
  it("excludes whole and split annotations before normalization", () => {
    expect(
      parseWhisper({
        transcription: [
          segment("[Music]"),
          segment(" ["),
          segment("market"),
          segment("]"),
          segment("..."),
          segment("block"),
        ],
      }),
    ).toEqual([["block", 123, 456]]);
  });
  it("rejects multiword segments rather than inventing timestamps", () => {
    expect(() => parseWhisper({ transcription: [segment("two words")] })).toThrow();
  });
  it.each(["[Music", "Music]"])("rejects unbalanced annotation %s", (text) => {
    expect(() => parseWhisper({ transcription: [segment(text)] })).toThrow();
  });
  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe milliseconds %s",
    (from) => {
      expect(() => parseWhisper({ transcription: [segment("block", from, from)] })).toThrow();
    },
  );
  it("rejects reversed times and malformed JSON shapes", () => {
    expect(() => parseWhisper({ transcription: [segment("block", 500, 400)] })).toThrow();
    expect(() => parseWhisper({ transcription: [{ text: "block" }] })).toThrow();
  });
});

describe("Vosk words", () => {
  it("rounds seconds to integer milliseconds and drops empty annotations", () => {
    expect(
      parseVosk([
        { word: "BLOCK,", start: 1.2344, end: 1.5678 },
        { word: "[Music]", start: 2, end: 3 },
        { word: "...", start: 3, end: 4 },
      ]),
    ).toEqual([["block", 1234, 1568]]);
  });
  it("matches Python ties-to-even millisecond rounding from S7", () => {
    expect(parseVosk([{ word: "market", start: 0.0005, end: 0.0015 }])).toEqual([["market", 0, 2]]);
  });
  it.each([NaN, Infinity, -0.0001, Number.MAX_SAFE_INTEGER])(
    "refuses invalid seconds %s",
    (start) => {
      expect(() => parseVosk([{ word: "block", start, end: start }])).toThrow();
    },
  );
  it("rejects multiword and reversed intervals", () => {
    expect(() => parseVosk([{ word: "two words", start: 0, end: 1 }])).toThrow();
    expect(() => parseVosk([{ word: "block", start: 1, end: 0 }])).toThrow();
  });
});
