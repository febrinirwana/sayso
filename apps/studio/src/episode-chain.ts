import { saysoMarketsAbi } from "@sayso/core";
import {
  createPublicClient,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseEventLogs,
  stringToHex,
  type TransactionReceipt,
  WaitForTransactionReceiptTimeoutError,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import type { KeyRole, StudioConfig } from "./config.ts";
import { expireStudioChainId, expireStudioHead, invalidateStudioReads, studioRpc } from "./rpc.ts";
import {
  type Command,
  type EpisodeChain,
  PRESIGN_MS,
  type Prepared,
  type Receipt,
} from "./runner.ts";

function pause(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

function decodeReceipt(receipt: TransactionReceipt): Receipt {
  const logs = parseEventLogs({ abi: saysoMarketsAbi, logs: receipt.logs, strict: true });
  const created = logs.find((log) => log.eventName === "EpisodeCreated");
  const words = logs
    .filter((log) => log.eventName === "WordAdded")
    .map((log) => {
      const id = Number(log.args.wordId);
      if (!Number.isSafeInteger(id)) throw new Error("Word id exceeds studio integer range");
      return id;
    });
  return {
    hash: receipt.transactionHash,
    block: Number(receipt.blockNumber),
    success: receipt.status === "success",
    created: created ? { id: created.args.episodeId, words } : undefined,
  };
}

// Construct one writer per role: keys never share a nonce stream. A prepared transaction
// holds the sender gate until its receipt; signed bytes are persisted by the caller first.
export function createEpisodeChain(config: StudioConfig, role: KeyRole = "operator"): EpisodeChain {
  const privateKey = config.privateKey(role);
  const address = config.saysoMarkets;
  if (!privateKey || !address) throw new Error("Episode chain configuration missing");
  const account = privateKeyToAccount(privateKey);
  const client = createPublicClient({ chain: monadTestnet, transport: studioRpc(config.rpcUrl) });
  let tail = Promise.resolve();
  let unresolved: Hex | undefined;
  let signed: { hash: Hex; nonce: number } | undefined;
  // A lagging node behind the public load balancer must not hand back a used nonce.
  let nextNonce = 0;
  let lastBlock = 0n;
  function recordReceipt(receipt: TransactionReceipt): Receipt {
    if (receipt.blockNumber > lastBlock) lastBlock = receipt.blockNumber;
    if (signed?.hash === receipt.transactionHash) nextNonce = signed.nonce + 1;
    invalidateStudioReads(config.rpcUrl);
    if (unresolved === receipt.transactionHash) unresolved = undefined;
    return decodeReceipt(receipt);
  }
  async function find(hash: Hex): Promise<Receipt | null> {
    try {
      return recordReceipt(await client.getTransactionReceipt({ hash }));
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
  // The cached head is tried first, then polled fresh: a 400 ms cache can predate a receipt
  // this adapter has already observed.
  async function headAtLeast(block: bigint): Promise<bigint> {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const head = await client.getBlockNumber({ cacheTime: 0 });
      if (head >= block) return head;
      if (Date.now() >= deadline) throw new Error("Operator block unavailable");
      await pause(100);
      expireStudioHead(config.rpcUrl);
    }
  }
  async function settled(hash: Hex): Promise<Receipt> {
    const deadline = Date.now() + 30_000;
    // Inclusion needs a later 400 ms block; polling sooner only spends request budget.
    await pause(300);
    for (;;) {
      const mined = await find(hash);
      if (mined) return mined;
      if (Date.now() >= deadline) throw new WaitForTransactionReceiptTimeoutError({ hash });
      await pause(100);
    }
  }
  const releaseByHash = new Map<Hex, () => void>();
  return {
    async prepare(command: Command) {
      const previous = tail;
      const gate = Promise.withResolvers<void>();
      tail = gate.promise;
      await previous;
      try {
        if (unresolved) throw new Error("Operator transaction requires recovery");
        let data: Hex;
        switch (command.kind) {
          case "createEpisode": {
            const [clipId, rootA, rootB, startsAt, endsAt, words] = command.args as [
              Hex,
              Hex,
              Hex,
              bigint,
              bigint,
              string[],
            ];
            data = encodeFunctionData({
              abi: saysoMarketsAbi,
              functionName: "createEpisode",
              args: [
                clipId,
                rootA,
                rootB,
                startsAt,
                endsAt,
                words.map((word) => stringToHex(word, { size: 32 })),
              ],
            });
            break;
          }
          case "listEpisode":
            data = encodeFunctionData({
              abi: saysoMarketsAbi,
              functionName: "listEpisode",
              args: [command.args[0] as number],
            });
            break;
          case "flagSaid":
            data = encodeFunctionData({
              abi: saysoMarketsAbi,
              functionName: "flagSaid",
              args: command.args as [bigint, number, number, number],
            });
            break;
          case "markEvidence":
            data = encodeFunctionData({
              abi: saysoMarketsAbi,
              functionName: "markEvidence",
              args: command.args as [number, bigint[]],
            });
            break;
          case "closeEpisode":
            data = encodeFunctionData({
              abi: saysoMarketsAbi,
              functionName: "closeEpisode",
              args: [command.args[0] as number],
            });
            break;
          default:
            throw new Error("Unsupported operator action");
        }
        // A timed flag is prepared early: its reads start one block before its spoken time.
        if (command.notBeforeMs !== undefined)
          await pause(command.notBeforeMs - PRESIGN_MS - Date.now());
        // One parallel round: chain id, bytecode, successor block, fees and nonce. Sign only
        // once the head is past the previous OPERATOR receipt's block, never on a timer.
        expireStudioChainId(config.rpcUrl);
        const [chainId, code, block, maxPriorityFeePerGas, count] = await Promise.all([
          client.getChainId(),
          client.getCode({ address }),
          client.getBlock({ blockTag: "latest" }),
          client.estimateMaxPriorityFeePerGas(),
          client.getTransactionCount({ address: account.address, blockTag: "pending" }),
        ]);
        if (chainId !== 10143) throw new Error("RPC is not Monad testnet");
        if (!code || code === "0x") throw new Error("Missing SaysoMarkets bytecode");
        if (block.baseFeePerGas === null) throw new Error("Operator fee market unavailable");
        // Reuse the fee block for the successor gate; only a lagging head needs a poll.
        if (lastBlock > 0n && block.number <= lastBlock) await headAtLeast(lastBlock + 1n);
        // viem's estimateFeesPerGas default: base fee x 1.2 plus the RPC's priority fee.
        const maxFeePerGas = (block.baseFeePerGas * 12n) / 10n + maxPriorityFeePerGas;
        const nonce = Math.max(count, nextNonce);
        // Never sign a timed command early: a flag before its spoken time leaks the outcome.
        if (command.notBeforeMs !== undefined)
          while (Date.now() < command.notBeforeMs) await pause(command.notBeforeMs - Date.now());
        if (command.notAfterMs !== undefined && Date.now() >= command.notAfterMs)
          throw new Error("Operator clip window elapsed before signing");
        const raw = await account.signTransaction({
          chainId: 10143,
          type: "eip1559",
          to: address,
          data,
          gas: command.gas,
          nonce,
          maxFeePerGas,
          maxPriorityFeePerGas,
        });
        const hash = keccak256(raw);
        unresolved = hash;
        signed = { hash, nonce };
        releaseByHash.set(hash, gate.resolve);
        return { hash, raw };
      } catch (error) {
        gate.resolve();
        throw error;
      }
    },
    async broadcast(transaction: Prepared) {
      try {
        if (unresolved && unresolved !== transaction.hash)
          throw new Error("Operator sender has an unresolved transaction");
        if (keccak256(transaction.raw) !== transaction.hash)
          throw new Error("Operator journal hash mismatch");
        unresolved = transaction.hash;
        // The endpoint may have changed since signing, even for bytes never sent.
        expireStudioChainId(config.rpcUrl);
        if ((await client.getChainId()) !== 10143) throw new Error("RPC is not Monad testnet");
        // Recovery alone needs a receipt pre-check; freshly signed bytes cannot be mined.
        if (!releaseByHash.has(transaction.hash)) {
          const mined = await find(transaction.hash);
          if (mined) return mined;
        }
        await client
          .sendRawTransaction({ serializedTransaction: transaction.raw })
          .catch(async (error) => {
            if (!(await client.getTransaction({ hash: transaction.hash }).catch(() => null)))
              throw error;
          });
        return await settled(transaction.hash);
      } finally {
        releaseByHash.get(transaction.hash)?.();
        releaseByHash.delete(transaction.hash);
      }
    },
    receipt: find,
    async episode(id) {
      const [episode, block] = await Promise.all([
        client.readContract({ address, abi: saysoMarketsAbi, functionName: "episode", args: [id] }),
        client.getBlock({ blockTag: "latest" }),
      ]);
      return {
        listed: episode.listed,
        closed: episode.closed,
        resolvedCount: episode.resolvedCount,
        wordCount: episode.wordCount,
        startsAt: Number(episode.startsAt),
        endsAt: Number(episode.endsAt),
        timestamp: Number(block.timestamp),
      };
    },
    async words(id) {
      return (
        await client.readContract({
          address,
          abi: saysoMarketsAbi,
          functionName: "episodeWords",
          args: [id],
        })
      ).map((word) => {
        const value = Number(word);
        if (!Number.isSafeInteger(value)) throw new Error("Word id exceeds studio integer range");
        return value;
      });
    },
    async word(id) {
      const word = await client.readContract({
        address,
        abi: saysoMarketsAbi,
        functionName: "word",
        args: [BigInt(id)],
      });
      return { state: word.state };
    },
  };
}
