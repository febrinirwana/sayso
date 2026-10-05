import { inspect } from "node:util";
import { expect, it } from "vitest";
import { parseConfig } from "./config.ts";

const base = { RPC_URL: "http://127.0.0.1:8545", CHAIN_ID: "10143", STUDIO_DATA_DIR: "data" };

it("refuses any chain other than Monad testnet", () => {
  expect(() => parseConfig({ ...base, CHAIN_ID: "143" })).toThrow();
});

it("keeps loaded role keys out of JSON and inspection, including hidden properties", () => {
  const key = `0x${"12".repeat(32)}`;
  const config = parseConfig({
    ...base,
    OPERATOR_PK: key,
    BOT_PK: key,
    DRIP_PK: key,
    REPORTER_PK: key,
  });
  expect(config.privateKey("operator")).toBe(key);
  for (const text of [
    JSON.stringify(config),
    inspect(config, { showHidden: true }),
    Bun.inspect(config),
  ]) {
    expect(text).not.toContain(key);
    expect(text).not.toContain(key.slice(2));
  }
});

it("refuses malformed key material without exposing it in errors", () => {
  const key = "secret-invalid-key-material";
  try {
    parseConfig({ ...base, OPERATOR_PK: key });
    expect.fail("invalid key accepted");
  } catch (error) {
    expect(String(error)).not.toContain(key);
  }
});
