import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Address, Hash } from "viem";
import { config } from "@/lib/config";

export type EpisodeState = "Scheduled" | "Live" | "Closed" | "Settled";
export type ClockSample = { sentMs: number; receivedMs: number; serverMs: number };
export function selectOffset(samples: readonly ClockSample[]) {
  if (
    !samples.length ||
    samples.some(
      (sample) =>
        !Object.values(sample).every(Number.isFinite) || sample.receivedMs < sample.sentMs,
    )
  )
    throw new Error("Invalid clock samples");
  const best = samples.reduce((a, b) =>
    b.receivedMs - b.sentMs < a.receivedMs - a.sentMs ? b : a,
  );
  return {
    offsetMs: best.serverMs - (best.sentMs + best.receivedMs) / 2,
    rttMs: best.receivedMs - best.sentMs,
  };
}
export class StudioError extends Error {
  constructor(
    readonly code: "offline" | "invalid-response" | "http",
    readonly httpStatus?: number,
  ) {
    super(`Studio ${code}`);
    this.name = "StudioError";
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new StudioError("invalid-response");
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new StudioError("invalid-response");
  return value;
}
function state(value: unknown): EpisodeState {
  if (value !== "Scheduled" && value !== "Live" && value !== "Closed" && value !== "Settled")
    throw new StudioError("invalid-response");
  return value;
}
async function studioFetch(path: string, init?: RequestInit) {
  try {
    return await fetch(`${config.studioUrl}${path}`, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    });
  } catch {
    throw new StudioError("offline");
  }
}
export async function estimateOffset() {
  const samples: ClockSample[] = [];
  for (let ping = 0; ping < 5; ping++) {
    const sentMs = Date.now();
    const response = await studioFetch("/v1/time", { cache: "no-store" });
    if (!response.ok) throw new StudioError("http", response.status);
    const body = object(await response.json());
    const receivedMs = Date.now();
    samples.push({ sentMs, receivedMs, serverMs: integer(body.serverMs) });
  }
  return selectOffset(samples);
}
export function useStudioClock() {
  const query = useQuery({
    queryKey: ["studio", "clock"],
    queryFn: estimateOffset,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const offset = query.isError ? undefined : query.data?.offsetMs;
  // Unsynchronised time is explicitly unavailable; callers must not imply an accurate countdown.
  const now = useCallback(() => (offset === undefined ? null : Date.now() + offset), [offset]);
  return { ...query, now };
}
export type ScheduleEvent = {
  episodeId: number;
  startsAtMs: number;
  endsAtMs: number;
  state: EpisodeState;
  words: { wordId?: number; text: string }[];
};
export type StateEvent = { episodeId: number; state: EpisodeState };
export type FlagEvent = { wordId: number; t: number; scheduledMs: number; txHash: Hash | null };
export type EpisodeEvents = { schedule: ScheduleEvent; state: StateEvent; flag: FlagEvent };
export function parseEpisodeEvent<K extends keyof EpisodeEvents>(
  event: K,
  data: string,
): EpisodeEvents[K] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(data);
  } catch {
    throw new StudioError("invalid-response");
  }
  const row = object(decoded);
  let result: ScheduleEvent | StateEvent | FlagEvent;
  if (event === "flag") {
    if (
      row.txHash !== null &&
      (typeof row.txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(row.txHash))
    )
      throw new StudioError("invalid-response");
    result = {
      wordId: integer(row.wordId, 1),
      t: integer(row.t),
      scheduledMs: integer(row.scheduledMs),
      txHash: row.txHash as Hash | null,
    };
  } else if (event === "state") {
    result = { episodeId: integer(row.episodeId, 1), state: state(row.state) };
  } else {
    const startsAtMs = integer(row.startsAtMs),
      endsAtMs = integer(row.endsAtMs);
    if (endsAtMs <= startsAtMs || !Array.isArray(row.words) || !row.words.length)
      throw new StudioError("invalid-response");
    result = {
      episodeId: integer(row.episodeId, 1),
      startsAtMs,
      endsAtMs,
      state: state(row.state),
      words: row.words.map((value) => {
        const word = object(value);
        if (typeof word.text !== "string" || !word.text.length)
          throw new StudioError("invalid-response");
        return word.wordId === undefined
          ? { text: word.text }
          : { text: word.text, wordId: integer(word.wordId, 1) };
      }),
    };
  }
  return result as EpisodeEvents[K];
}
export type EpisodeHandlers = { [K in keyof EpisodeEvents]?: (event: EpisodeEvents[K]) => void } & {
  connection?: (status: "connected" | "reconnecting") => void;
  error?: (error: StudioError) => void;
};
export function subscribeEpisode(id: number, handlers: EpisodeHandlers): () => void {
  const source = new EventSource(`${config.studioUrl}/v1/episodes/${id}/stream`);
  source.onopen = () => handlers.connection?.("connected");
  // EventSource automatically reconnects, receiving a fresh schedule and replay of due flags.
  source.onerror = () => handlers.connection?.("reconnecting");
  function listen<K extends keyof EpisodeEvents>(
    event: K,
    handler: ((payload: EpisodeEvents[K]) => void) | undefined,
  ) {
    source.addEventListener(event, (message) => {
      try {
        handler?.(parseEpisodeEvent(event, (message as MessageEvent<string>).data));
      } catch {
        handlers.error?.(new StudioError("invalid-response"));
      }
    });
  }
  listen("schedule", handlers.schedule);
  listen("state", handlers.state);
  listen("flag", handlers.flag);
  return () => source.close();
}
export type DripLeg = {
  status: "pending" | "signed" | "confirmed" | "reverted";
  hash: Hash | null;
  block: number | null;
};
export type DripStatus = {
  address: Address;
  network: "TESTNET";
  chainId: 10143;
  amounts: { monWei: string; ausd: string };
  status: "pending" | "completed";
  mon: DripLeg;
  ausd: DripLeg;
};
export type DripResult =
  | { status: "pending" | "completed"; drip: DripStatus }
  | { status: "unclaimed" | "already-claimed" | "rate-limited" | "invalid-address" }
  | { status: "unavailable"; reason?: string };
