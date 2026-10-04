import { concat, type Hex, keccak256 } from "viem";

export function hashPair(a: Hex, b: Hex): Hex {
  return keccak256(concat(BigInt(a) < BigInt(b) ? [a, b] : [b, a]));
}

function nextLevel(nodes: readonly Hex[]): Hex[] {
  const parents: Hex[] = [];
  for (let index = 0; index < nodes.length; index += 2) {
    const left = nodes[index];
    const right = nodes[index + 1];
    if (left !== undefined) {
      parents.push(right === undefined ? left : hashPair(left, right));
    }
  }
  return parents;
}

export function merkleRoot(leaves: readonly Hex[]): Hex {
  if (leaves.length === 0) {
    throw new RangeError("A Merkle tree needs at least one leaf");
  }
  let nodes = leaves;
  while (nodes.length > 1) {
    nodes = nextLevel(nodes);
  }
  // The nonempty input and odd-node promotion preserve a node at every level.
  return nodes[0] as Hex;
}

export function merkleProof(leaves: readonly Hex[], index: number): Hex[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
    throw new RangeError("Proof index must select an existing leaf");
  }
  const proof: Hex[] = [];
  let nodes = leaves;
  let position = index;
  while (nodes.length > 1) {
    const sibling = nodes[position % 2 === 0 ? position + 1 : position - 1];
    if (sibling !== undefined) {
      proof.push(sibling);
    }
    nodes = nextLevel(nodes);
    position = Math.floor(position / 2);
  }
  return proof;
}

export function verifyProof(leaf: Hex, proof: readonly Hex[], root: Hex): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return computed.toLowerCase() === root.toLowerCase();
}
