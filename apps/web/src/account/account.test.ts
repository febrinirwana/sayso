import type * as Mera from "@category-labs/mera";
import { createPasskeyWithPrfOutput } from "@category-labs/mera";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Hash } from "viem";
import { describe, expect, it, vi } from "vitest";
import { AccountProvider, useAccount } from "./AccountProvider";
import { sessionFromPrf } from "./derive";
import { createSendQueue } from "./sendQueue";
import type { Account } from "./types";
import { defaultPasskeyName, normalizePasskeyName } from "./types";

vi.mock("@category-labs/mera", async (importOriginal) => ({
  ...(await importOriginal<typeof Mera>()),
  createPasskeyWithPrfOutput: vi.fn(),
}));

const hash = `0x${"1".repeat(64)}` as Hash;
const tx = { to: "0x0000000000000000000000000000000000000001", data: "0x", gas: 25_200n } as const;

describe("passkey identity", () => {
  it("derives the fixed Ethereum index-zero checksum address and wipes entropy", () => {
    const entropy = new Uint8Array(32);
    const first = sessionFromPrf(entropy);
    const otherEntropy = new Uint8Array(32).fill(1);
    const different = sessionFromPrf(otherEntropy);
    try {
      expect(first.signer.address).toBe("0xF278cF59F82eDcf871d630F28EcC8056f25C1cdb");
      expect(different.signer.address).not.toBe(first.signer.address);
      expect(entropy.every((byte) => byte === 0)).toBe(true);
      expect(otherEntropy.every((byte) => byte === 0)).toBe(true);
    } finally {
      first.session.end();
      different.session.end();
    }
  });
});

describe("passkey names", () => {
  const fallback = "SAYSO · 11 Oct 14:24";
  it.each([
    ["", fallback],
    [" \t\n ", fallback],
    ["  My \n game\t account  ", "My game account"],
    ["a".repeat(40), "a".repeat(32)],
    [` ${"🎮".repeat(33)} `, "🎮".repeat(32)],
    [` ${"e\u0301".repeat(33)} `, "e\u0301".repeat(32)],
  ])("normalises %j without splitting Unicode characters", (input, expected) => {
    expect(normalizePasskeyName(input, fallback)).toBe(expected);
  });

  it("uses the player's local date and time for a default", () => {
    expect(defaultPasskeyName(new Date(2026, 9, 11, 14, 24))).toBe(fallback);
  });

  it("passes the chosen name to Mera and still wipes the PRF buffers", async () => {
    const prfOutput = new Uint8Array(32).fill(1);
    const prfSalt = new Uint8Array(32).fill(2);
    vi.mocked(createPasskeyWithPrfOutput).mockResolvedValue({
      credentialId: "AQ",
      prfOutput,
      prfSalt,
    });
    let account: Account | undefined;
    function Player() {
      account = useAccount();
      return null;
    }
    renderToStaticMarkup(
      h(AccountProvider, {
        // biome-ignore lint/correctness/noChildrenProp: non-JSX test file.
        children: h(Player),
      }),
    );
    if (!account) throw new Error("AccountProvider did not expose its account");
    try {
      await account.join("  Phone \n predictions 🎮 ");
      expect(createPasskeyWithPrfOutput).toHaveBeenCalledWith({
        rp: { id: "localhost", name: "SAYSO" },
        user: { name: "Phone predictions 🎮", displayName: "Phone predictions 🎮" },
      });
      expect(prfOutput.every((byte) => byte === 0)).toBe(true);
      expect(prfSalt.every((byte) => byte === 0)).toBe(true);
    } finally {
      account.signOut();
    }
  });
});

describe("block-sequenced sends", () => {
  it("does not broadcast the second transaction in the first receipt block", async () => {
    vi.useFakeTimers();
    let block = 10n;
    const broadcasts: bigint[] = [];
    const send = createSendQueue({
      broadcast: async () => {
        broadcasts.push(block);
        return hash;
      },
      waitForTransactionReceipt: async () => ({ blockNumber: 10n, status: "success" }),
      getBlockNumber: async () => block,
    });
    try {
      const first = send(tx);
      const second = send(tx);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(broadcasts).toEqual([10n]);
      block = 11n;
      await vi.advanceTimersByTimeAsync(500);
      expect(await first).toBe(hash);
      expect(await second).toBe(hash);
      expect(broadcasts).toEqual([10n, 11n]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a revert and releases the queue only after its block", async () => {
    vi.useFakeTimers();
    let block = 10n;
    let count = 0;
    const send = createSendQueue({
      broadcast: async () => {
        count++;
        return hash;
      },
      waitForTransactionReceipt: async () => ({
        blockNumber: 10n,
        status: count === 1 ? "reverted" : "success",
      }),
      getBlockNumber: async () => block,
    });
    try {
      const failure = expect(send(tx)).rejects.toThrow("TRANSACTION_REVERTED");
      const second = send(tx);
      await vi.advanceTimersByTimeAsync(500);
      expect(count).toBe(1);
      block = 11n;
      await vi.advanceTimersByTimeAsync(500);
      await failure;
      expect(await second).toBe(hash);
      expect(count).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
