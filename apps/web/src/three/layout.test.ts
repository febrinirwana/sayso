import { describe, expect, it } from "vitest";
import {
  burstLayout,
  HERO_CLEAR_BOTTOM,
  HERO_CLEAR_TOP,
  HERO_MOBILE_MAX,
  HERO_TEXT_MAX,
  HERO_WIDE_MIN,
  heroLayout,
  type Piece,
} from "./layout";

const widths = [320, 390, 412, 430, 600, 767, 768, 1024, 1099, 1100, 1280, 1440, 1920, 2560];
const heights = [640, 780, 851, 920];
const sizes = widths.flatMap((w) => heights.map((h) => [w, h] as const));

type Box = { left: number; right: number; top: number; bottom: number };

const box = (p: Pick<Piece, "x" | "y" | "size">): Box => ({
  left: p.x - p.size / 2,
  right: p.x + p.size / 2,
  top: p.y - p.size / 2,
  bottom: p.y + p.size / 2,
});

describe("heroLayout", () => {
  it.each(sizes)("keeps every piece inside the %ix%i box and off the text", (w, h) => {
    const pieces = heroLayout(w, h);
    expect(pieces.length).toBeGreaterThanOrEqual(4);
    for (const piece of pieces) {
      const b = box(piece);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(w);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(h);
      if (w >= HERO_WIDE_MIN) {
        const textLeft = (w - HERO_TEXT_MAX) / 2;
        expect(b.right <= textLeft || b.left >= w - textLeft).toBe(true);
      } else {
        expect(b.bottom <= h * HERO_CLEAR_TOP || b.top >= h * (1 - HERO_CLEAR_BOTTOM)).toBe(true);
      }
    }
  });

  it("shows fewer, smaller pieces on phones than on desktop", () => {
    const phone = heroLayout(412, 851);
    const desktop = heroLayout(1440, 836);
    expect(phone.length).toBeLessThan(desktop.length);
    expect(phone.length).toBe(heroLayout(HERO_MOBILE_MAX - 1, 851).length);
    const largest = (pieces: Piece[]) => Math.max(...pieces.map((p) => p.size));
    expect(largest(phone)).toBeLessThan(largest(desktop));
  });

  it("draws nothing into an unmeasured box", () => {
    expect(heroLayout(0, 0)).toEqual([]);
  });
});

describe("burstLayout", () => {
  it.each([
    [412, 412],
    [360, 300],
    [1440, 900],
  ])("rings a clear centre inside the %ix%i box", (w, h) => {
    const pieces = burstLayout(w, h);
    for (const piece of pieces) {
      const b = box(piece);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(w);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(h);
      // The point of the piece nearest the centre stays outside an ellipse of half-axes w/4, h/4.
      const dx = Math.max(b.left - w / 2, 0, w / 2 - b.right) / (w / 4);
      const dy = Math.max(b.top - h / 2, 0, h / 2 - b.bottom) / (h / 4);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(1);
    }
  });
});
