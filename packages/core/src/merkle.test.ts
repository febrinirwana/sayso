import { type Hex, keccak256, toBytes } from "viem";
import { describe, expect, it } from "vitest";
import { hashPair, merkleProof, merkleRoot, verifyProof } from "./merkle.ts";

const leaves = Array.from({ length: 9 }, (_, index) => keccak256(toBytes(`leaf-${index}`)));
const [a, b, c, d, e] = leaves as [Hex, Hex, Hex, Hex, Hex, ...Hex[]];

describe("commutative Merkle trees", () => {
  it("matches a known keccak pair vector regardless of argument order", () => {
    const low: Hex = `0x${"0".repeat(63)}1`;
    const high: Hex = `0x${"0".repeat(63)}2`;
    const expected = "0xe90b7bceb6e7df5418fb78d8ee546e97c83a08bbccc01a0644d599ccd2a7c2e0";
    expect(hashPair(low, high)).toBe(expected);
    expect(hashPair(high, low)).toBe(expected);
  });

  it("uses adjacent chunk order and promotes odd nodes without duplication", () => {
    expect(merkleRoot([a])).toBe(a);
    expect(merkleRoot([a, b])).toBe(hashPair(a, b));
    expect(merkleRoot([a, b, c])).toBe(hashPair(hashPair(a, b), c));
    expect(merkleRoot([a, b, c, d, e])).toBe(hashPair(hashPair(hashPair(a, b), hashPair(c, d)), e));
  });

  it("omits promoted levels from proofs", () => {
    expect(merkleProof([a], 0)).toEqual([]);
    expect(merkleProof([a, b, c], 2)).toEqual([hashPair(a, b)]);
    expect(merkleProof([a, b, c, d, e], 4)).toEqual([hashPair(hashPair(a, b), hashPair(c, d))]);
  });

  it.each(Array.from({ length: 9 }, (_, index) => index + 1))(
    "verifies every leaf in a %i-leaf tree",
    (count) => {
      const input = leaves.slice(0, count);
      const root = merkleRoot(input);
      for (const [index, leaf] of input.entries()) {
        expect(verifyProof(leaf, merkleProof(input, index), root)).toBe(true);
      }
    },
  );

  it("rejects tampered leaves, tampered siblings and a different index's proof", () => {
    const root = merkleRoot(leaves);
    const proof = merkleProof(leaves, 0);
    const tampered = keccak256(toBytes("tampered"));
    expect(verifyProof(tampered, proof, root)).toBe(false);
    expect(verifyProof(a, [tampered, ...proof.slice(1)], root)).toBe(false);
    expect(verifyProof(a, merkleProof(leaves, 1), root)).toBe(false);
    expect(verifyProof(a, proof, tampered)).toBe(false);
  });

  it("compares root hashes as values regardless of hex letter case", () => {
    expect(verifyProof(a, [], a.toUpperCase().replace("0X", "0x") as Hex)).toBe(true);
  });

  it("rejects an empty tree", () => {
    expect(() => merkleRoot([])).toThrow();
    expect(() => merkleProof([], 0)).toThrow();
  });

  it.each([-1, 9, 0.5, Number.NaN])("rejects invalid proof index %s", (index) => {
    expect(() => merkleProof(leaves, index)).toThrow();
  });
});
