import type * as Mera from "@category-labs/mera";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
  MeraError,
} from "@category-labs/mera";
import { nicknameOf } from "@sayso/core";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Address, TransactionReceipt } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicClient } from "@/lib/chain";
import { AccountProvider, RequireAccount, useAccount } from "./AccountProvider";
import { type AccountController, accountErrorCode, createAccountController } from "./controller";
import { sessionFromPrf } from "./derive";
import {
  ACCOUNT_STORAGE_KEY,
  type AccountStorage,
  clearStoredAddress,
  readStoredAddress,
  writeStoredAddress,
} from "./storage";
import type { Account } from "./types";

vi.mock("@category-labs/mera", async (importOriginal) => ({
  ...(await importOriginal<typeof Mera>()),
  createPasskeyWithPrfOutput: vi.fn(),
  getPasskeyPrfOutput: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ href: "/portfolio" }),
  useNavigate: () => vi.fn(),
}));

const FIRST = 0;
const SECOND = 1;

function addressOf(fill: number): Address {
  const { session, signer } = sessionFromPrf(new Uint8Array(32).fill(fill));
  session.end();
  return signer.address;
}
const A = addressOf(FIRST);
const B = addressOf(SECOND);

function memoryStorage(initial?: string): AccountStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>(initial ? [[ACCOUNT_STORAGE_KEY, initial]] : []);
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  };
}
const storedAs = (address: Address) => JSON.stringify({ v: 1, address });

/** The next passkey assertion derives the account behind `fill`. */
function passkeyDerives(fill: number) {
  vi.mocked(getPasskeyPrfOutput).mockImplementation(
    async () => ({ prfOutput: new Uint8Array(32).fill(fill) }) as never,
  );
}
function passkeyCreates(fill: number) {
  vi.mocked(createPasskeyWithPrfOutput).mockImplementation(async () => ({
    credentialId: "AQ",
    prfOutput: new Uint8Array(32).fill(fill),
    prfSalt: new Uint8Array(32),
  }));
}

function renderAccount(): Account {
  let account: Account | undefined;
  function Player() {
    account = useAccount();
    return null;
  }
  // biome-ignore lint/correctness/noChildrenProp: non-JSX test file.
  renderToStaticMarkup(h(AccountProvider, { children: h(Player) }));
  if (!account) throw new Error("AccountProvider did not expose its account");
  return account;
}

const controllers: AccountController[] = [];
function controllerOn(storage: AccountStorage) {
  const controller = createAccountController({ storage });
  controllers.push(controller);
  return controller;
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(getPasskeyPrfOutput).mockReset();
  vi.mocked(createPasskeyWithPrfOutput).mockReset();
});

describe("stored account payload", () => {
  it("keeps a versioned public address and ignores anything else", () => {
    const storage = memoryStorage();
    writeStoredAddress(storage, A);
    expect(JSON.parse(storage.entries.get(ACCOUNT_STORAGE_KEY) ?? "")).toEqual({
      v: 1,
      address: A,
    });
    expect(readStoredAddress(storage)).toBe(A);
    clearStoredAddress(storage);
    expect(readStoredAddress(storage)).toBeNull();
  });

  it.each([
    ["garbage", "not json"],
    ["another version", JSON.stringify({ v: 2, address: A })],
    ["no version", JSON.stringify({ address: A })],
    ["a non-address", JSON.stringify({ v: 1, address: "0x1234" })],
    ["a bare string", JSON.stringify(A)],
  ])("treats %s as signed out", (_name, raw) => {
    expect(readStoredAddress(memoryStorage(raw))).toBeNull();
    expect(createAccountController({ storage: memoryStorage(raw) }).getSnapshot().status).toBe(
      "signed-out",
    );
  });
});

