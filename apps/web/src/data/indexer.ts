import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { config } from "@/lib/config";
import type { EpisodeState } from "./studio";

export class IndexerError extends Error {
  constructor(readonly code: "offline" | "http" | "graphql" | "invalid-response") {
    super(`Indexer ${code}`);
    this.name = "IndexerError";
  }
}
export type EpisodeRow = {
  id: string;
  clipId: string;
  rootA: string;
  rootB: string;
  startsAt: string;
  endsAt: string;
  state: string;
  wordCount: number;
  resolvedCount: number;
  closedAt: string | null;
  settledAt: string | null;
};
export type IndexedEpisode = Omit<
  EpisodeRow,
  "id" | "startsAt" | "endsAt" | "closedAt" | "settledAt" | "state"
> & {
  id: number;
  startsAt: bigint;
  endsAt: bigint;
  closedAt: bigint | null;
  settledAt: bigint | null;
  state: EpisodeState;
};
export type WordRow = {
  id: string;
  episode_id: string;
  text: string;
  yes: string;
  no: string;
  market: string | null;
  state: string;
  offsetMs: number | null;
  flaggedAt: string | null;
  outcome: number | null;
  evidenceHash: string | null;
  resolvedAt: string | null;
  resolveTx: string | null;
};
export type IndexedWord = Omit<WordRow, "id" | "episode_id" | "flaggedAt" | "resolvedAt"> & {
  id: bigint;
  episodeId: number;
  flaggedAt: bigint | null;
  resolvedAt: bigint | null;
};
export type EpisodeWithWords = IndexedEpisode & { words: IndexedWord[] };
type WordWithEpisodeRow = WordRow & { episode: EpisodeRow };
type PositionRow = {
  id: string;
  player_id: string;
  word: WordWithEpisodeRow;
  yes: string;
  no: string;
  cashIn: string;
  cashOut: string;
  redeemed: string;
};
type TradeRow = {
  id: string;
  player_id: string;
  word: WordWithEpisodeRow;
  side: number;
  tokenAmount: string;
  ausdAmount: string;
  priceBps: number;
  timestamp: string;
  block: string;
};
type PlayerRow = {
  id: string;
  trades: number;
  volume: string;
  cashIn: string;
  cashOut: string;
  settledValue: string;
  profit: string;
  episodesPlayed: number;
  firstSeen: string;
};
type EpisodePlayerRow = { id: string; profit: string; trades: number; rank: number };
const nullableBigInt = (value: string | null) => (value == null ? null : BigInt(value));
export function mapEpisode(row: EpisodeRow): IndexedEpisode {
  return {
    ...row,
    id: Number(row.id),
    startsAt: BigInt(row.startsAt),
    endsAt: BigInt(row.endsAt),
    closedAt: nullableBigInt(row.closedAt),
    settledAt: nullableBigInt(row.settledAt),
    state: row.state as EpisodeState,
  };
}
export function mapWord({ episode_id, ...row }: WordRow): IndexedWord {
  return {
    ...row,
    id: BigInt(row.id),
    episodeId: Number(episode_id),
    flaggedAt: nullableBigInt(row.flaggedAt),
    resolvedAt: nullableBigInt(row.resolvedAt),
  };
}
function mapWordWithEpisode(row: WordWithEpisodeRow) {
  return { ...mapWord(row), episode: mapEpisode(row.episode) };
}
export function mapPosition(row: PositionRow) {
  return {
    id: row.id,
    address: row.player_id as Address,
    word: mapWordWithEpisode(row.word),
    yes: BigInt(row.yes),
    no: BigInt(row.no),
    cashIn: BigInt(row.cashIn),
    cashOut: BigInt(row.cashOut),
    redeemed: BigInt(row.redeemed),
  };
}
export function mapTrade(row: TradeRow) {
  return {
    ...row,
    word: mapWordWithEpisode(row.word),
    address: row.player_id as Address,
    tokenAmount: BigInt(row.tokenAmount),
    ausdAmount: BigInt(row.ausdAmount),
    timestamp: BigInt(row.timestamp),
    block: BigInt(row.block),
  };
}
export function mapPlayer(row: PlayerRow) {
  return {
    ...row,
    address: row.id as Address,
    volume: BigInt(row.volume),
    cashIn: BigInt(row.cashIn),
    cashOut: BigInt(row.cashOut),
    settledValue: BigInt(row.settledValue),
    profit: BigInt(row.profit),
    firstSeen: BigInt(row.firstSeen),
  };
}
export function mapEpisodePlayer(row: EpisodePlayerRow) {
  // This entity has no episode/player relation fields; handlers write `${episodeId}-${address}`.
  const separator = row.id.indexOf("-");
  if (separator < 1) throw new IndexerError("invalid-response");
  return {
    ...row,
    episodeId: Number(row.id.slice(0, separator)),
    address: row.id.slice(separator + 1) as Address,
    profit: BigInt(row.profit),
  };
}
export type IndexedPosition = {
  id: string;
  address: Address;
  word: IndexedWord & { episode: IndexedEpisode };
  yes: bigint;
  no: bigint;
  cashIn: bigint;
  cashOut: bigint;
  redeemed: bigint;
};
export type IndexedTrade = Omit<
  TradeRow,
  "word" | "tokenAmount" | "ausdAmount" | "timestamp" | "block"
