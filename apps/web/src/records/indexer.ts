import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { graphql, mapTrade } from "@/data/indexer";
import { leaderboardRows } from "./adapters";

export function useRecordTrades(address: Address | null) {
  return useQuery({
    queryKey: ["records", "trades", address],
    enabled: !!address,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async ({ signal }) => {
      type Row = Parameters<typeof mapTrade>[0];
      const rows: Row[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await graphql<{ Trade: Row[] }>(
          `query RecordsTrades($address: String!, $offset: Int!) { Trade(where: {player_id: {_eq: $address}}, order_by: [{timestamp: desc}, {id: desc}], limit: 100, offset: $offset) { id player_id side tokenAmount ausdAmount priceBps timestamp block word { id episode_id text yes no market state offsetMs flaggedAt outcome evidenceHash resolvedAt resolveTx episode { id clipId rootA rootB startsAt endsAt state wordCount resolvedCount closedAt settledAt } } } }`,
          { address: address?.toLowerCase(), offset },
          signal,
        );
        rows.push(...page.Trade);
        if (page.Trade.length < 100) break;
      }
      return rows.map(mapTrade);
    },
  });
}
export function useRecordLeaders(tab: "episode" | "all-time", episodeId: number | undefined) {
  return useQuery({
    queryKey: ["records", "leaders", tab, episodeId],
    enabled: tab === "all-time" || episodeId !== undefined,
    retry: false,
    refetchInterval: 15_000,
    queryFn: async ({ signal }) => {
      const rows: { address: string; profit: bigint; trades: number; rank?: number }[] = [];
      for (let offset = 0; ; offset += 100) {
        if (tab === "all-time") {
          const page = await graphql<{ Player: { id: string; profit: string; trades: number }[] }>(
            "query RecordLeaders($offset: Int!) { Player(order_by: [{profit: desc}, {id: asc}], limit: 100, offset: $offset) { id profit trades } }",
            { offset },
            signal,
          );
          rows.push(
            ...page.Player.map((row) => ({
              address: row.id,
              profit: BigInt(row.profit),
              trades: row.trades,
            })),
          );
          if (page.Player.length < 100) break;
        } else {
          const page = await graphql<{
            EpisodePlayer: { id: string; profit: string; trades: number; rank: number }[];
          }>(
            "query RecordEpisodeLeaders($prefix: String!, $offset: Int!) { EpisodePlayer(where: {id: {_like: $prefix}}, order_by: [{profit: desc}, {id: asc}], limit: 100, offset: $offset) { id profit trades rank } }",
            { prefix: `${episodeId}-%`, offset },
            signal,
          );
          rows.push(
            ...page.EpisodePlayer.map((row) => ({
              address: row.id.slice(row.id.indexOf("-") + 1),
              profit: BigInt(row.profit),
              trades: row.trades,
              rank: row.rank,
            })),
          );
          if (page.EpisodePlayer.length < 100) break;
        }
      }
      return leaderboardRows(rows);
    },
  });
}
