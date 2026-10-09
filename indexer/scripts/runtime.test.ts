import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runtimeConfig } from "./runtime";

const production = JSON.parse(
  execFileSync(
    "bun",
    ["-e", 'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file("config.yaml").text())))'],
    { encoding: "utf8" },
  ),
);

describe("self-hosted data source", () => {
  it("uses RPC without a HyperSync token and preserves every event and creation block", () => {
    const selected = runtimeConfig(production, { ENVIO_RPC_URL: "https://rpc.invalid/private" });
    expect(selected.chains[0]?.rpc).toEqual([
      {
        url: `\${ENVIO_RPC_URL}`,
        for: "sync",
        initial_block_interval: 100,
        interval_ceiling: 100,
      },
    ]);
    expect(JSON.stringify(selected)).not.toContain("rpc.invalid/private");
    expect(selected.chains[0]?.hypersync_config).toBeUndefined();
    expect(selected.chains[0]?.start_block).toBe(69202243);
    expect(selected.contracts).toEqual(production.contracts);
    expect(selected.chains[0]?.contracts).toEqual(production.chains[0].contracts);
    expect(production.chains[0].hypersync_config).toEqual({
      url: "https://monad-testnet.hypersync.xyz",
    });
  });

  it("retains the production HyperSync source when a token is present", () => {
    expect(runtimeConfig(production, { ENVIO_API_TOKEN: "test-only" })).toEqual(production);
  });

  it("refuses token-free startup without an RPC rather than using HyperSync", () => {
    expect(() => runtimeConfig(production, {})).toThrow("ENVIO_RPC_URL");
  });
});