describe("join and sign-in", () => {
  it("persists only the public address after joining", async () => {
    const storage = memoryStorage();
    passkeyCreates(FIRST);
    const controller = controllerOn(storage);
    await controller.join("Phone");
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", address: A });
    expect([...storage.entries.keys()]).toEqual([ACCOUNT_STORAGE_KEY]);
    const payload = JSON.parse(storage.entries.get(ACCOUNT_STORAGE_KEY) ?? "");
    expect(Object.keys(payload).sort()).toEqual(["address", "v"]);
    expect(payload).toEqual({ v: 1, address: A });
  });

  it("persists the address after signing in with an existing passkey", async () => {
    const storage = memoryStorage();
    passkeyDerives(SECOND);
    const controller = controllerOn(storage);
    await controller.signIn();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", address: B });
    expect(readStoredAddress(storage)).toBe(B);
  });

  it("never installs a different passkey over a stored account without a choice", async () => {
    const storage = memoryStorage(storedAs(A));
    passkeyDerives(SECOND);
    const controller = controllerOn(storage);
    await controller.signIn();
    expect(controller.getSnapshot()).toMatchObject({
      status: "locked",
      address: A,
      signer: null,
      mismatch: { expected: A, found: B },
    });
    expect(readStoredAddress(storage)).toBe(A);
    controller.switchToFound();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", address: B, mismatch: null });
    expect(readStoredAddress(storage)).toBe(B);
  });

  it("signs in straight to ready when the passkey matches the stored account", async () => {
    const storage = memoryStorage(storedAs(A));
    passkeyDerives(FIRST);
    const controller = controllerOn(storage);
    await controller.signIn();
    expect(controller.getSnapshot()).toMatchObject({ status: "ready", address: A, mismatch: null });
  });
});

describe("a refreshed page with a stored account", () => {
  it("starts locked with the address and nickname but no signer", () => {
    vi.stubGlobal("localStorage", memoryStorage(storedAs(A)));
    const account = renderAccount();
    expect(account.status).toBe("locked");
    expect(account.address).toBe(A);
    expect(account.nickname).toBe(nicknameOf(A));
    expect(account.signer).toBeNull();
    expect(account.unlocking).toBe(false);
    expect(account.mismatch).toBeNull();
  });

  it("starts signed out without storage", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const account = renderAccount();
    expect(account.status).toBe("signed-out");
    expect(account.address).toBeNull();
  });

  function gate(stored?: string) {
    vi.stubGlobal("localStorage", memoryStorage(stored));
    return renderToStaticMarkup(
      h(AccountProvider, {
        // biome-ignore lint/correctness/noChildrenProp: non-JSX test file.
        children: h(RequireAccount, {
          // biome-ignore lint/correctness/noChildrenProp: non-JSX test file.
          children: h("p", null, "portfolio view"),
        }),
      }),
    );
  }

  it("keeps read-only views on screen while locked and hides them when signed out", () => {
    expect(gate(storedAs(A))).toContain("portfolio view");
    expect(gate()).not.toContain("portfolio view");
  });

  it("refuses to send while locked, before touching the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const controller = controllerOn(memoryStorage(storedAs(A)));
    const failure = controller.send({
      to: "0x0000000000000000000000000000000000000001",
      data: "0x",
      gas: 25_200n,
    });
    await expect(failure).rejects.toSatisfy(
      (error) => isMeraError(error) && error.code === "SESSION_ENDED",
    );
    await expect(failure).rejects.toThrow(/Unlock with your passkey/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("locked");
  });
});

describe("unlock", () => {
  it("does nothing before the player asks and never prompts on its own", () => {
    controllerOn(memoryStorage(storedAs(A)));
    expect(getPasskeyPrfOutput).not.toHaveBeenCalled();
  });

  it("becomes ready when the passkey derives the stored address", async () => {
    const storage = memoryStorage(storedAs(A));
    passkeyDerives(FIRST);
    const controller = controllerOn(storage);
    const pending = controller.unlock();
    expect(controller.getSnapshot()).toMatchObject({ status: "locked", unlocking: true });
    expect(await pending).toBe("ready");
    const snapshot = controller.getSnapshot();
    expect(snapshot).toMatchObject({ status: "ready", address: A, unlocking: false });
    expect(snapshot.signer?.address).toBe(A);
    expect(readStoredAddress(storage)).toBe(A);
  });

  it("stays locked and shows both addresses when another passkey answers", async () => {
    const storage = memoryStorage(storedAs(A));
    passkeyDerives(SECOND);
    const controller = controllerOn(storage);
    expect(await controller.unlock()).toBe("mismatch");
    const snapshot = controller.getSnapshot();
    expect(snapshot).toMatchObject({
      status: "locked",
      address: A,
      signer: null,
      unlocking: false,
      mismatch: { expected: A, found: B },
    });
    expect(readStoredAddress(storage)).toBe(A);
  });

  it("switches only when the player picks Use this account", async () => {
    const storage = memoryStorage(storedAs(A));
    passkeyDerives(SECOND);
    const controller = controllerOn(storage);
    await controller.unlock();
    controller.switchToFound();
    const snapshot = controller.getSnapshot();
    expect(snapshot).toMatchObject({ status: "ready", address: B, mismatch: null });
    expect(snapshot.signer?.address).toBe(B);
    expect(readStoredAddress(storage)).toBe(B);
  });

  it("keeps the stored account when the player dismisses a mismatch", async () => {
    const storage = memoryStorage(storedAs(A));
    passkeyDerives(SECOND);
    const controller = controllerOn(storage);
    await controller.unlock();
    controller.dismissMismatch();
    expect(controller.getSnapshot()).toMatchObject({
      status: "locked",
      address: A,
      mismatch: null,
      signer: null,
    });
    expect(readStoredAddress(storage)).toBe(A);
  });

  it("stays locked with an error code when the prompt is cancelled", async () => {
    const storage = memoryStorage(storedAs(A));
    vi.mocked(getPasskeyPrfOutput).mockRejectedValue(new Error("NotAllowedError"));
    const controller = controllerOn(storage);
    expect(await controller.unlock()).toBe("failed");
    expect(controller.getSnapshot()).toMatchObject({
      status: "locked",
      address: A,
      unlocking: false,
      errorCode: "PASSKEY_OPERATION_FAILED",
    });
    // A second tap works.
    passkeyDerives(FIRST);
    expect(await controller.unlock()).toBe("ready");
    expect(controller.getSnapshot().errorCode).toBeNull();
  });

  it("ignores unlock when nothing is stored", async () => {
    const controller = controllerOn(memoryStorage());
    expect(await controller.unlock()).toBe("failed");
    expect(getPasskeyPrfOutput).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("signed-out");
  });
});

