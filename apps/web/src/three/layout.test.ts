import { describe, expect, it } from "vitest";
import {
  burstLayout,
  HERO_COPY,
  HERO_PHONE_MAX,
  HERO_WIDE_MIN,
  heroLayout,
  type Piece,
} from "./layout";

type Box = { left: number; right: number; top: number; bottom: number };

const box = (p: Pick<Piece, "x" | "y" | "size">): Box => ({
  left: p.x - p.size / 2,
  right: p.x + p.size / 2,
  top: p.y - p.size / 2,
  bottom: p.y + p.size / 2,
});

describe("heroLayout", () => {
  // Wide boxes are the whole hero under the top bar; bands are the art strip above phone copy.
  const wide = [1024, 1280, 1440, 1920].flatMap((w) => [640, 736, 836].map((h) => [w, h] as const));
  const bands = [320, 390, 412, 430, 600, 768, 1023].flatMap((w) =>
    [280, 340, 420].map((h) => [w, h] as const),
  );

  it.each(wide)("keeps every piece in the %ix%i hero and out of the copy column", (w, h) => {
    const pieces = heroLayout(w, h);
    expect(pieces.length).toBeGreaterThanOrEqual(7);
    for (const piece of pieces) {
      const b = box(piece);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(w);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(h);
      const besideCopy = b.left >= w * HERO_COPY.right;
      const clearOfCopy = b.bottom <= h * HERO_COPY.top || b.top >= h * HERO_COPY.bottom;
      expect(besideCopy || clearOfCopy).toBe(true);
    }
  });

  it.each(bands)("keeps every piece in the %ix%i band and off the mascot", (w, h) => {
    expect(w).toBeLessThan(HERO_WIDE_MIN);
    for (const piece of heroLayout(w, h)) {
      const b = box(piece);
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(w);
      expect(b.top).toBeGreaterThanOrEqual(0);
      expect(b.bottom).toBeLessThanOrEqual(h);
      // The mascot is centred and at most 52 % of the band wide.
      expect(b.right <= w * 0.24 || b.left >= w * 0.76).toBe(true);
    }
  });

  it("shows fewer, smaller pieces on phones than on desktop", () => {
    const phone = heroLayout(412, 340);
    const desktop = heroLayout(1440, 836);
    expect(phone.length).toBeLessThan(desktop.length);
    expect(phone.length).toBe(heroLayout(HERO_PHONE_MAX - 1, 340).length);
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
