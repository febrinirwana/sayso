import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Simulate still requires one configured address. This fixture is never used by dev.
writeFileSync(
  "config.test.yaml",
  readFileSync("config.yaml", "utf8")
    .replace(/^([ \t]*)start_block:.*$/m, "$1start_block: 0")
    .replace(
      /^([ \t]*)address:[^\n]*(?:\n\1[ \t]+-[^\n]*)*/m,
      '$1address: ["0x00000000000000000000000000000000000000c1"]',
    ),
);

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    testTimeout: 30_000,
    env: { ENVIO_CONFIG: "config.test.yaml" },
  },
});
