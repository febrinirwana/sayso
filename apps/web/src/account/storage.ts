import { type Address, getAddress, isAddress } from "viem";

/**
 * The only thing SAYSO keeps about a player between visits: the public address, so a refresh
 * shows the same account (locked) instead of a signed-out page. Never PRF output, keys, seeds or
 * session objects: those stay in memory and are re-derived by the passkey (CLAUDE.md rule 5).
 */
export const ACCOUNT_STORAGE_KEY = "sayso.account";
const VERSION = 1;

export type AccountStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** `null` when the browser has no usable storage (private mode, blocked, tests). */
export function browserStorage(): AccountStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readStoredAddress(storage: AccountStorage | null): Address | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { v, address } = value as { v?: unknown; address?: unknown };
    if (v !== VERSION || typeof address !== "string") return null;
    return isAddress(address, { strict: false }) ? getAddress(address) : null;
  } catch {
    return null;
  }
}

export function writeStoredAddress(storage: AccountStorage | null, address: Address): void {
  try {
    storage?.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify({ v: VERSION, address }));
  } catch {
    // Storage full or blocked: the player just signs in again after a refresh.
  }
}

export function clearStoredAddress(storage: AccountStorage | null): void {
  try {
    storage?.removeItem(ACCOUNT_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
