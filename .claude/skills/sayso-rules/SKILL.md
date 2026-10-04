---
name: sayso-rules
description: Use before starting or committing any SAYSO change - the project's non-negotiable rules and the pre-commit checklist. Also use when a request seems to conflict with fairness, outcome secrecy or testnet-only scope.
---

# SAYSO rules

## Fairness and secrecy

1. **Outcomes are committed before trading.** Both transcript roots go onchain in `createEpisode`. Nothing that changes an outcome may happen after.
2. **Never leak an outcome early.** Chunks reveal at `chunk end + 1.5 s presentation delay + margin`. Manifests, transcripts and flag plans are studio data, never tracked files, never logged in plain text.
3. **Only CRE finalizes.** The operator flags (display) and marks evidence (trigger); it never settles. The owner can only void after 24 h without a report.
4. **The house never trades on hidden knowledge.** Its only informed actions are the quote pull one block before a flag and the 0.98 cash-out bid, both disclosed in the UI.
5. **Players never rest orders.** Immediate-or-cancel only, through SaysoMarkets.

## Scope

6. Testnet (10143) only. TESTNET label wherever a balance, price or payout appears. No fiat, no mainnet deploy.
7. Replay Arena only. No live streams.
8. Mera is the entire account layer. No seed phrase, extension, or server-held key.

## Engineering

9. Chain is truth; Envio and SQLite are read models.
10. Explicit gas on every transaction (measured + 20%); Monad charges the limit.
11. Sequence a sender's transactions by block number, not time.
12. `cast code` every address before it enters code or docs.
13. Label external facts [V] with source, [I], or [U] with the settling spike.
14. One matcher (`packages/core`), one set of ABIs (`packages/core/abi`), one gas table (`packages/core/src/gas.ts`).
15. UI follows PRD section 8; check it rendered at a 412 px viewport and say whether you saw it.

## Pre-commit checklist

- [ ] The change does one thing; 50 to 250 changed lines unless one indivisible file explains itself in the body.
- [ ] Docs that describe the changed behaviour are updated in the same commit.
- [ ] `bun run verify` passes (once it exists); `forge test` passes for contract changes.
- [ ] No `.env`, key, transcript, manifest, flag plan or media staged (`git diff --cached --name-only`).
- [ ] Subject `type(scope): outcome`; body = why + the proof you actually ran.
- [ ] Author is `Febri Nirwana <324392918+febrinirwana@users.noreply.github.com>`; no agent attribution; nothing pushed.
- [ ] A durable lesson? Add it to `docs/LESSONS.md`, newest on top.
