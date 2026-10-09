import { CHAIN_ID } from "@sayso/core";
import { createPublicClient, defineChain, http } from "viem";
import { config } from "./config";

export const monadTestnet = defineChain({
  id: CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  testnet: true,
});

/** The one read client. Chain is truth; the indexer and studio are read models. */
export const publicClient = createPublicClient({
  chain: monadTestnet,
  // The public RPC limits each IP per second (eth_call 15/s). viem retries 429 by default, but its
  // 150 ms base lands every retry in the same window; 1 s, 2 s, 4 s reach fresh windows. Live run
  // 2026-10-10: Portfolio's burst got 429 on all three default retries.
  transport: http(config.rpcUrl, { retryCount: 3, retryDelay: 1_000 }),
});
