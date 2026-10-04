import { describe, expect, it } from "vitest";
import { ADJECTIVES, NOUNS, nicknameOf } from "./nickname.ts";

const ADDRESS = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed";

describe("nicknameOf", () => {
  it.each([
    ["0x0000000000000000000000000000000000000000", "Dreamy Anchor"],
    ["0x0000000000000000000000000000000000000001", "White Fern"],
    ["0x52908400098527886E0F7030069857D2E4169EE7", "True Pond"],
  ])("preserves the player identity for %s", (address, expected) => {
    expect(nicknameOf(address)).toBe(expected);
  });

  it("restores the same two-word name regardless of address hex casing", () => {
    const nickname = nicknameOf(ADDRESS);
    expect(nicknameOf(ADDRESS.toLowerCase())).toBe(nickname);
    expect(nicknameOf(`0x${ADDRESS.slice(2).toUpperCase()}`)).toBe(nickname);
    expect(nicknameOf(ADDRESS.toUpperCase())).toBe(nickname);
    expect(nickname).toMatch(/^[A-Z][a-z]{0,7} [A-Z][a-z]{0,7}$/);
  });

  it.each([
    "",
    "0x1234",
    "52908400098527886E0F7030069857D2E4169EE7",
    `${ADDRESS}00`,
    `${ADDRESS.slice(0, -1)}g`,
  ])("rejects an invalid 20-byte hex address %s", (address) => {
    expect(() => nicknameOf(address)).toThrow();
  });

  it.each([
    ["adjectives", ADJECTIVES],
    ["nouns", NOUNS],
  ] as const)("keeps 128 unique short English %s for stable player names", (_label, words) => {
    expect(words).toHaveLength(128);
    expect(new Set(words.map((word) => word.toLowerCase())).size).toBe(128);
    for (const word of words) {
      expect(word).toMatch(/^[A-Z][a-z]{0,7}$/);
    }
  });
});
