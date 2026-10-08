import { defineConfig } from "@playwright/test";

const port = 5181;

/** Phone-sized Edge runs against the Vite dev server; specs live in `e2e/` (Vitest never sees them). */
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  reporter: [["list"]],
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    channel: "msedge",
    viewport: { width: 412, height: 915 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
