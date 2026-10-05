import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Simulate still requires one configured address. This fixture is never used by dev.
writeFileSync(
  "config.test.yaml",
  readFileSync("config.yaml", "utf8").replace(
    /address: .*/,
    'address: ["0x00000000000000000000000000000000000000c1"]',
  ),
);

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    env: { ENVIO_CONFIG: "config.test.yaml" },
  },
});
