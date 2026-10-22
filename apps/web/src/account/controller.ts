import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
  MeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { type Address, createWalletClient, http, isAddressEqual, type LocalAccount } from "viem";
import { monadTestnet, publicClient } from "@/lib/chain";
import { config } from "@/lib/config";
import { sessionFromPrf } from "./derive";
import { createSendQueue, InsufficientMonBalanceError, type Send } from "./sendQueue";
import {
  type AccountStorage,
  browserStorage,
  clearStoredAddress,
  readStoredAddress,
  writeStoredAddress,
} from "./storage";
import {
  type AccountStatus,
  type AddressMismatch,
  normalizePasskeyName,
  type UnlockResult,
} from "./types";

export type Identity = { session: Secp256k1SigningSession; signer: LocalAccount };

export type AccountSnapshot = {
  status: AccountStatus;
  address: Address | null;
  signer: LocalAccount | null;
  errorCode: string | null;
  unlocking: boolean;
  mismatch: AddressMismatch | null;
};

export function accountErrorCode(error: unknown): string {
  if (isMeraError(error)) return error.code;
  if (error instanceof Error && error.cause) return accountErrorCode(error.cause);
  return "PASSKEY_OPERATION_FAILED";
}

export async function restoreIdentity(): Promise<Identity> {
  const { prfOutput } = await getPasskeyPrfOutput({ rpId: config.rpId });
  return sessionFromPrf(prfOutput);
}

export type AccountController = {
  getSnapshot(): AccountSnapshot;
  subscribe(listener: () => void): () => void;
  join(passkeyName: string): Promise<void>;
  signIn(): Promise<void>;
  unlock(): Promise<UnlockResult>;
  switchToFound(): void;
  dismissMismatch(): void;
  signOut(): void;
  /** Ends the in-memory session without touching storage (the provider unmounted). */
  dispose(): void;
  send: Send;
};

/**
 * The account state machine, outside React so every transition is testable. Holds the Mera
 * session in memory only; the one thing it persists is the public address (see `storage.ts`).
 * `locked` = an address is stored but no session exists yet.
 */
