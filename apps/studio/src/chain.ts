import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import type { ChainReader } from "./app.ts";
import type { StudioConfig } from "./config.ts";

export function createChainReader(config: StudioConfig): ChainReader {
  const client = createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl) });
  return {
    async snapshot() {
      if ((await client.getChainId()) !== 10143) throw new Error("RPC is not Monad testnet");
      const block = await client.getBlock({ blockTag: "latest" });
      const balances = await Promise.all(
        config.keyAddresses.map(async ({ role, address }) => ({
          role,
          address,
          monWei: (await client.getBalance({ address })).toString(),
        })),
      );
      return {
        headNumber: block.number.toString(),
        headTimestampMs: Number(block.timestamp) * 1000,
        balances,
      };
    },
  };
}
