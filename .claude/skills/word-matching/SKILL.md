---
name: word-matching
description: Use when writing or changing anything that decides whether a word was said - token normalization, the matcher, the two-engine agreement rule, flag planning, or CRE outcome logic. Defines the single rule and its test vectors.
---

# Word matching

One rule decides every SAYSO outcome. The studio's flag plan, the CRE resolver and the tests all import it from `packages/core` (`normalizeToken`, `matchesTarget`, `agreedSpokenTime`). Never re-implement it elsewhere.

## Targets

- A target is one word: lowercase `a-z`, `0-9`, optional internal hyphens, at most 32 bytes UTF-8.
- No multi-word phrases, no numerals as targets (engines disagree on "2" versus "two").

## Normalization (`normalizeToken`)

1. Unicode NFKC.
2. Lowercase.
3. Replace `’` and `‘` with `'`.
4. Strip leading and trailing characters that are not letters or digits.
5. Keep internal `'` and `-`.

## Match (`matchesTarget(target, token)`)

A normalized token matches target `w` when it equals one of: `w`, `w + "s"`, `w + "es"`, `w + "'s"`, `w + "s'"`.
A hyphenated token also matches when any hyphen-separated part matches by the same forms.

Does not count: substrings and longer words (`monadic` for `monad`), homophones, irregular plurals (`cities` for `city`), other inflections (`running` for `run`), misspellings.

## Agreement (`agreedSpokenTime`)

A word is **said** when engine A has a matching token starting at `sA` and engine B has one starting at `sB` with `|sA − sB| <= 1500` ms. The spoken time is `min(sA, sB)` of the earliest agreeing pair. Pair tokens greedily in time order; each token is used once.

If no pair agrees, the word is **not said**, even if one engine heard it. That is the point of two engines.

## Test vectors (must stay green)

| Target | Token (raw) | Match |
|---|---|---|
| monad | `Monad,` | yes |
| monad | `monads` | yes |
| monad | `monad's` | yes |
| monad | `Monad’s` | yes |
| monad | `monads'` | yes |
| monad | `pre-monad` | yes |
| monad | `monadic` | no |
| monad | `nomad` | no |
| monad | `monadbft` | no |
| box | `boxes` | yes |
| class | `CLASSES!` | yes |
| city | `cities` | no |
| run | `running` | no |
| ok | `"OK!"` | yes |

| Engine A starts (ms) | Engine B starts (ms) | Said at |
|---|---|---|
| [71240] | [71900] | 71240 |
| [71240] | [72741] | not said (1501 apart) |
| [10000, 50000] | [50400] | 50000 |
| [] | [30000] | not said |

## Changing the rule

The rule is part of the market's terms. A change needs: a PRD section 5.1 update, new vectors here and in `packages/core` tests, and it applies only to episodes created after the change ships.
