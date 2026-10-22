import type { Address, Hash, Hex, LocalAccount } from "viem";

/** Password-manager label only; never saved as an account profile. */
export function defaultPasskeyName(now = new Date()): string {
  const date = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `SAYSO · ${date} ${hour}:${minute}`;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function normalizePasskeyName(name: string, fallback?: string): string {
  const trimmed = name.replace(/\s+/gu, " ").trim();
  if (!trimmed) return fallback ?? defaultPasskeyName();
  let label = "";
  let length = 0;
  for (const { segment } of graphemes.segment(trimmed)) {
    if (length++ === 32) break;
    label += segment;
  }
  return label.trimEnd();
}

/**
 * S1 Join states map 1:1 onto `JoinScreenProps.state`. `locked` is a refreshed page that
 * remembers the public address: read-only views work, signing needs the passkey again.
 */
export type AccountStatus =
  | "signed-out"
  | "creating"
  | "signing-in"
  | "locked"
  | "ready"
  | "prf-unavailable"
  | "error";

/** A passkey that derived a different address than the stored account. */
export type AddressMismatch = { expected: Address; found: Address };

/** What an unlock attempt ended as; the account page uses it to show the restore result. */
export type UnlockResult = "ready" | "mismatch" | "failed";

/** Screens that only read (balances, positions, results) render for both of these. */
export const VIEWABLE_STATUSES: readonly AccountStatus[] = ["ready", "locked"];

export type TxRequest = {
  to: Address;
  data: Hex;
  value?: bigint;
  /** Explicit limit from @sayso/core `gasLimit()`, raised to `gasWithMargin(estimate)` for trades. Monad bills the limit. */
  gas: bigint;
};

export type Account = {
  status: AccountStatus;
  /** Present while `status` is `ready` or `locked`. A locked address is the stored public one. */
  address: Address | null;
  nickname: string | null;
  /** In-memory Mera signing session as a viem account; present only while `status === "ready"`. Never persisted. */
  signer: LocalAccount | null;
  errorCode: string | null;
  /** A passkey prompt started by `unlock` is open. */
  unlocking: boolean;
  /** Set while locked after an unlock with a passkey of another account; nothing has switched. */
  mismatch: AddressMismatch | null;
  join(passkeyName: string): Promise<void>;
  signIn(): Promise<void>;
  /** Player-tapped passkey check for the stored account. Never call it on page load. */
  unlock(): Promise<UnlockResult>;
  /** Explicit "Use this account" after a mismatch: switches to the passkey's address. */
  switchToFound(): void;
  /** Drops a mismatch and stays locked on the stored account. */
  dismissMismatch(): void;
  /** Clears the stored address and the in-memory session. */
  signOut(): void;
  /**
   * Signs and broadcasts one transaction, waits for its receipt and resolves only once the
   * next transaction from this sender can land in a strictly later block. Rejects on revert,
   * and with `SESSION_ENDED` while locked.
   */
  send(tx: TxRequest): Promise<Hash>;
};
