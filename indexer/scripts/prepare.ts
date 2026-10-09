import { mkdir, readFile, writeFile } from "node:fs/promises";

// Repository-side generation only. Cloud installs and runs the standalone indexer/
// directory; it must not need Bun, workspace dependencies or a custom build step.
// Core modules do not exist in the Cloud upload: static imports would break its
// standalone typecheck. Only this repository-side generator loads them at runtime.
const coreAbi = new URL("../../packages/core/abi/sayso.ts", import.meta.url).href;
const coreAddresses = new URL("../../packages/core/src/addresses.ts", import.meta.url).href;
const { outcomeTokenAbi, saysoMarketsAbi } = await import(coreAbi);
const { addresses, CHAIN_ID } = await import(coreAddresses);
const compiler = JSON.parse(
  await readFile(new URL("../../tsconfig.base.json", import.meta.url), "utf8"),
);
const template = await readFile(new URL("../config.template.yaml", import.meta.url), "utf8");
const artifacts: Record<string, string> = {
  "config.yaml": template
    .replaceAll("__CHAIN_ID__", String(CHAIN_ID))
    .replaceAll("__MARKETS_ADDRESS__", addresses.saysoMarkets)
    .replaceAll("__START_BLOCK__", "69202243"),
  "abi/SaysoMarkets.json": `${JSON.stringify(saysoMarketsAbi, null, 2)}\n`,
  "abi/OutcomeToken.json": `${JSON.stringify(outcomeTokenAbi, null, 2)}\n`,
  "tsconfig.json": [
    "{",
    '  "compilerOptions": {',
    Object.entries({ ...compiler.compilerOptions, types: ["bun"] })
      .map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
      .join(",\n"),
    "  },",
    '  "include": ["src/**/*.ts", "scripts/**/*.ts", "vitest.config.ts", ".envio/**/*.d.ts"]',
    "}",
    "",
  ].join("\n"),
};
const check = Bun.argv.includes("--check");
if (!check) await mkdir("abi", { recursive: true });
for (const [path, expected] of Object.entries(artifacts)) {
  if (check) {
    const actual = await readFile(path, "utf8").catch(() => undefined);
    if (actual !== expected) throw new Error(`${path} drifted; run bun scripts/prepare.ts`);
  } else {
    await writeFile(path, expected);
  }
}