describe("session loss and sign out", () => {
  async function readyWithDeadSession(storage: AccountStorage) {
    vi.spyOn(publicClient, "getBalance").mockResolvedValue(10n ** 18n);
    vi.spyOn(publicClient, "waitForTransactionReceipt").mockResolvedValue({
      blockNumber: 10n,
      status: "success",
    } as TransactionReceipt);
    vi.spyOn(publicClient, "getBlockNumber").mockResolvedValue(11n);
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const rpc = JSON.parse(String(init.body));
      if (rpc.method !== "eth_fillTransaction") throw new Error(`Unexpected ${rpc.method}`);
      const request = rpc.params[0];
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: {
          raw: "0x",
          tx: {
            from: request.from,
            to: request.to,
            gas: request.gas,
            maxFeePerGas: "0x2363e7f000",
            maxPriorityFeePerGas: "0x77359400",
            value: "0x0",
            input: request.data,
            data: null,
            nonce: "0xd",
            chainId: "0x279f",
            accessList: null,
            authorizationList: null,
          },
        },
      });
    });
    passkeyCreates(FIRST);
    const controller = controllerOn(storage);
    await controller.join("Phone");
    const { signer } = controller.getSnapshot();
    if (!signer) throw new Error("join did not install a signer");
    vi.spyOn(signer, "signTransaction").mockRejectedValue(
      new MeraError("SESSION_ENDED", "session ended"),
    );
    return controller;
  }
  const request = {
    to: "0x0000000000000000000000000000000000000001",
    data: "0x",
    gas: 25_200n,
  } as const;

  it("locks at once when a send loses its session, without prompting or retrying", async () => {
    const storage = memoryStorage();
    const controller = await readyWithDeadSession(storage);
    passkeyDerives(FIRST);
    await expect(controller.send(request)).rejects.toSatisfy(
      (error) => accountErrorCode(error) === "SESSION_ENDED",
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "locked",
      address: A,
      signer: null,
      errorCode: null,
    });
    expect(readStoredAddress(storage)).toBe(A);
    expect(getPasskeyPrfOutput).not.toHaveBeenCalled();
    // The next send is refused until the player unlocks.
    await expect(controller.send(request)).rejects.toThrow(/Unlock with your passkey/);
  });

  it("signs out to a cleared state and the same passkey restores the same address", async () => {
    const storage = memoryStorage(storedAs(A));
    passkeyDerives(FIRST);
    const controller = controllerOn(storage);
    await controller.unlock();
    controller.signOut();
    expect(controller.getSnapshot()).toMatchObject({
      status: "signed-out",
      address: null,
      signer: null,
    });
    expect(storage.entries.size).toBe(0);

    const afterRefresh = controllerOn(storage);
    expect(afterRefresh.getSnapshot().status).toBe("signed-out");
    await afterRefresh.signIn();
    expect(afterRefresh.getSnapshot()).toMatchObject({ status: "ready", address: A });
    expect(readStoredAddress(storage)).toBe(A);
  });

  it("signs out from locked too", () => {
    const storage = memoryStorage(storedAs(A));
    const controller = controllerOn(storage);
    controller.signOut();
    expect(controller.getSnapshot().status).toBe("signed-out");
    expect(storage.entries.size).toBe(0);
  });
});
