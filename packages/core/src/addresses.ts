import type { Address } from "viem";

/** Monad testnet only. Every entry passes `bun run --cwd packages/core check-addresses`. */
export const CHAIN_ID = 10143;

export const addresses = {
  /** Agora AUSD test token, 6 decimals, ERC-2612 permit. Quote and collateral. */
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  /** AUSD testnet faucet, `requestFunds(address)`. */
  ausdFaucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
  /** Kuru testnet USDC, 6 decimals: fallback quote token if the AUSD faucet fails (spike S1). */
  kuruUsdc: "0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570",
  kuruRouter: "0x7EFbE105Ca7415dE98F96622173458ac1c054630",
  kuruMarginAccount: "0xd029C2D98ff85D8F64799017fE00a59B1159CE02",
  /** MockKeystoneForwarder used by `cre workflow simulate --broadcast`. */
  creSimulationForwarder: "0xB9F79d863261869B234c481D1f9A7af84AeAd192",
  /** KeystoneForwarder used by deployed CRE workflows. */
  creForwarder: "0xF8344CFd5c43616a4366C34E3EEE75af79a74482",
} as const satisfies Record<string, Address>;

export type AddressName = keyof typeof addresses;
