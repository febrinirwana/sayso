import type { Hash } from "viem";
import type { TxRequest } from "./types";

export type Send = (tx: TxRequest) => Promise<Hash>;
type SendClient = {
  broadcast(tx: TxRequest): Promise<Hash>;
  waitForTransactionReceipt(request: { hash: Hash }): Promise<{
    blockNumber: bigint;
    status: "success" | "reverted";
  }>;
  getBlockNumber(): Promise<bigint>;
};

/** One queue for every send, including failed receipts; no gas estimation. */
export function createSendQueue(client: SendClient): Send {
  let queue: Promise<unknown> = Promise.resolve();
  return (tx: TxRequest): Promise<Hash> => {
    const result = queue.then(async () => {
      if (typeof tx.gas !== "bigint" || tx.gas <= 0n) throw new Error("EXPLICIT_GAS_REQUIRED");
      const hash = await client.broadcast(tx);
      const receipt = await client.waitForTransactionReceipt({ hash });
      while ((await client.getBlockNumber()) <= receipt.blockNumber) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
      if (receipt.status === "reverted") throw new Error("TRANSACTION_REVERTED");
      return hash;
    });
    queue = result.catch(() => undefined);
    return result;
  };
}
