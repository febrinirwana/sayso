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
    BOT_PK: `0x${"13".repeat(32)}`,
    DRIP_PK: `0x${"14".repeat(32)}`,
    REPORTER_PK: `0x${"15".repeat(32)}`,
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

it("rejects a weak drip IP salt without exposing its value", () => {
  try {
    parseConfig({ ...base, DRIP_IP_SALT: "too-short-secret" });
    expect.fail("weak salt accepted");
  } catch (error) {
    expect(String(error)).toContain("DRIP_IP_SALT");
    expect(String(error)).not.toContain("too-short-secret");
  }
});

it("keeps the drip salt out of JSON and hidden-property inspection", () => {
  const salt = "private-ip-salt".repeat(4);
  const config = parseConfig({ ...base, DRIP_IP_SALT: salt });
  expect(config.dripIpSalt()).toBe(salt);
  expect(JSON.stringify(config)).not.toContain(salt);
  expect(inspect(config, { showHidden: true })).not.toContain(salt);
});
it("defaults the drip to one new address per IP hour and refuses non-positive allowances", () => {
  expect(parseConfig(base).dripMaxPerIpHour).toBe(1);
  expect(parseConfig({ ...base, DRIP_MAX_PER_IP_HOUR: "5" }).dripMaxPerIpHour).toBe(5);
  for (const value of ["0", "-1", "1.5", "abc"])
    expect(() => parseConfig({ ...base, DRIP_MAX_PER_IP_HOUR: value })).toThrow();
});

it("refuses two role writers sharing a sender nonce stream", () => {
  const key = `0x${"12".repeat(32)}`;
  expect(() => parseConfig({ ...base, OPERATOR_PK: key, DRIP_PK: key })).toThrow();
});

it("requires an explicit boolean opt-in before accepting same-host proxy identity", () => {
  expect(parseConfig(base).behindCaddy).toBe(false);
  expect(parseConfig({ ...base, STUDIO_BEHIND_CADDY: "true" }).behindCaddy).toBe(true);
  expect(parseConfig({ ...base, STUDIO_BEHIND_CADDY: "false" }).behindCaddy).toBe(false);
  for (const value of ["1", "yes", "TRUE", ""]) {
    expect(() => parseConfig({ ...base, STUDIO_BEHIND_CADDY: value })).toThrow();
  }
});

it("parses comma-separated exact web origins and rejects non-origin allowlist entries", () => {
  expect(parseConfig(base).webOrigins).toEqual([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5181",
    "http://127.0.0.1:5181",
  ]);
  expect(
    parseConfig({
      ...base,
      STUDIO_WEB_ORIGINS: " https://sayso.vercel.app , https://preview.vercel.app ",
    }).webOrigins,
  ).toEqual(["https://sayso.vercel.app", "https://preview.vercel.app"]);
  expect(parseConfig({ ...base, STUDIO_WEB_ORIGINS: "" }).webOrigins).toEqual([]);
  for (const value of [
    "*",
    "null",
    "https://*.vercel.app",
    "https://sayso.vercel.app/",
    "https://sayso.vercel.app/path",
    "https://user:password@sayso.vercel.app",
    "https://sayso.vercel.app,,https://preview.vercel.app",
  ]) {
    expect(() => parseConfig({ ...base, STUDIO_WEB_ORIGINS: value })).toThrow("STUDIO_WEB_ORIGINS");
  }
});
