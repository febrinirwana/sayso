---
name: cre-resolver
description: Use when building, testing, simulating or deploying the SAYSO CRE resolver workflow, the studio's CRE runner, or the receiver side of SaysoMarkets. Read with chainlink-cre-skill, which owns generic CRE practice.
---

# CRE resolver

The resolver is the only path that settles a word. If it is removed, nothing settles; that is the requirement the Chainlink bounty checks.

## Shape

`cre/resolver` (TypeScript SDK 1.23.0, CLI 1.36.0). One workflow, two handlers:

| Index | Trigger | Does |
|---|---|---|
| 0 | EVM log `EvidenceReady(uint32 episodeId, uint256[] wordIds)` on SaysoMarkets | YES path for flagged words |
| 1 | EVM log `EpisodeClosed(uint32 episodeId)` on SaysoMarkets | NO path (and late YES) for every unresolved word |

Each handler:
1. EVM read: `episode(episodeId)` for `rootA`, `rootB`, `clipId`; `word(wordId)` for text, state, chunk indices.
2. HTTP GET the revealed chunks for both engines from the studio reveal API (`/v1/episodes/:id/chunks/:engine/:index`; handler 1 fetches the full set).
3. Verify every chunk: recompute the leaf (`packages/core` `leafHash`) and its Merkle proof against the onchain root. Any mismatch aborts the run with no report.
4. Run `agreedSpokenTime` (see `word-matching`) per word on the verified tokens.
5. Report `abi.encode(uint32 episodeId, uint256[] wordIds, uint8[] outcomes, bytes32 evidenceHash)`; outcome 2 = Yes, 3 = No; `evidenceHash = keccak256(concat(verified leaves))`.

Handler 0 reports only words it can prove YES; a flagged word that fails agreement is left for handler 1 (it becomes NO there unless the full transcript proves YES).

## Modes

| Mode | How it runs | Forwarder in SaysoMarkets |
|---|---|---|
| `simulation` (until deploy access) | Studio runner per trigger tx: `cre workflow simulate cre/resolver --target <target> --non-interactive --trigger-index <0|1> --evm-tx-hash <tx> --evm-event-index <i> --broadcast` | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` (MockKeystoneForwarder) |
| `don` | Deployed and activated workflow; log triggers fire by themselves | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` (KeystoneForwarder) plus `setExpectedWorkflowId` |

Simulation flags are from `chainlink-cre-skill/references/simulation.md` [V]. Simulation uses single-node consensus; say so wherever a simulated settlement is shown. Every run is a `cre_runs` row with its mode, trigger tx, report tx and latency.

Day one: `cre login`, `cre account access` (request deploy access), `cre workflow supported-chains --output json` to confirm `monad-testnet` for our tenant. Whether `--broadcast` needs a linked key or Early Access for our tenant is [U: S4]; check before planning around it.

## Receiver rules (SaysoMarkets)

- Inherit `ReceiverTemplate`; implement `_processReport`.
- Metadata is 64 bytes from the production forwarder. Never require 62.
- Reject: wrong episode for a word, word already final, No before close, Yes before `startsAt`.
- Never trust the report for anything but outcomes; it moves no funds directly.

## Tests

- Unit: handlers against recorded chunk fixtures from `clips/fixtures/` (agree, disagree, tampered leaf, missing chunk).
- Simulation without `--broadcast` first, then with it against a testnet deployment.
- Foundry: report decoding and every rejection rule in `_processReport`.
