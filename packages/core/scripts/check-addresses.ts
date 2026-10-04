// Fails unless every address in src/addresses.ts is checksummed and has code on Monad testnet.
// Usage: bun run --cwd packages/core check-addresses   (RPC_URL overrides the public endpoint)
import { createPublicClient, http, isAddress } from "viem";
import { monadTestnet } from "viem/chains";
import { addresses, CHAIN_ID } from "../src/addresses.ts";

const client = createPublicClient({ chain: monadTestnet, transport: http(process.env.RPC_URL) });

const chainId = await client.getChainId();
if (chainId !== CHAIN_ID) throw new Error(`RPC is chain ${chainId}, expected ${CHAIN_ID}`);

let failed = 0;
for (const [name, address] of Object.entries(addresses)) {
  const code = isAddress(address, { strict: true }) ? await client.getCode({ address }) : undefined;
  const bytes = code ? (code.length - 2) / 2 : 0;
  if (bytes === 0) failed++;
  console.log(`${bytes > 0 ? "ok  " : "FAIL"} ${name.padEnd(24)} ${address} ${bytes} bytes`);
}
if (failed > 0) {
  console.error(`${failed} address(es) without code or with a bad checksum`);
  process.exit(1);
}