function dripLeg(value: unknown): DripLeg {
  const row = object(value);
  if (
    !["pending", "signed", "confirmed", "reverted"].includes(String(row.status)) ||
    (row.hash !== null && (typeof row.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(row.hash)))
  )
    throw new StudioError("invalid-response");
  return {
    status: row.status as DripLeg["status"],
    hash: row.hash as Hash | null,
    block: row.block === null ? null : integer(row.block),
  };
}
export function mapDripResponse(status: number, body: unknown): DripResult {
  if (status === 404) return { status: "unclaimed" };
  if (status === 409) return { status: "already-claimed" };
  if (status === 429) return { status: "rate-limited" };
  if (status === 400) return { status: "invalid-address" };
  if (status === 503)
    return body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? { status: "unavailable", reason: body.error }
      : { status: "unavailable" };
  if (status !== 200 && status !== 201) throw new StudioError("http", status);
  const row = object(body),
    amounts = object(row.amounts);
  if (
    row.network !== "TESTNET" ||
    row.chainId !== 10143 ||
    typeof row.address !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(row.address) ||
    (row.status !== "pending" && row.status !== "completed") ||
    typeof amounts.monWei !== "string" ||
    !/^\d+$/.test(amounts.monWei) ||
    typeof amounts.ausd !== "string" ||
    !/^\d+$/.test(amounts.ausd)
  )
    throw new StudioError("invalid-response");
  const mon = dripLeg(row.mon),
    ausd = dripLeg(row.ausd);
  if (row.status === "completed" && (mon.status !== "confirmed" || ausd.status !== "confirmed"))
    throw new StudioError("invalid-response");
  const drip: DripStatus = {
    address: row.address as Address,
    network: "TESTNET",
    chainId: 10143,
    status: row.status,
    amounts: { monWei: amounts.monWei, ausd: amounts.ausd },
    mon,
    ausd,
  };
  return { status: drip.status, drip };
}
export async function getDripStatus(address: Address) {
  const response = await studioFetch(`/v1/drips/${address}`);
  return mapDripResponse(response.status, await response.json().catch(() => null));
}
export async function claimDrip(address: Address) {
  const response = await studioFetch("/v1/drips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return mapDripResponse(response.status, await response.json().catch(() => null));
}
export type EpisodeRequestResult =
  | { status: "created"; episodeId: number }
  | { status: "busy" | "rate-limited" | "unavailable" };
export function mapEpisodeResponse(status: number, body: unknown): EpisodeRequestResult {
  if (status === 409) return { status: "busy" };
  if (status === 429) return { status: "rate-limited" };
  if (status === 503) return { status: "unavailable" };
  if (status !== 201) throw new StudioError("http", status);
  return { status: "created", episodeId: integer(object(body).episodeId, 1) };
}
export async function requestEpisode() {
  const response = await studioFetch("/v1/episodes", { method: "POST" });
  return mapEpisodeResponse(response.status, await response.json().catch(() => null));
}
export type StudioHealth = {
  status: "ok" | "degraded";
  chain: { headNumber: string; headTimestampMs: number; lagMs: number } | null;
  keyBalances: { role: string; address: Address; monWei: string }[];
  lastCreRun: {
    id: number;
    episode_id: number;
    trigger: string;
    trigger_tx: string;
    mode: "simulation" | "don";
    status: string;
    report_tx: string | null;
    started_ms: number;
    finished_ms: number | null;
  } | null;
};
export async function getHealth(): Promise<StudioHealth> {
  const response = await studioFetch("/v1/health");
  if (!response.ok) throw new StudioError("http", response.status);
  const row = object(await response.json());
  if (row.status !== "ok" && row.status !== "degraded") throw new StudioError("invalid-response");
  return row as StudioHealth;
}
export const mediaUrl = (clipId: string) => `${config.studioUrl}/media/${clipId}.mp4`;
