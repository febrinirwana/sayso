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
  transport: http(config.rpcUrl),
});
