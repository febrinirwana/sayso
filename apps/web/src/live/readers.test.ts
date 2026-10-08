import { expect, it } from "vitest";
import { bookCents } from "./readers";

it("decodes Kuru bestBidAsk 18-decimal prices and rejects empty-book sentinels", () => {
  expect(bookCents(490_000_000_000_000_000n)).toBe(49);
  expect(bookCents(980_000_000_000_000_000n)).toBe(98);
  expect(bookCents(0n)).toBeNull();
  expect(bookCents((1n << 256n) - 1n)).toBeNull();
});
