import { createSecp256k1SigningSession, MeraError } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HARDENED_OFFSET, HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** Consumes and wipes PRF entropy; only the memory-owned Mera session survives. */
export function sessionFromPrf(prfOutput: Uint8Array) {
  let seed: Uint8Array | undefined;
  let node: HDKey | undefined;
  let privateKey: Uint8Array | null = null;
  try {
    if (prfOutput.length !== 32)
      throw new MeraError("INPUT_INVALID", "Expected 32-byte PRF output");
    // Mnemonic strings cannot be zeroed in JS; never retain or return this string.
    seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
    node = HDKey.fromMasterSeed(seed);
    // m/44'/60'/0'/0/0; wipe each parent instead of losing secret intermediate nodes.
    for (const index of [44 + HARDENED_OFFSET, 60 + HARDENED_OFFSET, HARDENED_OFFSET, 0, 0]) {
      const child: HDKey = node.deriveChild(index);
      node.wipePrivateData();
      node = child;
    }
    privateKey = node.privateKey;
    if (!privateKey) throw new MeraError("INPUT_INVALID", "Missing derived signing key");
    const session = createSecp256k1SigningSession({ privateKey });
    try {
      return { session, signer: toViemAccount(session) };
    } catch (error) {
      session.end();
      throw error;
    }
  } finally {
    prfOutput.fill(0);
    seed?.fill(0);
    privateKey?.fill(0);
    node?.wipePrivateData();
  }
}