> & {
  address: Address;
  word: IndexedWord & { episode: IndexedEpisode };
  tokenAmount: bigint;
  ausdAmount: bigint;
  timestamp: bigint;
  block: bigint;
};
export type IndexedPlayer = Omit<
  PlayerRow,
  "volume" | "cashIn" | "cashOut" | "settledValue" | "profit" | "firstSeen"
> & {
  address: Address;
  volume: bigint;
  cashIn: bigint;
  cashOut: bigint;
  settledValue: bigint;
  profit: bigint;
  firstSeen: bigint;
};
export type IndexedEpisodePlayer = Omit<EpisodePlayerRow, "profit"> & {
  episodeId: number;
  address: Address;
  profit: bigint;
};

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(config.indexerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: signal ?? AbortSignal.timeout(10_000),
    });
  } catch {
    throw new IndexerError("offline");
  }
  if (!response.ok) throw new IndexerError("http");
  let body: { data?: T; errors?: unknown[] };
  try {
    body = await response.json();
  } catch {
    throw new IndexerError("invalid-response");
  }
  if (body.errors?.length) throw new IndexerError("graphql");
  if (!body.data) throw new IndexerError("invalid-response");
  return body.data;
}
// Hasura preserves schema field casing and exposes linked fields as object relationships.
// Episode has no @derivedFrom words field: obtain words with a second, batched query.
const EPISODE =
  "id clipId rootA rootB startsAt endsAt state wordCount resolvedCount closedAt settledAt";
const WORD =
  "id episode_id text yes no market state offsetMs flaggedAt outcome evidenceHash resolvedAt resolveTx";
