# Chainlink CRE receiver source

Source: [Building Consumer Contracts](https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts), sections 2.1 (`IReceiver`) and 3.2 (`ReceiverTemplate`).

Fetched on 2026-10-05 through the page's Markdown alternate:
https://docs.chain.link/cre/guides/workflow/using-evm-client/onchain-write/building-consumer-contracts.md

Both files preserve their source snippets, including comments and formatting, with only these changes in each file:

1. `pragma solidity ^0.8.0;` becomes `pragma solidity 0.8.37;` to pin the project compiler.
2. `import {IERC165} from "./IERC165.sol";` becomes `import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";` to use the installed OpenZeppelin remapping.

The `Ownable` import already uses the project remapping and is unchanged. The local `IReceiver` import is unchanged. No logic, metadata checks, ownership rules, events, or comments were edited.

SHA-256 of each original snippet (UTF-8, including one terminal newline, excluding Markdown fences):

| File | Original SHA-256 |
|---|---|
| `IReceiver.sol` | `dae0906d7de2e634f14d3b6794194d5bae38803e76e8029710611c7348c5a5e0` |
| `ReceiverTemplate.sol` | `cebb2e698a20ca6ba41e8bff1777a537df0715c923d9e263f2b5b3f8fe06677d` |

License: MIT, as stated in both source snippets.

## Known upstream behavior

The template owner may call `setForwarderAddress(address(0))`, which emits a security warning and disables the template's sender check. The vendored source preserves this behavior. SAYSO must enforce a non-zero configured forwarder and matching `msg.sender` again in `SaysoMarkets._processReport`, so disabling the template check cannot open settlement to arbitrary callers.
