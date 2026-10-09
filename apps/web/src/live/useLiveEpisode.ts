import {
  addresses,
  centsToKuru,
  explorerTxUrl,
  gasLimit,
  gasWithMargin,
  kuruToCents,
  quoteProceeds,
  saysoMarketsAbi,
  TICK,
} from "@sayso/core";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { encodeFunctionData, erc20Abi, type Hash, parseEventLogs } from "viem";
import { TransactionRevertedError, useAccount } from "@/account";
import { useBalances, useChainEpisode } from "@/data/chain";
import { subscribeEpisode, useStudioClock } from "@/data/studio";
import { type Side, sharesFromMicro } from "@/episode/quote";
import type { TicketStatus } from "@/episode/Ticket";
import { publicClient } from "@/lib/chain";
import {
  allowanceApproval,
  cardPrice,
  liveBuyQuote,
  minOutput,
  PRESENTATION_DELAY_MS,
  presentationState,
  scheduleFlip,
  tradeTransition,
} from "./model";
import { useEpisodeBooks, useEpisodeTrades, useTokenPositions } from "./readers";

export function useLiveEpisode(id: number) {
  const account = useAccount();
  const episode = useChainEpisode(id);
  const words = episode.data?.words ?? [];
  const balances = useBalances(account.address);
  const positions = useTokenPositions(account.address, words);
  const trades = useEpisodeTrades(id);
  const books = useEpisodeBooks(words);
  const clock = useStudioClock();
  const queryClient = useQueryClient();
  const [flags, setFlags] = useState<Record<string, number>>({});
  const [, refresh] = useState(0);
  const [selected, select] = useState<bigint | null>(null);
  const [status, setStatus] = useState<TicketStatus>("idle");
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();
  const [streamOffline, setStreamOffline] = useState(false);
  const busy = useRef(false);
  const startsAtMs = Number(episode.data?.startsAt ?? 0n) * 1_000;
  const endsAtMs = Number(episode.data?.endsAt ?? 0n) * 1_000;
  const closed = episode.data?.closed ?? false;
  useEffect(() => {
    // Do not hammer a down studio with EventSource reconnects; a fresh minute-spaced clock
    // sample is the retry gate. Chain polling continues independently.
    if (!clock.data || clock.isError || clock.dataUpdatedAt === 0) return;
    setStreamOffline(false);
    const unsubscribe = subscribeEpisode(id, {
      flag: (flag) => setFlags((previous) => ({ ...previous, [String(flag.wordId)]: flag.t })),
      state: () => {
        void queryClient.invalidateQueries({ queryKey: ["chain", "episode", id] });
      },
      schedule: () => {
        void queryClient.invalidateQueries({ queryKey: ["chain", "episode", id] });
      },
      connection: (connection) => {
        if (connection === "reconnecting") {
          setStreamOffline(true);
          unsubscribe();
        }
      },
      error: () => {
        setStreamOffline(true);
        unsubscribe();
      },
    });
    return unsubscribe;
  }, [id, queryClient, clock.data, clock.dataUpdatedAt, clock.isError]);
  const offsets = words.map((word) =>
    word.state === "SaidPending" || word.state === "Yes"
      ? word.offsetMs
      : flags[word.id.toString()],
  );
  const scheduleKey = offsets.join(",");
  useEffect(() => {
    const cleanups = scheduleKey
      .split(",")
      .filter(Boolean)
      .map((offset) =>
        scheduleFlip(clock.now, startsAtMs + Number(offset) + PRESENTATION_DELAY_MS, () =>
          refresh((n) => n + 1),
        ),
      );
    const timer = setInterval(() => refresh((n) => n + 1), 200);
    return () => {
      clearInterval(timer);
      for (const cleanup of cleanups) cleanup();
    };
  }, [clock.now, startsAtMs, scheduleKey]);
  const now = clock.now();
  // A closed episode proves that every flagged offset is already past presentation. No local-clock fiction.
  const cards = words.map((word, i) => {
    const state = presentationState(
      word.state,
      startsAtMs,
      offsets[i],
      closed ? endsAtMs + PRESENTATION_DELAY_MS : now,
    );
    const last = trades.data?.filter((t) => t.word_id === String(word.id)).at(-1);
    let lastYes: number | null = null;
    if (last) {
      try {
        const raw = last.side >= 2 ? 10_000 - last.priceBps : last.priceBps;
        lastYes = kuruToCents(centsToKuru(Math.round(raw / TICK)));
      } catch {
        /* Empty or endpoint execution prices have no tradable tick. */
      }
    }
    const price = cardPrice(state, books[i], lastYes);
    const holding = positions.data?.find((p) => p.wordId === word.id);
    const position =
      holding && (holding.yes > 0n || holding.no > 0n)
        ? {
            side: holding.yes > 0n ? ("yes" as const) : ("no" as const),
            shares: sharesFromMicro(holding.yes > 0n ? holding.yes : holding.no),
          }
        : undefined;
    return {
      word: word.text,
      priceCents: price ?? 0,
      priceAvailable: price !== null,
      state,
      position,
      selected: selected === word.id,
      onPress: () => {
        if (busy.current) return;
        select(word.id);
        setStatus("idle");
        setHash(undefined);
        setError(undefined);
      },
    };
  });
  const index = words.findIndex((w) => w.id === selected);
  const word = words[index];
  const book = books[index];
  const holding = positions.data?.find((p) => p.wordId === selected);
  // A ticket left open across the SAID flip is a new ticket: the buy's "Filled!" must not stand in
  // for, and disable, the Cash out button.
  const ticketState = cards[index]?.state;
  const [shownTicketState, setShownTicketState] = useState(ticketState);
  if (!busy.current && ticketState !== shownTicketState) {
    // If SAID arrived during signing, defer this reset until the receipt has completed.
    // Consuming the state change while busy left the buy's Filled button on the cash-out ticket.
    setShownTicketState(ticketState);
    setStatus((s) => tradeTransition(s, "idle"));
    setHash(undefined);
    setError(undefined);
  }
  const disabledReason = !word
    ? undefined
    : word.state === "Yes" ||
        word.state === "No" ||
        word.state === "Void" ||
        episode.data?.state === "Settled"
      ? "Settled words cannot trade. Redeem from results."
      : !episode.data?.listed
        ? "This episode is not listed yet."
        : episode.isError || positions.isError || balances.isError
          ? "Chain data is unavailable. Trading is paused."
          : undefined;
  const sync = useMemo(
    () => ({ now: clock.now, startsAtMs, endsAtMs }),
    [clock.now, startsAtMs, endsAtMs],
  );
  const execute = async (side: Side, amount: bigint, sell: boolean) => {
    if (busy.current || !word || !account.address || disabledReason) return;
    busy.current = true;
    setStatus((s) => tradeTransition(s, "sending"));
    setError(undefined);
    setHash(undefined);
    try {
      if (!book) throw new Error("Book unavailable");
      let input: bigint, guard: bigint;
      if (sell) {
        input = side === "yes" ? (holding?.yes ?? 0n) : (holding?.no ?? 0n);
        const cents = side === "yes" ? book.bid : book.ask === null ? null : 100 - book.ask;
        if (input <= 0n || cents === null || cents <= 0 || cents >= 100)
          throw new Error("No cash-out liquidity. Hold until settled.");
        guard = minOutput(quoteProceeds(input, centsToKuru(cents)));
        if (guard <= 0n) throw new Error("Position is below the book's cash-out quantum.");
      } else {
        if (side === "no" && closed) throw new Error("New NO positions close when the clip ends.");
        const quote = liveBuyQuote(side, book.bid, book.ask, amount);
        if (!quote) throw new Error("No executable quote on this side.");
        const balance = await publicClient.readContract({
          address: addresses.ausd,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account.address],
        });
        if (balance < amount) throw new Error("Not enough AUSD.");
        const allowance = await publicClient.readContract({
          address: addresses.ausd,
          abi: erc20Abi,
          functionName: "allowance",
          args: [account.address, addresses.saysoMarkets],
        });
        const approval = allowanceApproval(allowance, amount, balance);
        if (approval !== null) {
          const approvalHash = await account.send({
            to: addresses.ausd,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: "approve",
              args: [addresses.saysoMarkets, approval],
            }),
            gas: gasLimit("approveAusd"),
          });
          setHash(approvalHash);
        }
        input = side === "yes" ? amount : quote.sharesMicro;
        guard = side === "yes" ? quote.minOut : quote.maxAusdIn;
      }
      const kind = sell
        ? side === "yes"
          ? "sellYes"
          : "sellNo"
        : side === "yes"
          ? "buyYes"
          : "buyNo";
      const data = encodeFunctionData({
        abi: saysoMarketsAbi,
        functionName: kind,
        args: [word.id, input, guard],
      });
      // Live Kuru books cost more than the measured table (crossed levels, cold slots), and Monad
      // bills the limit: take the larger of the table and this exact call's estimate. A call that
      // would revert fails here, before the player pays for it.
      const estimate = await publicClient
        .estimateGas({ account: account.address, to: addresses.saysoMarkets, data })
        .catch(() => {
          throw new Error("This order would not fill at the current price. Nothing was sent.");
        });
      const table = gasLimit(kind);
      const live = gasWithMargin(estimate);
      const txHash = await account.send({
        to: addresses.saysoMarkets,
        data,
        gas: live > table ? live : table,
      });
      setHash(txHash);
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
      const fills = parseEventLogs({
        abi: saysoMarketsAbi,
        logs: receipt.logs,
        eventName: "Traded",
      });
      if (
        !fills.some(
          (f) =>
            f.address.toLowerCase() === addresses.saysoMarkets.toLowerCase() &&
            f.args.wordId === word.id &&
            f.args.account.toLowerCase() === account.address?.toLowerCase() &&
            f.args.tokenAmount > 0n,
        )
      )
        throw new Error("The IOC order did not fill.");
      setStatus((s) => tradeTransition(s, "filled"));
      // Refresh in the background: awaiting every read model here kept `busy` set, which swallowed
      // the player's Close and left this ticket over the board.
      for (const key of ["chain", "live", "indexer"])
        void queryClient.invalidateQueries({ queryKey: [key] });
    } catch (cause) {
      if (cause instanceof TransactionRevertedError) setHash(cause.hash);
      setStatus((s) => tradeTransition(s, "failed"));
      setError(
        cause instanceof Error ? cause.message.split("\n")[0] : "Order failed. No fill confirmed.",
      );
    } finally {
      busy.current = false;
    }
  };
  return {
    episode,
    balances,
    positions,
    trades,
    books,
    cards,
    clock,
    now,
    sync,
    word,
    book,
    holding,
    index,
    status,
    error,
    disabledReason,
    streamOffline,
    transactionUrl: hash ? explorerTxUrl(hash) : undefined,
    closeTicket: () => {
      if (!busy.current) select(null);
    },
    buy: (side: Side, amount: bigint) => execute(side, amount, false),
    sell: (side: Side) => execute(side, 0n, true),
    closed,
    startsAtMs,
    endsAtMs,
  };
}
