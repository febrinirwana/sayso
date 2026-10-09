import { Runner } from "@chainlink/cre-sdk";
import { configSchema } from "./config.ts";
import { initWorkflow } from "./workflow.ts";

export async function main() {
  const runner = await Runner.newRunner({ configSchema });
  await runner.run(initWorkflow);
}

main();
