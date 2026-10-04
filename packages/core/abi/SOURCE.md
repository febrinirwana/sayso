# Vendored ABIs

## Kuru (`kuru.ts`)

| Field | Value |
|---|---|
| Package | `@kuru-labs/kuru-sdk` |
| Version | 0.0.95 |
| npm integrity | `sha512-96GOBpmOgEXNluHtBi8gVMNOCnjkhqIqS6+9AWXq+79Ys3jz1Hb9pgw4W6EmVE8Jh08fqF38tVy3nkk0X9dbwg==` |
| Files | `package/abi/OrderBook.json`, `Router.json`, `MarginAccount.json` (the `abi` array only) |
| Vendored | 2026-10-05 |

Regenerate:

```sh
npm pack @kuru-labs/kuru-sdk@0.0.95   # in a temp folder outside the repo
tar xzf kuru-labs-kuru-sdk-0.0.95.tgz
bun packages/core/scripts/vendor-kuru-abi.ts <temp>/package
```

The SDK is never a dependency: it pulls in ethers v5 and SAYSO uses viem only. ERC-20 calls use viem's built-in `erc20Abi`, so the SDK's `IERC20.json` is not vendored.

Event topics derived from this ABI (`cast keccak` of the signature) match `docs/technical/INTEGRATIONS.md` section 2:
- `Trade(uint40,address,bool,uint256,uint96,address,address,uint96)` = `0xf16924fb…f21581`
- `FlipOrdersCanceled(uint40[],address)` = `0x5f815e52…de96c`
