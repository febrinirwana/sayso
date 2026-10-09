import { orderBookAbi, routerAbi, saysoMarketsAbi } from "@sayso/core";
import {
  BaseError,
  custom,
  type Hex,
  http,
  keccak256,
  parseTransaction,
  type Transport,
  toFunctionSelector,
} from "viem";
import { failureCode } from "./operator-log.ts";

// Immutable contract readers are process-cached; chain id and bytecode live five minutes
// and pre-sign/broadcast checks expire chain id first. Mutable state expires in two
// seconds and is invalidated by confirmed writes; balances/allowances never cache. The head
// lives one 400 ms block; a sender gating on a strictly later block may expire it.
const immutable = new Set(
  ["episodeWords", "AUSD", "KURU_ROUTER", "marginAccountAddress", "getMarketParams"].flatMap(
    (name) =>
      [...saysoMarketsAbi, ...routerAbi, ...orderBookAbi]
        .filter((f) => f.type === "function" && f.name === name)
        .map((f) => toFunctionSelector(f as never)),
  ),
);
const mutable = new Set(
  ["episode", "word"].flatMap((name) =>
    saysoMarketsAbi
      .filter((f) => f.type === "function" && f.name === name)
      .map((f) => toFunctionSelector(f as never)),
  ),
);
const timedSelectors: Partial<Record<Hex, true>> = Object.fromEntries(
  [...saysoMarketsAbi, ...orderBookAbi]
    .filter(
      (f) =>
        f.type === "function" &&
        ["flagSaid", "batchCancelOrders", "batchCancelFlipOrders"].includes(f.name),
    )
    .map((f) => [toFunctionSelector(f as never), true]),
);
export type SendTiming = {
  rpcSendStartMs: number;
  rpcSendAckMs: number;
  receiptObservedMs?: number;
  sendMethod: "sync" | "async";
};
const timings = new Map<Hex, SendTiming>();
export function studioSendTiming(hash: Hex): SendTiming | undefined {
  return timings.get(hash);
}
class StudioSyncSendError extends Error {
  constructor(cause: unknown) {
    super("Synchronous transaction submission failed; receipt recovery required", { cause });
  }
}
// viem wraps transport failures. Preserve fail-closed sync semantics through those causes.
export function isStudioSyncSendError(error: unknown): boolean {
  return (
    error instanceof StudioSyncSendError ||
    (error instanceof BaseError &&
      error.walk((cause) => cause instanceof StudioSyncSendError) instanceof StudioSyncSendError)
  );
}
type Entry = { until: number; immutable: boolean; work: Promise<unknown> };
const shared = new Map<
  string,
  {
    transport: Transport;
    counter: { requests: number };
    invalidate(): void;
    expireChainId(): void;
    expireHead(): void;
  }
