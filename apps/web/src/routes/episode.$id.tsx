import { centsToKuru, quoteProceeds } from "@sayso/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAccount, useAccount } from "@/account";
import { mediaUrl } from "@/data/studio";
import { BetsChip } from "@/episode/BetsChip";
import { betsView } from "@/episode/bets";
import { EpisodeHeader } from "@/episode/EpisodeHeader";
import { EpisodeLayout } from "@/episode/EpisodeLayout";
import { type Holding, PositionStrip } from "@/episode/PositionStrip";
import { sharesFromMicro } from "@/episode/quote";
import { Ticket } from "@/episode/Ticket";
import { VideoStage } from "@/episode/VideoStage";
import { WordBoard } from "@/episode/WordBoard";
import { liveBuyQuote, PRESENTATION_DELAY_MS } from "@/live/model";
import { remainingCost } from "@/live/positions";
import { useLiveEpisode } from "@/live/useLiveEpisode";

export const Route = createFileRoute("/episode/$id")({ component: EpisodeRoute });
function EpisodeRoute() {
  const { id } = Route.useParams();
  const episodeId = Number(id);
  return (
    <RequireAccount>
      {Number.isSafeInteger(episodeId) && episodeId > 0 ? (
        <EpisodePage key={id} id={episodeId} />
      ) : (
        <p className="p-6">That episode number is not valid.</p>
      )}
    </RequireAccount>
  );
}

function EpisodePage({ id }: { id: number }) {
  const account = useAccount();
  const live = useLiveEpisode(id);
  const episode = live.episode.data;
  if (!episode)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6">
        <h1 className="font-headline text-3xl">
          {live.episode.isError ? "Episode unavailable" : "Finding your episode…"}
        </h1>
        <p>
          TESTNET ·{" "}
          {live.episode.isError
            ? "The chain did not return this episode."
            : "Reading the committed words from the chain."}
        </p>
        <Link to="/arena" className="sticker rounded-full px-5 py-3">
          Back to arena
        </Link>
      </main>
    );
  const elapsed = live.now === null ? null : live.now - live.startsAtMs - PRESENTATION_DELAY_MS;
  const durationSeconds = (live.endsAtMs - live.startsAtMs) / 1_000;
  const ended = live.closed || (elapsed !== null && elapsed >= durationSeconds * 1_000);
  const playing = !ended && elapsed !== null && elapsed >= 0;
  const holdings: Holding[] = [];
  let costMicro = 0n,
    valueMicro = 0n;
  let costKnown = !!live.trades.data && !live.trades.isError,
    valueKnown = !live.positions.isError;
  for (const [index, word] of episode.words.entries()) {
    const position = live.positions.data?.find((p) => p.wordId === word.id);
    for (const side of ["yes", "no"] as const) {
      const amount = position?.[side] ?? 0n;
      if (!amount) continue;
      holdings.push({ word: word.text, side, shares: sharesFromMicro(amount) });
      const basis =
        live.trades.data && account.address
          ? remainingCost(live.trades.data, account.address, word.id, side, amount)
          : null;
      if (basis === null) costKnown = false;
      else costMicro += basis;
      if (word.state === "Void") valueMicro += amount / 2n;
      else if (word.state === "Yes" || word.state === "No")
        valueMicro += (word.state === "Yes") === (side === "yes") ? amount : 0n;
      else {
        const book = live.books[index];
        const cents =
          side === "yes" ? (book?.bid ?? null) : book?.ask == null ? null : 100 - book.ask;
        if (cents === null) valueKnown = false;
        else valueMicro += quoteProceeds(amount, centsToKuru(cents));
      }
    }
  }
  const selectedCard = live.cards[live.index];
  const bets = betsView(live.trading, ended);
  return (
    <EpisodeLayout
      header={
        <EpisodeHeader
          episode={`Episode ${id}`}
          title="Replay Arena"
          balanceMicro={live.balances.data?.ausd}
        />
      }
      stage={
        <VideoStage
          src={mediaUrl(episode.clipId)}
          live={playing}
          ended={ended}
          sync={live.sync}
          durationSeconds={durationSeconds}
          betsCloseIn={bets.closesInSeconds}
          secondsLeft={
            ended || elapsed === null
              ? undefined
              : elapsed < 0
                ? -elapsed / 1_000
                : durationSeconds - elapsed / 1_000
          }
          marks={episode.words
            .filter((w) => live.cards.find((c) => c.word === w.text)?.state === "said")
            .map((w) => ({ word: w.text, atSeconds: w.offsetMs / 1_000 }))}
        >
          {live.now === null || live.streamOffline ? (
            <p
              role="status"
              className="absolute inset-x-3 top-14 rounded-xl bg-card p-3 text-[12px] font-semibold"
            >
              Studio offline.{" "}
              {ended
                ? "Clip loaded; outcomes below are onchain."
                : live.now === null
                  ? "Playback waits for a synchronized clock. The board still follows the chain."
                  : "Using the synchronized clock and chain flags."}
            </p>
          ) : null}
          {live.closed ? (
            <Link
              to="/results/$id"
              params={{ id: String(id) }}
              className="sticker pressable absolute right-3 bottom-3 rounded-full bg-card px-5 py-3 font-bold"
            >
              See results
            </Link>
          ) : null}
        </VideoStage>
      }
      board={<WordBoard words={live.cards} variant="episode" caption={<BetsChip view={bets} />} />}
      position={
        <PositionStrip
          holdings={holdings}
          costMicro={costMicro}
          valueMicro={valueMicro}
          costKnown={costKnown}
          valueKnown={valueKnown}
          loading={!live.positions.data || live.positions.isError}
        />
      }
      ticketWord={live.word?.text ?? null}
      onTicketClose={live.closeTicket}
      renderTicket={(layout) =>
        live.word && selectedCard ? (
          <Ticket
            key={String(live.word.id)}
            word={live.word.text}
            state={selectedCard.state}
            yesCents={live.book?.ask ?? 0}
            noCents={live.book?.bid == null ? 0 : 100 - live.book.bid}
            position={selectedCard.position}
            balanceMicro={live.balances.data?.ausd ?? 0n}
            status={live.status}
            layout={layout}
            onClose={live.closeTicket}
            quoteFor={(side, amount) =>
              liveBuyQuote(side, live.book?.bid ?? null, live.book?.ask ?? null, amount)
            }
            minSharesFor={(side, amount) => {
              const quote = liveBuyQuote(
                side,
                live.book?.bid ?? null,
                live.book?.ask ?? null,
                amount,
              );
              return quote ? (side === "yes" ? quote.minOut : quote.sharesMicro) : null;
            }}
            bets={bets}
            disabledReason={live.disabledReason}
            cashOutBidCents={live.book?.bid ?? null}
            transactionUrl={live.transactionUrl}
            errorMessage={live.error}
            sellPositions={{
              yes: sharesFromMicro(live.holding?.yes ?? 0n),
              no: sharesFromMicro(live.holding?.no ?? 0n),
            }}
            onConfirm={({ side, amountMicro }) => {
              void live.buy(side, amountMicro);
            }}
            onCashOut={() => {
              void live.sell("yes");
            }}
            onSell={(side) => {
              void live.sell(side);
            }}
          />
        ) : null
      }
    />
  );
}