export function createAccountController(
  options: { storage?: AccountStorage | null } = {},
): AccountController {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  let stored = readStoredAddress(storage);
  let identity: Identity | null = null;
  /** A passkey of another account, held in memory until the player picks Use this account. */
  let pending: Identity | null = null;
  let status: AccountStatus = stored ? "locked" : "signed-out";
  let errorCode: string | null = null;
  let unlocking = false;
  let mismatch: AddressMismatch | null = null;
  let generation = 0;
  let authenticating = false;
  const listeners = new Set<() => void>();

  function build(): AccountSnapshot {
    return {
      status,
      address: identity ? identity.signer.address : status === "locked" ? stored : null,
      signer: status === "ready" && identity ? identity.signer : null,
      errorCode,
      unlocking,
      mismatch,
    };
  }
  let snapshot = build();
  function commit() {
    snapshot = build();
    for (const listener of listeners) listener();
  }

  function clearIdentity() {
    identity?.session.end();
    identity = null;
  }
  function clearPending() {
    pending?.session.end();
    pending = null;
    mismatch = null;
  }

  /** Signed in: remember the public address only, never the session. */
  function install(next: Identity) {
    clearIdentity();
    clearPending();
    identity = next;
    stored = next.signer.address;
    writeStoredAddress(storage, stored);
    errorCode = null;
    unlocking = false;
    status = "ready";
    commit();
  }

  async function authenticate(join: boolean, passkeyName = "") {
    if (authenticating) return;
    authenticating = true;
    const version = ++generation;
    clearIdentity();
    clearPending();
    errorCode = null;
    unlocking = false;
    status = join ? "creating" : "signing-in";
    commit();
    try {
      let next: Identity;
      if (join) {
        const name = normalizePasskeyName(passkeyName);
        const result = await createPasskeyWithPrfOutput({
          rp: { id: config.rpId, name: "SAYSO" },
          user: { name, displayName: name },
        });
        try {
          next = sessionFromPrf(result.prfOutput);
        } finally {
          result.prfOutput.fill(0);
          result.prfSalt.fill(0);
        }
      } else {
        next = await restoreIdentity();
      }
      if (generation !== version) next.session.end();
      else if (!join && stored && !isAddressEqual(next.signer.address, stored)) {
        // Never switch silently, here either: a passkey of another account waits for a choice.
        pending = next;
        mismatch = { expected: stored, found: next.signer.address };
        errorCode = null;
        status = "locked";
        commit();
      } else install(next);
    } catch (error) {
      if (generation !== version) return;
      errorCode = accountErrorCode(error);
      status =
        errorCode === "PRF_UNAVAILABLE"
          ? "prf-unavailable"
          : errorCode === "SESSION_ENDED"
            ? stored
              ? "locked"
              : "signed-out"
            : "error";
      commit();
    } finally {
      authenticating = false;
    }
  }

  async function unlock(): Promise<UnlockResult> {
    if (status !== "locked" || !stored || authenticating) return "failed";
    authenticating = true;
    const version = ++generation;
    const expected = stored;
    clearPending();
    errorCode = null;
    unlocking = true;
    commit();
    try {
      const next = await restoreIdentity();
      if (generation !== version) {
        next.session.end();
        return "failed";
      }
      if (isAddressEqual(next.signer.address, expected)) {
        install(next);
        return "ready";
      }
      // Never switch silently: hold the session in memory until the player confirms.
      pending = next;
      mismatch = { expected, found: next.signer.address };
      unlocking = false;
      commit();
      return "mismatch";
    } catch (error) {
      if (generation === version) {
        errorCode = accountErrorCode(error);
        unlocking = false;
        commit();
      }
      return "failed";
    } finally {
      authenticating = false;
    }
  }

  function switchToFound() {
    if (!pending) return;
    const next = pending;
    pending = null;
    install(next);
  }

  function dismissMismatch() {
    if (!mismatch) return;
    clearPending();
    commit();
  }

  function signOut() {
    generation++;
    clearIdentity();
    clearPending();
    stored = null;
    clearStoredAddress(storage);
    errorCode = null;
    unlocking = false;
    status = "signed-out";
    commit();
  }

  function dispose() {
    generation++;
    clearIdentity();
    clearPending();
  }

  const send: Send = createSendQueue({
    broadcast: async (tx) => {
      const active = identity;
      if (!active)
        throw new MeraError(
          "SESSION_ENDED",
          stored
            ? "Unlock with your passkey first. Nothing was sent."
            : "Sign in to send a transaction",
        );
      const version = generation;
      const broadcast = async (account: LocalAccount) => {
        const wallet = createWalletClient({
          account,
          chain: monadTestnet,
          transport: http(config.rpcUrl),
        });
        const request = await wallet.prepareTransactionRequest({ ...tx, chain: monadTestnet });
        const feePerGas = request.maxFeePerGas ?? request.gasPrice;
        if (feePerGas === undefined)
          throw new Error("TESTNET network fees are unavailable. Nothing was sent.");
        const balance = await publicClient.getBalance({
          address: account.address,
          blockTag: "pending",
        });
        if (balance < request.gas * feePerGas + (request.value ?? 0n))
          throw new InsufficientMonBalanceError();
        return wallet.sendTransaction(request);
      };
      try {
        return await broadcast(active.signer);
      } catch (error) {
        if (accountErrorCode(error) !== "SESSION_ENDED") throw error;
        // The session ended under a send: lock now. The player unlocks with a tap; nothing
        // re-prompts or retries on its own.
        if (version === generation) {
          generation++;
          clearIdentity();
          errorCode = null;
          status = stored ? "locked" : "signed-out";
          commit();
        }
        throw error;
      }
    },
    waitForTransactionReceipt: (request) => publicClient.waitForTransactionReceipt(request),
    getBlockNumber: () => publicClient.getBlockNumber({ cacheTime: 0 }),
  });

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    join: (passkeyName: string) => authenticate(true, passkeyName),
    signIn: () => authenticate(false),
    unlock,
    switchToFound,
    dismissMismatch,
    signOut,
    dispose,
    send,
  };
}
