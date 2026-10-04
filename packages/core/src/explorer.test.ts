import { describe, expect, it } from "vitest";
import { explorerAddressUrl, explorerTxUrl } from "./index.ts";

const TX = "0x5f815e5292cf3b123df58ad6d4531c085d94d5717a3b02740369a04273fde96c";
const ADDR = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";

describe("explorer links", () => {
  it("links a transaction hash on the testnet explorer", () => {
    expect(explorerTxUrl(TX)).toBe(`https://testnet.monadvision.com/tx/${TX}`);
  });

  it("links an address on the testnet explorer", () => {
    expect(explorerAddressUrl(ADDR)).toBe(`https://testnet.monadvision.com/address/${ADDR}`);
  });

  it("rejects a hash that is not 32 bytes of hex", () => {
    expect(() => explorerTxUrl(TX.slice(0, -1))).toThrow(/transaction hash/);
    expect(() => explorerTxUrl(`${TX.slice(0, -1)}g`)).toThrow(/transaction hash/);
  });

  it("rejects an address that is not 20 bytes of hex", () => {
    expect(() => explorerAddressUrl(`${ADDR}00`)).toThrow(/address/);
  });
});