>();
export function studioRpc(url: string): Transport {
  const existing = shared.get(url);
  if (existing) return existing.transport;
  const upstream = http(url, { retryCount: 0 })({ chain: undefined });
  const syncUpstream = http(url, { retryCount: 0, timeout: 1500 })({ chain: undefined });
  const receipts = new Map<Hex, unknown>();
  // Shared per endpoint across OPERATOR/BOT adapters for the lifetime of this process.
  let syncUnsupported = false;
  const cache = new Map<string, Entry>();
  const counter = { requests: 0 };
  let blockedUntil = 0,
    delay = 0;
  let lastError: unknown;
  let latestHead: { until: number; number: string } | undefined;
  const transport = custom(
    {
      async request({ method, params }) {
        const args = params as readonly unknown[] | undefined;
        if (method === "eth_getTransactionReceipt" && receipts.has(args?.[0] as Hex)) {
          const hash = args?.[0] as Hex;
          const receipt = receipts.get(hash);
          receipts.delete(hash);
          return receipt;
        }
        if (method === "eth_sendRawTransaction") {
          const raw = args?.[0] as Hex;
          if (timedSelectors[parseTransaction(raw).data?.slice(0, 10) as Hex]) {
            const hash = keccak256(raw);
            if (timings.size >= 128) {
              const oldest = timings.keys().next().value;
              if (oldest !== undefined) timings.delete(oldest);
            }
            const timing: SendTiming = {
              rpcSendStartMs: Date.now(),
              rpcSendAckMs: 0,
              sendMethod: syncUnsupported ? "async" : "sync",
            };
            timings.set(hash, timing);
            if (!syncUnsupported) {
              counter.requests++;
              try {
                const receipt = await syncUpstream.request({
                  method: "eth_sendRawTransactionSync",
                  params: [raw, 1000],
                } as never);
                timing.rpcSendAckMs = Date.now();
                if (
                  !receipt ||
                  typeof receipt !== "object" ||
                  !("transactionHash" in receipt) ||
                  receipt.transactionHash !== hash ||
                  !("blockNumber" in receipt) ||
                  typeof receipt.blockNumber !== "string" ||
                  !/^0x[0-9a-f]+$/i.test(receipt.blockNumber) ||
                  !("status" in receipt) ||
                  (receipt.status !== "0x1" && receipt.status !== "0x0") ||
                  !("logs" in receipt) ||
                  !Array.isArray(receipt.logs)
                )
                  throw new Error("Invalid synchronous transaction receipt");
                timing.receiptObservedMs = timing.rpcSendAckMs;
                if (receipts.size >= 128) {
                  const oldest = receipts.keys().next().value;
                  if (oldest !== undefined) receipts.delete(oldest);
                }
                receipts.set(hash, receipt);
                return hash;
              } catch (error) {
                timing.rpcSendAckMs = Date.now();
                // Only explicit unsupported-method codes prove no submission happened.
                // EIP-7966 codes 4/5/6 and transport timeouts are failures, never a resend.
                if (
                  !error ||
                  typeof error !== "object" ||
                  !("code" in error) ||
                  (error.code !== -32601 && error.code !== -32004)
                )
                  throw new StudioSyncSendError(error);
                syncUnsupported = true;
                timing.sendMethod = "async";
              }
            }
            counter.requests++;
            const result = await upstream.request({ method, params } as never);
            timing.rpcSendAckMs = Date.now();
            return result;
          }
        }
        const call = args?.[0] as { data?: string } | undefined;
        const selector = call?.data?.slice(0, 10) as `0x${string}` | undefined;
        const fixed = method === "eth_call" && selector !== undefined && immutable.has(selector);
        const ttl = fixed
          ? Infinity
          : method === "eth_getCode" || method === "eth_chainId"
            ? 300_000
            : (method === "eth_getBlockByNumber" && args?.[0] === "latest") ||
                method === "eth_blockNumber"
              ? 400
              : method === "eth_call" && selector !== undefined && mutable.has(selector)
                ? 2000
                : 0;
        const key = JSON.stringify([method, params]);
        const entry = cache.get(key);
        if (entry && entry.until > Date.now()) return entry.work;
        if (method === "eth_blockNumber" && latestHead && latestHead.until > Date.now())
          return latestHead.number;
        // Writes are never auto-retried, delayed or cached. Unknown outcomes stay in journals.
        const read = method !== "eth_sendRawTransaction" && method !== "eth_sendRawTransactionSync";
        if (read && Date.now() < blockedUntil) throw lastError;
        counter.requests++;
        const work = upstream
          .request({ method, params } as never)
          .then((result) => {
            if (method === "eth_getTransactionReceipt" && result) {
              const timing = timings.get(args?.[0] as Hex);
              if (timing) timing.receiptObservedMs = Date.now();
            }
            if (read) {
              delay = 0;
              blockedUntil = 0;
            }
            if (
              method === "eth_getBlockByNumber" &&
              args?.[0] === "latest" &&
              result &&
              typeof result === "object" &&
              "number" in result &&
              typeof result.number === "string"
            )
              latestHead = { until: Date.now() + 400, number: result.number };
            return result;
          })
          .catch((error) => {
            cache.delete(key);
            if (read && failureCode(error) === "rpc_rate_limited") {
              delay = Math.min(delay ? delay * 2 : 1000, 30_000);
              blockedUntil = Date.now() + delay;
              lastError = error;
            }
            throw error;
          });
        if (ttl) cache.set(key, { until: Date.now() + ttl, immutable: ttl >= 300_000, work });
        return work;
      },
    },
    { retryCount: 0 },
  );
  shared.set(url, {
    transport,
    counter,
    invalidate() {
      for (const [key, entry] of cache)
        if (!entry.immutable && key.startsWith('["eth_call",')) cache.delete(key);
    },
    expireChainId() {
      for (const key of cache.keys()) if (key.startsWith('["eth_chainId",')) cache.delete(key);
    },
    expireHead() {
      latestHead = undefined;
      for (const key of cache.keys())
        if (
          key.startsWith('["eth_blockNumber",') ||
          key.startsWith('["eth_getBlockByNumber",["latest"')
        )
          cache.delete(key);
    },
  });
  return transport;
}
export function invalidateStudioReads(url: string) {
  shared.get(url)?.invalidate();
}
// Call before a chain-id check that gates signing or broadcasting: the endpoint may have moved.
export function expireStudioChainId(url: string) {
  shared.get(url)?.expireChainId();
}
// Call while polling for a sender's successor block: a cached head would add up to 400 ms.
export function expireStudioHead(url: string) {
  shared.get(url)?.expireHead();
}
// Debug counter counts actual upstream JSON-RPC requests, not cache hits.
export function studioRpcRequestCount(url: string) {
  return shared.get(url)?.counter.requests ?? 0;
}
