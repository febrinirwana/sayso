import { saysoMarketsAbi } from "@sayso/core";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  type Hex,
  keccak256,
  parseEventLogs,
  stringToHex,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import type { KeyRole, StudioConfig } from "./config.ts";
import { expireStudioChainId, invalidateStudioReads, studioRpc } from "./rpc.ts";
import type { Command, EpisodeChain, Prepared, Receipt } from "./runner.ts";

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
  const wallet = createWalletClient({
    account,
    chain: monadTestnet,
    transport: studioRpc(config.rpcUrl),
  });
  let tail = Promise.resolve();
  let unresolved: Hex | undefined;
  let lastBlock = 0n;
  function recordReceipt(receipt: TransactionReceipt): Receipt {
    if (receipt.blockNumber > lastBlock) lastBlock = receipt.blockNumber;
    invalidateStudioReads(config.rpcUrl);
    if (unresolved === receipt.transactionHash) unresolved = undefined;
    return decodeReceipt(receipt);
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
        expireStudioChainId(config.rpcUrl);
        if ((await client.getChainId()) !== 10143) throw new Error("RPC is not Monad testnet");
        if (!(await client.getCode({ address }))) throw new Error("Missing SaysoMarkets bytecode");
        if (lastBlock > 0n && (await client.getBlockNumber({ cacheTime: 0 })) <= lastBlock) {
          const advanced = Promise.withResolvers<void>();
          const stop = client.watchBlockNumber({
            pollingInterval: 400,
            onBlockNumber(block) {
              if (block > lastBlock) advanced.resolve();
            },
            onError(error) {
              advanced.reject(error);
            },
          });
          const deadline = setTimeout(
            () => advanced.reject(new Error("Operator block unavailable")),
            30_000,
          );
          try {
            await advanced.promise;
          } finally {
            clearTimeout(deadline);
            stop();
          }
        }
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
        const request = await wallet.prepareTransactionRequest({
          account,
          to: address,
          data,
          gas: command.gas,
          chainId: 10143,
          ...(await client.estimateFeesPerGas()),
          nonce: await client.getTransactionCount({
            address: account.address,
            blockTag: "pending",
          }),
        });
        const raw = await wallet.signTransaction(request);
        const hash = keccak256(raw);
        unresolved = hash;
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
        // A restart can find a mined receipt or re-send the same signed bytes (same nonce/hash).
        const mined = await client
          .getTransactionReceipt({ hash: transaction.hash })
          .catch(() => null);
        if (mined) return recordReceipt(mined);
        await client
          .sendRawTransaction({ serializedTransaction: transaction.raw })
          .catch(async (error) => {
            if (!(await client.getTransaction({ hash: transaction.hash }).catch(() => null)))
              throw error;
          });
        return recordReceipt(
          await client.waitForTransactionReceipt({
            hash: transaction.hash,
            pollingInterval: 400,
            checkReplacement: false,
            timeout: 30_000,
          }),
        );
      } finally {
        releaseByHash.get(transaction.hash)?.();
        releaseByHash.delete(transaction.hash);
      }
    },
    async receipt(hash) {
      return client
        .getTransactionReceipt({ hash })
        .then(recordReceipt)
        .catch((error: { name?: string }) => {
          if (error.name === "TransactionReceiptNotFoundError") return null;
          throw error;
        });
    },
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