const RELATED_WORD = `${WORD} episode { ${EPISODE} }`;
async function attachWords(rows: EpisodeRow[], signal?: AbortSignal): Promise<EpisodeWithWords[]> {
  if (!rows.length) return [];
  const data = await graphql<{ Word: WordRow[] }>(
    `query Words($ids: [String!]!) { Word(where: {episode_id: {_in: $ids}}, order_by: {id: asc}) { ${WORD} } }`,
    { ids: rows.map((row) => row.id) },
    signal,
  );
  const words = data.Word.map(mapWord).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows.map((row) => ({
    ...mapEpisode(row),
    words: words.filter((word) => word.episodeId === Number(row.id)),
  }));
}
export async function getRecentEpisodes(limit = 6, signal?: AbortSignal) {
  const data = await graphql<{ Episode: EpisodeRow[] }>(
    `query Recent($limit: Int!) { Episode(order_by: {startsAt: desc}, limit: $limit) { ${EPISODE} } }`,
    { limit },
    signal,
  );
  return attachWords(data.Episode, signal);
}
export async function getEpisode(id: number, signal?: AbortSignal) {
  const data = await graphql<{ Episode: EpisodeRow[] }>(
    `query EpisodeById($id: String!) { Episode(where: {id: {_eq: $id}}, limit: 1) { ${EPISODE} } }`,
    { id: String(id) },
    signal,
  );
  return (await attachWords(data.Episode, signal))[0] ?? null;
}
export async function getPlayerPositions(address: Address, signal?: AbortSignal) {
  const data = await graphql<{ Position: PositionRow[] }>(
    `query Positions($address: String!) { Position(where: {player_id: {_eq: $address}}) { id player_id yes no cashIn cashOut redeemed word { ${RELATED_WORD} } } }`,
    { address: address.toLowerCase() },
    signal,
  );
  return data.Position.map(mapPosition);
}
export async function getPlayerTrades(address: Address, limit = 50, signal?: AbortSignal) {
  const data = await graphql<{ Trade: TradeRow[] }>(
    `query Trades($address: String!, $limit: Int!) { Trade(where: {player_id: {_eq: $address}}, order_by: [{timestamp: desc}, {id: desc}], limit: $limit) { id player_id side tokenAmount ausdAmount priceBps timestamp block word { ${RELATED_WORD} } } }`,
    { address: address.toLowerCase(), limit },
    signal,
  );
  return data.Trade.map(mapTrade);
}
export async function getLeaderboard(limit = 50, signal?: AbortSignal) {
  const data = await graphql<{ Player: PlayerRow[] }>(
    "query Leaders($limit: Int!) { Player(order_by: [{profit: desc}, {id: asc}], limit: $limit) { id trades volume cashIn cashOut settledValue profit episodesPlayed firstSeen } }",
    { limit },
    signal,
  );
  return data.Player.map(mapPlayer);
}
export async function getEpisodeLeaderboard(id: number, limit = 50, signal?: AbortSignal) {
  const data = await graphql<{ EpisodePlayer: EpisodePlayerRow[] }>(
    "query EpisodeLeaders($prefix: String!, $limit: Int!) { EpisodePlayer(where: {id: {_like: $prefix}}, order_by: [{profit: desc}, {id: asc}], limit: $limit) { id profit trades rank } }",
    { prefix: `${id}-%`, limit },
    signal,
  );
  return data.EpisodePlayer.map(mapEpisodePlayer);
}
function useIndexerQuery<T>(
  key: readonly unknown[],
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  return useQuery<T, IndexerError>({
    queryKey: ["indexer", ...key],
    queryFn: async ({ signal }) => {
      try {
        return await load(signal);
      } catch (error) {
        throw error instanceof IndexerError ? error : new IndexerError("invalid-response");
      }
    },
    enabled,
    retry: false,
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}
export const useRecentEpisodes = (limit = 6) =>
  useIndexerQuery(["recent", limit], (signal) => getRecentEpisodes(limit, signal));
export const useIndexedEpisode = (id?: number) =>
  useIndexerQuery(["episode", id], (signal) => getEpisode(id as number, signal), id !== undefined);
export const usePlayerPositions = (address?: Address | null) =>
  useIndexerQuery(
    ["positions", address?.toLowerCase()],
    (signal) => getPlayerPositions(address as Address, signal),
    !!address,
  );
export const usePlayerTrades = (address?: Address | null, limit = 50) =>
  useIndexerQuery(
    ["trades", address?.toLowerCase(), limit],
    (signal) => getPlayerTrades(address as Address, limit, signal),
    !!address,
  );
export const useLeaderboard = (limit = 50) =>
  useIndexerQuery(["leaderboard", limit], (signal) => getLeaderboard(limit, signal));
export const useEpisodeLeaderboard = (id?: number, limit = 50) =>
  useIndexerQuery(
    ["episode-leaderboard", id, limit],
    (signal) => getEpisodeLeaderboard(id as number, limit, signal),
    id !== undefined,
  );
