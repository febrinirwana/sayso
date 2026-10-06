import { addresses, CHAIN_ID, gasWithMargin, outcomeTokenAbi } from "@sayso/core";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  parseTransaction,
  type TransactionReceipt,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import type { StudioConfig } from "./config.ts";
import { DRIP_AUSD, DRIP_MON_WEI, type DripChain, DripError, type DripReceipt } from "./drip.ts";

function mined(receipt: TransactionReceipt): DripReceipt {
  const block = Number(receipt.blockNumber);
  if (!Number.isSafeInteger(block)) throw new DripError("unavailable", 503);
  return { hash: receipt.transactionHash, block, success: receipt.status === "success" };
}
// This wallet is exclusively the DRIP role; never reuse OPERATOR/BOT nonce streams.
export function createDripChain(config: StudioConfig): DripChain {
  const key = config.privateKey("drip");
  if (!key) throw new Error("Drip chain configuration missing");
  const account = privateKeyToAccount(key);
  const client = createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl) });
  const wallet = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(config.rpcUrl),
  });
  const token: Address = addresses.ausd;
  async function verified() {
    if ((await client.getChainId()) !== CHAIN_ID) throw new DripError("unavailable", 503);
    const code = await client.getCode({ address: token });
    if (!code || code === "0x") throw new DripError("unavailable", 503);
  }
  const transfer = (address: Address) =>
    encodeFunctionData({
      abi: outcomeTokenAbi,
      functionName: "transfer",
      args: [address, DRIP_AUSD],
    });
  return {
    async inspect(address, signed) {
      await verified();
      const recipientCode = await client.getCode({ address });
      const nativeGas =
        recipientCode && recipientCode !== "0x"
          ? gasWithMargin(await client.estimateGas({ account, to: address, value: DRIP_MON_WEI }))
          : 21000n;
      const [mon, ausd, fee, estimated] = await Promise.all([
        client.getBalance({ address: account.address, blockTag: "latest" }),
        client.readContract({
          address: token,
          abi: outcomeTokenAbi,
          functionName: "balanceOf",
          args: [account.address],
        }),
        client.estimateFeesPerGas(),
        // Estimate the exact actual transfer, including its recipient storage cost.
        client.estimateGas({ account, to: token, data: transfer(address) }).catch(() => null),
      ]);
      if (ausd < DRIP_AUSD) throw new DripError("low_balance", 503);
      if (estimated === null) throw new DripError("unavailable", 503);
      let monGas = nativeGas,
        ausdGas = gasWithMargin(estimated),
        maxFeePerGas = fee.maxFeePerGas;
      for (const leg of ["mon", "ausd"] as const) {
        const prepared = signed[leg];
        if (!prepared) continue;
        if (keccak256(prepared.raw) !== prepared.hash) throw new DripError("unavailable", 503);
        const transaction = parseTransaction(prepared.raw);
        if (transaction.chainId !== CHAIN_ID || !transaction.gas || !transaction.maxFeePerGas)
          throw new DripError("unavailable", 503);
        if (leg === "mon") monGas = transaction.gas;
        else ausdGas = transaction.gas;
        if (transaction.maxFeePerGas > maxFeePerGas) maxFeePerGas = transaction.maxFeePerGas;
      }
      return {
        mon,
        ausd,
        monGas,
        ausdGas,
        maxFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas,
      };
    },
    async prepare(address, leg, budget, afterBlock) {
      await verified();
      // Sequence by observed chain block, not elapsed wall clock. Persisted receipts
      // supply this boundary after a service restart as well as between both legs.
      if (
        afterBlock >= 0 &&
        (await client.getBlockNumber({ cacheTime: 0 })) <= BigInt(afterBlock)
      ) {
        const gate = Promise.withResolvers<void>();
        const timer = setTimeout(() => gate.reject(new DripError("unavailable", 503)), 30_000);
        const stop = client.watchBlockNumber({
          pollingInterval: 100,
          onBlockNumber(block) {
            if (block > BigInt(afterBlock)) gate.resolve();
          },
          onError(error) {
            gate.reject(error);
          },
        });
        try {
          await gate.promise;
        } finally {
          clearTimeout(timer);
          stop();
        }
      }
      const request = await wallet.prepareTransactionRequest({
        account,
        type: "eip1559",
        to: leg === "mon" ? address : token,
        value: leg === "mon" ? DRIP_MON_WEI : 0n,
        data: leg === "mon" ? "0x" : transfer(address),
        gas: leg === "mon" ? budget.monGas : budget.ausdGas,
        maxFeePerGas: budget.maxFeePerGas,
        maxPriorityFeePerGas: budget.maxPriorityFeePerGas,
        nonce: await client.getTransactionCount({ address: account.address, blockTag: "pending" }),
      });
      const raw = await wallet.signTransaction(request);
      return { raw, hash: keccak256(raw) };
    },
    async receipt(hash) {
      await verified();
      try {
        return mined(await client.getTransactionReceipt({ hash }));
      } catch (error) {
        if (error instanceof Error && error.name === "TransactionReceiptNotFoundError") return null;
        throw error;
      }
    },
    async broadcast(transaction) {
      await verified();
      if (
        keccak256(transaction.raw) !== transaction.hash ||
        parseTransaction(transaction.raw).chainId !== CHAIN_ID
      )
        throw new DripError("unavailable", 503);
      const existing = await this.receipt(transaction.hash);
      if (existing) return existing;
      try {
        await client.sendRawTransaction({ serializedTransaction: transaction.raw });
      } catch (error) {
        // A timeout/already-known response does not authorize replacement signing.
        const receipt = await this.receipt(transaction.hash);
        if (receipt) return receipt;
        if (!(await client.getTransaction({ hash: transaction.hash }).catch(() => null)))
          throw error;
      }
      return mined(
        await client.waitForTransactionReceipt({
          hash: transaction.hash,
          pollingInterval: 100,
          timeout: 30_000,
        }),
      );
    },
  };
}
