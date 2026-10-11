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

/** S1 Join states map 1:1 onto `JoinScreenProps.state`. */
export type AccountStatus =
  | "signed-out"
  | "creating"
  | "signing-in"
  | "ready"
  | "prf-unavailable"
  | "error";

export type TxRequest = {
  to: Address;
  data: Hex;
  value?: bigint;
  /** Explicit limit from @sayso/core `gasLimit()`, raised to `gasWithMargin(estimate)` for trades. Monad bills the limit. */
  gas: bigint;
};

export type Account = {
  status: AccountStatus;
  /** Present only while `status === "ready"`. Never persisted. */
  address: Address | null;
  nickname: string | null;
  /** In-memory Mera signing session as a viem account; null when signed out. */
  signer: LocalAccount | null;
  errorCode: string | null;
  join(passkeyName: string): Promise<void>;
  signIn(): Promise<void>;
  signOut(): void;
  /**
   * Signs and broadcasts one transaction, waits for its receipt and resolves only once the
   * next transaction from this sender can land in a strictly later block. Rejects on revert.
   */
  send(tx: TxRequest): Promise<Hash>;
};
