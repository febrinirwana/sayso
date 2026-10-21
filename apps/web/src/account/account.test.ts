import type * as Mera from "@category-labs/mera";
import { createPasskeyWithPrfOutput } from "@category-labs/mera";
import { addresses, gasLimit, saysoMarketsAbi } from "@sayso/core";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  encodeFunctionData,
  erc20Abi,
  type Hash,
  parseTransaction,
  recoverTransactionAddress,
  type TransactionReceipt,
  type TransactionSerialized,
} from "viem";
import { describe, expect, it, vi } from "vitest";
import { publicClient } from "@/lib/chain";
import { AccountProvider, useAccount } from "./AccountProvider";
import { sessionFromPrf } from "./derive";
import { createSendQueue, InsufficientMonBalanceError } from "./sendQueue";
import type { Account, TxRequest } from "./types";
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

describe("native MON transaction fees", () => {
  const approval: TxRequest = {
    to: addresses.ausd,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [addresses.saysoMarkets, 21_490_194n],
    }),
    gas: gasLimit("approveAusd"),
  };
  const buy: TxRequest = {
    to: addresses.saysoMarkets,
    data: encodeFunctionData({
      abi: saysoMarketsAbi,
      functionName: "buyYes",
      args: [1n, 1_000_000n, 1_900_000n],
    }),
    gas: gasLimit("buyYes"),
  };

  async function signedIn(balance: bigint, legacy = false) {
    const submitted: TransactionSerialized[] = [];
    vi.spyOn(publicClient, "getBalance").mockResolvedValue(balance);
    vi.spyOn(publicClient, "waitForTransactionReceipt").mockResolvedValue({
      blockNumber: 10n,
      status: "success",
    } as TransactionReceipt);
    vi.spyOn(publicClient, "getBlockNumber").mockResolvedValue(11n);
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const rpc = JSON.parse(String(init.body));
      let result: unknown;
      if (rpc.method === "eth_fillTransaction") {
        const request = rpc.params[0];
        // Captured public Monad shape: filling succeeds even without enough MON.
        result = {
          raw: "0x",
          tx: {
            from: request.from,
            to: request.to,
            gas: request.gas,
            ...(legacy
              ? { gasPrice: "0x2363e7f000" }
              : {
                  maxFeePerGas: "0x2363e7f000",
                  maxPriorityFeePerGas: "0x77359400",
                }),
            value: request.value ?? "0x0",
            input: request.data,
            data: null,
            nonce: "0xd",
            chainId: "0x279f",
            accessList: null,
            authorizationList: null,
          },
        };
      } else if (rpc.method === "eth_sendRawTransaction") {
        submitted.push(rpc.params[0]);
        result = hash;
      } else {
        throw new Error(`Unexpected RPC method: ${rpc.method}`);
      }
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result });
    });
    vi.mocked(createPasskeyWithPrfOutput).mockResolvedValue({
      credentialId: "AQ",
      prfOutput: new Uint8Array(32),
      prfSalt: new Uint8Array(32),
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
    await account.join("Fee regression");
    return { account, submitted };
  }

  it.each([
    ["approval", approval],
    ["buy", buy],
    ["native value", { ...tx, value: 10_000_000_000_000_000n }],
  ] as const)(
    "rejects %s before broadcast when native MON cannot cover maximum fees plus value",
    async (_kind, request) => {
      const { account, submitted } = await signedIn(11_409_800_000_000_000n);
      try {
        const failure = account.send(request);
        await expect(failure).rejects.toBeInstanceOf(InsufficientMonBalanceError);
        expect(submitted).toEqual([]);
      } finally {
        account.signOut();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      }
    },
  );

  it("allows approval but rejects the more expensive buy at the same MON balance", async () => {
    const { account, submitted } = await signedIn(20_000_000_000_000_000n);
    try {
      expect(await account.send(approval)).toBe(hash);
      await expect(account.send(buy)).rejects.toThrow(/Not enough MON.*TESTNET/);
      expect(submitted).toHaveLength(1);
    } finally {
      account.signOut();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["approval", approval],
    ["buy", buy],
  ] as const)(
    "signs a valid %s once with the prepared fees and unchanged explicit gas",
    async (_kind, request) => {
      const { account, submitted } = await signedIn(request.gas * 182_400_000_000n);
      try {
        expect(await account.send(request)).toBe(hash);
        expect(submitted).toHaveLength(1);
        const serializedTransaction = submitted[0];
        if (!serializedTransaction) throw new Error("No signed transaction");
        expect(parseTransaction(serializedTransaction)).toMatchObject({
          chainId: 10143,
          nonce: 13,
          type: "eip1559",
          to: request.to.toLowerCase(),
          data: request.data,
          gas: request.gas,
          maxFeePerGas: 182_400_000_000n,
          maxPriorityFeePerGas: 2_000_000_000n,
        });
        expect(await recoverTransactionAddress({ serializedTransaction })).toBe(
          "0xF278cF59F82eDcf871d630F28EcC8056f25C1cdb",
        );
      } finally {
        account.signOut();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
      }
    },
  );

  it("checks legacy gasPrice and releases an unaffordable send for a funded retry", async () => {
    const { account, submitted } = await signedIn(11_409_800_000_000_000n, true);
    try {
      await expect(account.send(approval)).rejects.toBeInstanceOf(InsufficientMonBalanceError);
      expect(submitted).toEqual([]);
      vi.mocked(publicClient.getBalance).mockResolvedValue(approval.gas * 182_400_000_000n);
      expect(await account.send(approval)).toBe(hash);
      const serializedTransaction = submitted[0];
      if (!serializedTransaction) throw new Error("No signed transaction");
      expect(parseTransaction(serializedTransaction)).toMatchObject({
        chainId: 10143,
        nonce: 13,
        type: "legacy",
        gas: approval.gas,
        gasPrice: 182_400_000_000n,
      });
      expect(await recoverTransactionAddress({ serializedTransaction })).toBe(
        "0xF278cF59F82eDcf871d630F28EcC8056f25C1cdb",
      );
    } finally {
      account.signOut();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
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
