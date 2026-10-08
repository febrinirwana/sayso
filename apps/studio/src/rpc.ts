import { orderBookAbi, routerAbi, saysoMarketsAbi } from "@sayso/core";
import { custom, http, type Transport, toFunctionSelector } from "viem";
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
        const read = method !== "eth_sendRawTransaction";
        if (read && Date.now() < blockedUntil) throw lastError;
        counter.requests++;
        const work = upstream
          .request({ method, params } as never)
          .then((result) => {
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
