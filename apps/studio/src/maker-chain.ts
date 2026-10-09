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
  encodeFunctionData,
  erc20Abi,
  type Hex,
  keccak256,
  parseEventLogs,
  type TransactionReceipt,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import type { StudioConfig } from "./config.ts";
import type { HouseOrder, MakerChain, MakerCommand, MakerReceipt } from "./maker.ts";
import {
  expireStudioChainId,
  expireStudioHead,
  isStudioSyncSendError,
  studioRpc,
  studioSendTiming,
  urgentReads,
} from "./rpc.ts";
import { PRESIGN_MS } from "./runner.ts";

function pause(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

export function createMakerChain(config: StudioConfig): MakerChain {
  const key = config.privateKey("bot");
  const markets = config.saysoMarkets;
  if (!key || !markets) throw new Error("BOT configuration missing");
  const account = privateKeyToAccount(key);
  const client = createPublicClient({ chain: monadTestnet, transport: studioRpc(config.rpcUrl) });
  const ausd = addresses.ausd,
    margin = addresses.kuruMarginAccount;
  let pending: Hex | undefined,
    lastBlock = 0n,
    signed: { hash: Hex; nonce: number } | undefined,
    // A lagging node behind the public load balancer must not hand back a used nonce.
    nextNonce = 0,
    dependenciesChecked = false;
  const verified = new Set<string>();
  const scans = new Map<Address, { ids: Set<number>; next: bigint }>();
  // Every call re-reads the chain id (expired first when it gates signing or broadcasting).
  // Bytecode and the immutable dependency identity are recorded once per process, and only
  // after the same parallel round confirmed the chain.
  async function verify(extra: Address[] = [], writing = false) {
    if (writing) expireStudioChainId(config.rpcUrl);
    const unverified = new Map<string, Address>();
    for (const address of [markets!, ausd, margin, addresses.kuruRouter, ...extra])
      if (!verified.has(address.toLowerCase())) unverified.set(address.toLowerCase(), address);
    const [chainId, codes, identity] = await Promise.all([
      client.getChainId(),
      Promise.all([...unverified.values()].map((address) => client.getCode({ address }))),
      dependenciesChecked
        ? undefined
        : Promise.all([
            client.readContract({ address: markets!, abi: saysoMarketsAbi, functionName: "AUSD" }),
            client.readContract({
              address: markets!,
              abi: saysoMarketsAbi,
              functionName: "KURU_ROUTER",
            }),
            client.readContract({
              address: addresses.kuruRouter,
              abi: routerAbi,
              functionName: "marginAccountAddress",
            }),
          ]),
    ]);
    if (chainId !== 10143) throw new Error("BOT RPC must be Monad testnet");
    if (codes.some((code) => !code || code === "0x"))
      throw new Error("BOT dependency bytecode missing");
    for (const address of unverified.keys()) verified.add(address);
    if (identity) {
      const [quote, router, routerMargin] = identity;
      if (
        quote.toLowerCase() !== ausd.toLowerCase() ||
        router.toLowerCase() !== addresses.kuruRouter.toLowerCase() ||
        routerMargin.toLowerCase() !== margin.toLowerCase()
      )
        throw new Error("Unsupported BOT dependencies");
      dependenciesChecked = true;
    }
  }
  function decode(receipt: TransactionReceipt): MakerReceipt {
    if (receipt.blockNumber > lastBlock) lastBlock = receipt.blockNumber;
    if (signed?.hash === receipt.transactionHash) nextNonce = signed.nonce + 1;
    if (pending === receipt.transactionHash) pending = undefined;
    return {
      hash: receipt.transactionHash,
      block: Number(receipt.blockNumber),
      success: receipt.status === "success",
    };
  }
  // The cached head is tried first, then polled fresh: a 400 ms cache can predate a receipt
  // this adapter has already observed.
  async function headAtLeast(block: bigint): Promise<bigint> {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const head = await client.getBlockNumber({ cacheTime: 0 });
      if (head >= block) return head;
      if (Date.now() >= deadline) throw new Error("BOT head block unavailable");
      await pause(100);
      expireStudioHead(config.rpcUrl);
    }
  }
  async function settled(hash: Hex): Promise<MakerReceipt> {
    const deadline = Date.now() + 30_000;
    // Cancel pulls may already have their inclusion receipt from the synchronous RPC.
    if (studioSendTiming(hash)?.receiptObservedMs === undefined) await pause(300);
    for (;;) {
      const mined = await receipt(hash);
      if (mined) return mined;
      if (Date.now() >= deadline) throw new WaitForTransactionReceiptTimeoutError({ hash });
      await pause(100);
    }
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
      throw error;
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
        return !pending && cash >= BigInt(wordCount) * perWord && mon >= 10n ** 18n;
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
      const [, p] = await Promise.all([
        verify([w.yes, w.no, w.market]),
        client.readContract({
          address: w.market,
          abi: orderBookAbi,
          functionName: "getMarketParams",
        }),
      ]);
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
    async allowance(token, spender) {
      return client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account.address, spender],
      });
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
    // Chain is truth: every YES not held by the house (wallet or Kuru margin) or parked in
    // SaysoMarkets or the book can still sell into the cash-out bid. One block-pinned round
    // at or after the pull receipt keeps supply and holdings from different heights apart.
    async outstandingYes(word, minimumBlock) {
      const floor = BigInt(minimumBlock) > lastBlock ? BigInt(minimumBlock) : lastBlock;
      const blockNumber = await headAtLeast(floor);
      const held = (holder: Address) =>
        client.readContract({
          address: word.yes,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [holder],
          blockNumber,
        });
      const [supply, wallet, deposited, custody, book] = await Promise.all([
        client.readContract({
          address: word.yes,
          abi: erc20Abi,
          functionName: "totalSupply",
          blockNumber,
        }),
        held(account.address),
        client.readContract({
          address: margin,
          abi: marginAccountAbi,
          functionName: "getBalance",
          args: [account.address, word.yes],
          blockNumber,
        }),
        held(markets),
        held(word.market),
      ]);
      const outstanding = supply - wallet - deposited - custody - book;
      if (outstanding < 0n) throw new Error("Inconsistent YES supply");
      return outstanding;
    },
    async orders(market, fromBlock) {
      // Snapshot no earlier than this sender's last receipt, e.g. the cancel it just confirmed.
      const [, end] = await Promise.all([verify([market]), headAtLeast(lastBlock)]);
      const scan = scans.get(market) ?? { ids: new Set<number>(), next: BigInt(fromBlock) };
      const ids = scan.ids;
      // Replacement IDs are emitted by FlippedOrderCreated, not the original seed receipt.
      // Bounded RPC ranges avoid providers silently truncating long log requests; the ranges
      // are fetched in one parallel round so a first scan since seeding costs one RTT.
      const ranges: [bigint, bigint][] = [];
      for (let start = scan.next; start <= end; start += 100n)
        ranges.push([start, start + 99n < end ? start + 99n : end]);
      const pages = await Promise.all(
        ranges.map(([fromBlock, toBlock]) =>
          client.getLogs({ address: market, fromBlock, toBlock }),
        ),
      );
      for (const logs of pages)
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
      scan.next = end + 1n;
      scans.set(market, scan);
      const orders: HouseOrder[] = [];
      // Include paired IDs from storage as well; zero-size dormant pairs are not cancelable.
      // Each round reads every known ID at once; newly found partners form the next round.
      const seen = new Set(ids);
      for (let round = [...ids]; round.length; ) {
        const rows = await Promise.all(
          round.map(async (id) => ({
            id,
            o: await client.readContract({
              address: market,
              abi: orderBookAbi,
              functionName: "s_orders",
              args: [id],
              blockNumber: end,
            }),
          })),
        );
        const next: number[] = [];
        for (const { id, o } of rows) {
          if (o[0].toLowerCase() !== account.address.toLowerCase()) continue;
          if (o[4] > 0n) {
            const paired = Number(o[4]);
            ids.add(paired);
            if (!seen.has(paired)) {
              seen.add(paired);
              next.push(paired);
            }
          }
          if (o[1] === 0n) continue;
          if (!Number.isSafeInteger(id) || o[5] === 0)
            throw new Error("Ambiguous house order state");
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
        round = next;
      }
      return { block: Number(end), orders };
    },
    async prepare(command: MakerCommand, guard) {
      if (pending) throw new Error("BOT pending transaction requires recovery");
      const extra = [
        command.token,
        command.market,
        command.spender,
        ...(command.tokens ?? []),
      ].filter((v): v is Address => v !== undefined);
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
      // A timed pull is prepared early; its reads start one block before its send time so the
      // gas estimate (a dry run of the cancel) reflects the book it will meet.
      if (command.notBeforeMs !== undefined)
        await pause(command.notBeforeMs - PRESIGN_MS - Date.now());
      // One parallel round: chain id, successor block, fees, nonce, balance, gas and the
      // caller's window guard. A failed guard wins over read errors; nothing is signed.
      const stopped = (guard?.() ?? Promise.resolve()).then(
        () => undefined,
        (error: unknown) => ({ error }),
      );
      const reads = Promise.all([
        verify(extra, true),
        client.getBlock({ blockTag: "latest" }),
        client.estimateMaxPriorityFeePerGas(),
        client.getTransactionCount({ address: account.address, blockTag: "pending" }),
        client.getBalance({ address: account.address }),
        gas ?? client.estimateGas({ account, to, data, prepare: false }).then(gasWithMargin),
      ]);
      const stop = await stopped;
      if (stop) {
        reads.catch(() => {});
        throw stop.error;
      }
      const [, block, maxPriorityFeePerGas, count, mon, limit] = await reads;
      // The fee block already proves the successor gate in the common case. Poll only
      // if it trails our receipt; do not spend another request for the same head.
      if (lastBlock > 0n && block.number <= lastBlock) await headAtLeast(lastBlock + 1n);
      if (limit <= 0n || limit > 30000000n)
        throw new Error("BOT gas exceeds Monad transaction limit");
      if (block.baseFeePerGas === null) throw new Error("BOT fee market unavailable");
      // viem's estimateFeesPerGas default: base fee x 1.2 plus the RPC's priority fee.
      const maxFeePerGas = (block.baseFeePerGas * 12n) / 10n + maxPriorityFeePerGas;
      if (mon < limit * maxFeePerGas) throw new Error("Insufficient BOT MON");
      // Never sign a timed step before its send time: a pull earlier than t − 400 ms leaks.
      if (command.notBeforeMs !== undefined)
        while (Date.now() < command.notBeforeMs) await pause(command.notBeforeMs - Date.now());
      // Estimation/config reads may have outlived playback; never sign an obsolete timed step.
      if (command.notAfterMs !== undefined && Date.now() >= command.notAfterMs)
        throw new Error("BOT clip window elapsed before signing");
      const nonce = Math.max(count, nextNonce);
      const raw = await account.signTransaction({
        chainId: 10143,
        type: "eip1559",
        to,
        data,
        gas: limit,
        nonce,
        maxFeePerGas,
        maxPriorityFeePerGas,
      });
      const hash = keccak256(raw);
      pending = hash;
      signed = { hash, nonce };
      return { raw, hash };
    },
    receipt,
    async broadcast(transaction) {
      if (keccak256(transaction.raw) !== transaction.hash)
        throw new Error("BOT journal hash mismatch");
      if (pending && pending !== transaction.hash)
        throw new Error("BOT sender has another unresolved hash");
      const fresh = signed?.hash === transaction.hash && pending === transaction.hash;
      pending = transaction.hash;
      // Re-check the endpoint at broadcast as well as during signing.
      await verify([], true);
      if (!fresh) {
        const mined = await receipt(transaction.hash);
        if (mined) return mined;
      }
      try {
        await client.sendRawTransaction({ serializedTransaction: transaction.raw });
      } catch (error) {
        if (isStudioSyncSendError(error)) throw error;
        if (!(await client.getTransaction({ hash: transaction.hash }).catch(() => null)))
          throw error;
      }
      return settled(transaction.hash);
    },
  };
  // A pull's pre-sign reads must not queue behind paced maker reads (VPS episodes 19/20: 1.9-2.4 s).
  const prepare = adapter.prepare.bind(adapter);
  adapter.prepare = (command, guard) => urgentReads(() => prepare(command, guard));
  return adapter;
}
