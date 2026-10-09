import { expect, it } from "vitest";
import { configSchema } from "./config.ts";

it("accepts a reveal HTTP origin without the browser URL global in CRE QuickJS", () => {
  const original = globalThis.URL;
  try {
    // CRE executes the schema in QuickJS, not Node's web-compatible globals.
    Reflect.deleteProperty(globalThis, "URL");
    expect(
      configSchema.safeParse({
        chainSelectorName: "monad-testnet",
        saysoMarkets: "0xc8492B2906d57c184be372899d18EDF195D11CF8",
        revealApiBaseUrl: "http://127.0.0.1:31812",
        reportGasLimit: "300000",
      }).success,
    ).toBe(true);
  } finally {
    globalThis.URL = original;
  }
});

it.each([
  "REPLACE_WITH_URL",
  "file:///tmp/chunks",
  "http://",
  "https://host with spaces",
  "https://user:secret@host",
])("rejects unsafe reveal URL %s", (revealApiBaseUrl) => {
  expect(
    configSchema.safeParse({
      chainSelectorName: "monad-testnet",
      saysoMarkets: "0xc8492B2906d57c184be372899d18EDF195D11CF8",
      revealApiBaseUrl,
      reportGasLimit: "300000",
    }).success,
  ).toBe(false);
});
