---
name: mera-passkeys
description: Use when touching sign-up, sign-in, signing, session handling, restore, or anything that derives keys from a passkey in apps/web. Covers Mera 0.2.0 usage, PRF failure handling and the stateless test judges run.
---

# Mera passkeys

Mera is the entire account layer: the passkey's PRF output derives the player's key. There is no seed phrase, no extension and no server-held key.

## API (`@category-labs/mera` 0.2.0)

- `createPasskeyWithPrfOutput(...)` on Join; `getPasskeyPrfOutput(...)` on sign-in.
- Derive with `@scure/bip39` + `@scure/bip32` at `m/44'/60'/0'/0/0` (SAYSO uses index 0 only).
- `createSecp256k1SigningSession(...)` then `toViemAccount(session)` from `@category-labs/mera/viem` gives a viem `LocalAccount`.
- Errors: `PRF_UNAVAILABLE`, `PASSKEY_OPERATION_FAILED`, `CRYPTO_UNAVAILABLE`, `SESSION_ENDED`, `INPUT_INVALID`, `DECRYPT_FAILED`, `VAULT_FORMAT_INVALID` (from `dist/errors.d.ts`).

Read the installed package types before writing calls; signatures above are names, not argument lists.

## Rules

1. **Relying-party ID is permanent.** `VITE_RP_ID` is the production domain, chosen before the first real passkey. Localhost passkeys are throwaway.
2. **Never persist secrets.** PRF output, mnemonic, private key and session stay in memory. Nothing goes to `localStorage`, IndexedDB, logs, analytics or the studio.
3. **No server profile.** The nickname comes from the address (`packages/core` `nicknameOf(address)`); positions come from chain and Envio. Restoring needs only the passkey.
4. **`PRF_UNAVAILABLE` is a screen, not a crash.** S1 explains in one sentence and offers a phone or a supported browser.
5. **`SESSION_ENDED` re-prompts** the passkey once, then returns to S1.
6. **Sequence by block.** A new account is low-balance; send its transactions one block apart (reserve-balance rule).

## Stateless test (judges run this)

1. Join on a phone; trade once.
2. Clear site data (or open on a second device with the synced passkey).
3. Sign in with the same passkey.
4. Same address, same nickname, same positions and redeemable amount, with no server call needed for identity.

Automate steps 1 to 4 in Playwright with a virtual authenticator that supports PRF; run the manual phone check on iOS Safari and Android Chrome for spike S5.
