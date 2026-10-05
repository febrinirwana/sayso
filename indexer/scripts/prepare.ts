import { mkdir } from "node:fs/promises";
import { outcomeTokenAbi, saysoMarketsAbi } from "@sayso/core";

// The core ABI is itself generated from forge build artifacts. Never copy signatures here.
await mkdir("generated", { recursive: true });
await Bun.write("generated/SaysoMarkets.json", JSON.stringify(saysoMarketsAbi));
await Bun.write("generated/OutcomeToken.json", JSON.stringify(outcomeTokenAbi));

if (Bun.argv.includes("--deployed")) {
  const config = await Bun.file("config.yaml").text();
  if (config.includes("address: []")) {
    throw new Error(
      "Set SaysoMarkets address and start_block in config.yaml after deployment and cast code verification",
    );
  }
}
