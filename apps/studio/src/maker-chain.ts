import {
  addresses,
  gasLimit,
  gasWithMargin,
  marginAccountAbi,
  ONE,
  orderBookAbi,
  priceToKuru,
  quoteCost,
  routerAbi,
  saysoMarketsAbi,
  sizeToKuru,
} from "@sayso/core";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  http,
  keccak256,
  parseEventLogs,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import type { StudioConfig } from "./config.ts";
import type { HouseOrder, MakerChain, MakerCommand, MakerReceipt } from "./maker.ts";

export function createMakerChain(
  config: StudioConfig,
  options: { minimumMon?: bigint } = {},
): MakerChain {
  const key = config.privateKey("bot");
  const markets = config.saysoMarkets;
  if (!key || !markets) throw new Error("BOT configuration missing");
  const account = privateKeyToAccount(key);
  const client = createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl) });
  const wallet = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(config.rpcUrl),
  });
  const ausd = addresses.ausd,
    margin = addresses.kuruMarginAccount;
  let pending: Hex | undefined,
    lastBlock = 0n;
  async function verify(extra: Address[] = []) {
    if ((await client.getChainId()) !== 10143) throw new Error("BOT RPC must be Monad testnet");
    for (const address of new Set([markets!, ausd, margin, addresses.kuruRouter, ...extra])) {
      const code = await client.getCode({ address });
      if (!code || code === "0x") throw new Error("BOT dependency bytecode missing");
    }
    const [quote, router, routerMargin] = await Promise.all([
      client.readContract({ address: markets!, abi: saysoMarketsAbi, functionName: "AUSD" }),
      client.readContract({ address: markets!, abi: saysoMarketsAbi, functionName: "KURU_ROUTER" }),
      client.readContract({
        address: addresses.kuruRouter,
        abi: routerAbi,
        functionName: "marginAccountAddress",
      }),
    ]);
    if (
      quote.toLowerCase() !== ausd.toLowerCase() ||
      router.toLowerCase() !== addresses.kuruRouter.toLowerCase() ||
      routerMargin.toLowerCase() !== margin.toLowerCase()
    )
      throw new Error("Unsupported BOT dependencies");
  }
  function decode(receipt: TransactionReceipt): MakerReceipt {
    if (receipt.blockNumber > lastBlock) lastBlock = receipt.blockNumber;
    if (pending === receipt.transactionHash) pending = undefined;
    return {
      hash: receipt.transactionHash,
      block: Number(receipt.blockNumber),
      success: receipt.status === "success",
    };
  }
  async function receipt(hash: Hex): Promise<MakerReceipt | null> {
    try {
      return decode(await client.getTransactionReceipt({ hash }));
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "TransactionReceiptNotFoundError"
      )
        return null;
      throw new Error("BOT receipt unavailable");
    }
  }
  const adapter: MakerChain = {
    house: account.address,
    ausd,
    margin,
    markets,
    async ready(wordCount) {
      try {
        await verify();
        const [cash, mon] = await Promise.all([
          adapter.balance(ausd),
          client.getBalance({ address: account.address }),
        ]);
        const perWord =
          20n * ONE +
          quoteCost(10n * ONE, priceToKuru("0.49")) +
          quoteCost(10n * ONE, priceToKuru("0.48"));
        return (
          !pending &&
          cash >= BigInt(wordCount) * perWord &&
          mon >= (options.minimumMon ?? 10n ** 18n)
        );
      } catch {
        return false;
      }
    },
    async words(id) {
      return (
        await client.readContract({
          address: markets,
          abi: saysoMarketsAbi,
          functionName: "episodeWords",
          args: [id],
        })
      ).map((id) => {
        const value = Number(id);
        if (!Number.isSafeInteger(value)) throw new Error("BOT word id out of range");
        return value;
      });
    },
    async word(id) {
      const w = await client.readContract({
        address: markets,
        abi: saysoMarketsAbi,
        functionName: "word",
        args: [BigInt(id)],
      });
      await verify([w.yes, w.no, w.market]);
      const p = await client.readContract({
        address: w.market,
        abi: orderBookAbi,
        functionName: "getMarketParams",
      });
      if (
        p[0] !== 10000 ||
        p[1] !== ONE ||
        p[2].toLowerCase() !== w.yes.toLowerCase() ||
        p[3] !== 6n ||
        p[4].toLowerCase() !== ausd.toLowerCase() ||
        p[5] !== 6n ||
        p[6] !== 100 ||
        p[7] !== ONE ||
        p[8] !== 10000000000n ||
        p[9] !== 0n ||
        p[10] !== 0n
      )
        throw new Error("Unsupported Kuru market parameters");
      return { id, yes: w.yes, no: w.no, market: w.market, state: w.state };
    },
    async clock(id) {
      const [episode, block] = await Promise.all([
        client.readContract({
          address: markets,
          abi: saysoMarketsAbi,
          functionName: "episode",
          args: [id],
        }),
        client.getBlock({ blockTag: "latest" }),
      ]);
      return {
        block: Number(block.number),
        timestamp: Number(block.timestamp),
        closed: episode.closed,
        endsAt: Number(episode.endsAt),
      };
    },
    async balance(token, inMargin = false) {
      return inMargin
        ? client.readContract({
            address: margin,
            abi: marginAccountAbi,
            functionName: "getBalance",
            args: [account.address, token],
          })
        : client.readContract({
            address: token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account.address],
          });
    },
    async orders(market, fromBlock) {
      await verify([market]);
      const end = await client.getBlockNumber();
      const ids = new Set<number>();
      // Replacement IDs are emitted by FlippedOrderCreated, not the original seed receipt.
      // Bounded RPC ranges avoid providers silently truncating long log requests.
      for (let start = BigInt(fromBlock); start <= end; start += 100n) {
        const to = start + 99n < end ? start + 99n : end;
        const logs = await client.getLogs({ address: market, fromBlock: start, toBlock: to });
        for (const log of parseEventLogs({ abi: orderBookAbi, logs, strict: true })) {
          if (
            log.eventName === "OrderCreated" ||
            log.eventName === "FlipOrderCreated" ||
            log.eventName === "FlippedOrderCreated"
          ) {
            if (log.args.owner.toLowerCase() !== account.address.toLowerCase()) continue;
            ids.add(Number(log.args.orderId));
            if (log.eventName !== "OrderCreated" && log.args.flippedId > 0n)
              ids.add(Number(log.args.flippedId));
          }
        }
      }
      const orders: HouseOrder[] = [];
      // Include paired IDs from storage as well; zero-size dormant pairs are not cancelable.
      for (const id of ids) {
        const o = await client.readContract({
          address: market,
          abi: orderBookAbi,
          functionName: "s_orders",
          args: [id],
          blockNumber: end,
        });
        if (o[0].toLowerCase() !== account.address.toLowerCase()) continue;
        if (o[4] > 0n) ids.add(Number(o[4]));
        if (o[1] === 0n) continue;
        if (!Number.isSafeInteger(id) || o[5] === 0) throw new Error("Ambiguous house order state");
        orders.push({
          market,
          id,
          size: o[1],
          price: o[5],
          buy: o[7],
          flip: o[6] !== 0,
          ...(o[4] > 0n ? { pairedId: Number(o[4]) } : {}),
        });
      }
      return { block: Number(end), orders };
    },
    async prepare(command: MakerCommand) {
      if (pending) throw new Error("BOT pending transaction requires recovery");
      const extra = [
        command.token,
        command.market,
        command.spender,
        ...(command.tokens ?? []),
      ].filter((v): v is Address => v !== undefined);
      await verify(extra);
      // Receipt/block gating, never a sleep-based nonce policy. Unknown outcomes retain pending.
      if (lastBlock > 0n && (await client.getBlockNumber({ cacheTime: 0 })) <= lastBlock) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            unwatch();
            reject(new Error("BOT successor block unavailable"));
          }, 30_000);
          const unwatch = client.watchBlockNumber({
            poll: true,
            pollingInterval: 100,
            emitOnBegin: true,
            onBlockNumber(block) {
              if (block <= lastBlock) return;
              clearTimeout(timeout);
              unwatch();
              resolve();
            },
            onError() {
              clearTimeout(timeout);
              unwatch();
              reject(new Error("BOT successor block unavailable"));
            },
          });
        });
      }
      let to: Address = markets,
        data: Hex,
        gas: bigint | undefined;
      const amount = BigInt(command.amount ?? "0");
      switch (command.kind) {
        case "approve":
          to = command.token!;
          data = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [command.spender!, amount],
          });
          break;
        case "mint":
          data = encodeFunctionData({
            abi: saysoMarketsAbi,
            functionName: "mintSet",
            args: [BigInt(command.wordId!), amount, account.address],
          });
          gas = gasLimit("mintSet");
          break;
        case "deposit":
          to = margin;
          data = encodeFunctionData({
            abi: marginAccountAbi,
            functionName: "deposit",
            args: [account.address, command.token!, amount],
          });
          break;
        case "ladder":
          to = command.market!;
          data = encodeFunctionData({
            abi: orderBookAbi,
            functionName: "batchProvisionLiquidity",
            args: [
              ["0.49", "0.48", "0.51", "0.52"].map(priceToKuru),
              ["0.50", "0.49", "0.50", "0.51"].map(priceToKuru),
              Array<bigint>(4).fill(sizeToKuru(10n * ONE)),
              [true, true, false, false],
              true,
            ],
          });
          break;
        case "cancel":
          to = command.market!;
          data = encodeFunctionData({
            abi: orderBookAbi,
            functionName: command.flip ? "batchCancelFlipOrders" : "batchCancelOrders",
            args: [command.ids!],
          });
          break;
        case "bid":
          to = command.market!;
          data = encodeFunctionData({
            abi: orderBookAbi,
            functionName: "addBuyOrder",
            args: [priceToKuru("0.98"), sizeToKuru(amount), true],
          });
          break;
        case "withdraw":
          to = margin;
          data = encodeFunctionData({
            abi: marginAccountAbi,
            functionName: "batchWithdrawMaxTokens",
            args: [command.tokens!],
          });
          break;
        case "redeem":
          // Fixed contract API selects YES first on Void; maker drains all YES before NO.
          data = encodeFunctionData({
            abi: saysoMarketsAbi,
            functionName: "redeem",
            args: [BigInt(command.wordId!), amount],
          });
          gas = gasLimit("redeem");
          break;
      }
      gas ??= gasWithMargin(await client.estimateGas({ account, to, data }));
      if (gas <= 0n || gas > 30000000n) throw new Error("BOT gas exceeds Monad transaction limit");
      const request = await wallet.prepareTransactionRequest({
        account,
        to,
        data,
        gas,
        nonce: await client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      });
      if (
        (await client.getBalance({ address: account.address })) <
        gas * (request.maxFeePerGas ?? request.gasPrice ?? 0n)
      )
        throw new Error("Insufficient BOT MON");
      // Estimation/config reads may have outlived playback; never sign an obsolete timed step.
      if (command.notAfterMs !== undefined && Date.now() >= command.notAfterMs)
        throw new Error("BOT clip window elapsed before signing");
      const raw = await wallet.signTransaction(request);
      const hash = keccak256(raw);
      pending = hash;
      return { raw, hash };
    },
    receipt,
    async broadcast(transaction) {
      if (keccak256(transaction.raw) !== transaction.hash)
        throw new Error("BOT journal hash mismatch");
      const mined = await receipt(transaction.hash);
      if (mined) return mined;
      if (pending && pending !== transaction.hash)
        throw new Error("BOT sender has another unresolved hash");
      pending = transaction.hash;
      await verify();
      try {
        await client.sendRawTransaction({ serializedTransaction: transaction.raw });
      } catch {
        if (!(await client.getTransaction({ hash: transaction.hash }).catch(() => null)))
          throw new Error("BOT broadcast outcome unavailable");
      }
      try {
        return decode(
          await client.waitForTransactionReceipt({ hash: transaction.hash, pollingInterval: 100 }),
        );
      } catch {
        throw new Error("BOT receipt outcome unavailable");
      }
    },
  };
  return adapter;
}
