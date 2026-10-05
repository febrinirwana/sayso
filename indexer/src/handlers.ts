import { type EvmOnEventContext, indexer, type Position, type Word } from "envio";

const ZERO = "0x0000000000000000000000000000000000000000";
type Context = EvmOnEventContext;

function value(position: Position, word: Word): bigint {
  if (word.outcome === 2) return position.yes;
  if (word.outcome === 3) return position.no;
  // Each side is redeemed separately, and Solidity floors each call's payout.
  if (word.outcome === 4) return position.yes / 2n + position.no / 2n;
  return 0n;
}

async function positionFor(context: Context, account: string, word: Word, timestamp: number) {
  const player = await context.Player.getOrCreate({
    id: account,
    trades: 0,
    volume: 0n,
    cashIn: 0n,
    cashOut: 0n,
    settledValue: 0n,
    profit: 0n,
    episodesPlayed: 0,
    firstSeen: BigInt(timestamp),
  });
  const membershipId = `${word.episode_id}-${account}`;
  if (!(await context.EpisodePlayer.get(membershipId))) {
    context.EpisodePlayer.set({ id: membershipId, profit: 0n, trades: 0, rank: 0 });
    context.Player.set({ ...player, episodesPlayed: player.episodesPlayed + 1 });
  }
  return context.Position.getOrCreate({
    id: `${account}-${word.id}`,
    player_id: account,
    word_id: word.id,
    yes: 0n,
    no: 0n,
    cashIn: 0n,
    cashOut: 0n,
    redeemed: 0n,
  });
}

async function refreshPlayer(context: Context, account: string) {
  const positions = await context.Position.getWhere({ player_id: { _eq: account } });
  let settledValue = 0n;
  let profit = 0n;
  const episodeProfit = new Map<string, bigint>();
  for (const position of positions) {
    const word = await context.Word.getOrThrow(position.word_id);
    if (word.outcome === undefined) continue;
    const held = value(position, word);
    const realized = position.cashIn - position.cashOut + held;
    settledValue += held;
    profit += realized;
    episodeProfit.set(word.episode_id, (episodeProfit.get(word.episode_id) ?? 0n) + realized);
  }
  const player = await context.Player.getOrThrow(account);
  context.Player.set({ ...player, settledValue, profit });
  for (const [episodeId, profit] of episodeProfit) {
    const entry = await context.EpisodePlayer.getOrThrow(`${episodeId}-${account}`);
    context.EpisodePlayer.set({ ...entry, profit });
  }
}

async function rankEpisode(context: Context, episodeId: string) {
  const episode = await context.Episode.getOrThrow(episodeId);
  if (episode.state !== "Settled") return;
  const words = await context.Word.getWhere({ episode_id: { _eq: episodeId } });
  const positions = await context.Position.getWhere({
    word_id: { _in: words.map((word) => word.id) },
  });
  const accounts = new Set(positions.map((position) => position.player_id));
  const entries = await Promise.all(
    [...accounts].map((account) => context.EpisodePlayer.getOrThrow(`${episodeId}-${account}`)),
  );
  // Equal profit shares a competition rank; address orders ties deterministically.
  entries.sort((a, b) =>
    a.profit === b.profit ? a.id.localeCompare(b.id) : a.profit > b.profit ? -1 : 1,
  );
  let rank = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;
    if (i === 0 || entry.profit !== entries[i - 1]?.profit) rank = i + 1;
    context.EpisodePlayer.set({ ...entry, rank });
  }
}

async function cash(
  context: Context,
  word: Word,
  account: string,
  timestamp: number,
  cashIn: bigint,
  cashOut: bigint,
  redeemed = 0n,
  tradeVolume?: bigint,
) {
  const position = await positionFor(context, account, word, timestamp);
  context.Position.set({
    ...position,
    cashIn: position.cashIn + cashIn,
    cashOut: position.cashOut + cashOut,
    redeemed: position.redeemed + redeemed,
  });
  const player = await context.Player.getOrThrow(account);
  context.Player.set({
    ...player,
    cashIn: player.cashIn + cashIn,
    cashOut: player.cashOut + cashOut,
    trades: player.trades + (tradeVolume === undefined ? 0 : 1),
    volume: player.volume + (tradeVolume ?? 0n),
  });
  if (tradeVolume !== undefined) {
    const entry = await context.EpisodePlayer.getOrThrow(`${word.episode_id}-${account}`);
    context.EpisodePlayer.set({ ...entry, trades: entry.trades + 1 });
  }
  await refreshPlayer(context, account);
  await rankEpisode(context, word.episode_id);
}

indexer.onEvent(
  { contract: "SaysoMarkets", event: "EpisodeCreated" },
  async ({ event, context }) => {
    const { episodeId, clipId, rootA, rootB, startsAt, endsAt } = event.params;
    context.Episode.set({
      id: episodeId.toString(),
      clipId,
      rootA,
      rootB,
      startsAt,
      endsAt,
      state: BigInt(event.block.timestamp) >= startsAt ? "Live" : "Scheduled",
      wordCount: 0,
      resolvedCount: 0,
      closedAt: undefined,
      settledAt: undefined,
    });
  },
);

indexer.contractRegister(
  { contract: "SaysoMarkets", event: "WordAdded" },
  async ({ event, context }) => {
    context.chain.OutcomeToken.add(event.params.yes);
    context.chain.OutcomeToken.add(event.params.no);
  },
);

indexer.onEvent({ contract: "SaysoMarkets", event: "WordAdded" }, async ({ event, context }) => {
  const { episodeId, wordId, text, yes, no } = event.params;
  // bytes32 contains UTF-8 with trailing NUL padding, not a displayable hex word.
  const bytes = Uint8Array.from(text.slice(2).match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
  context.Word.set({
    id: wordId.toString(),
    episode_id: episodeId.toString(),
    text: new TextDecoder().decode(bytes).replace(/\0+$/, ""),
    yes,
    no,
    market: undefined,
    state: "Open",
    offsetMs: undefined,
    flaggedAt: undefined,
    outcome: undefined,
    evidenceHash: undefined,
    resolvedAt: undefined,
    resolveTx: undefined,
  });
  const episode = await context.Episode.getOrThrow(episodeId.toString());
  context.Episode.set({ ...episode, wordCount: episode.wordCount + 1 });
});

indexer.onEvent({ contract: "SaysoMarkets", event: "WordListed" }, async ({ event, context }) => {
  const word = await context.Word.getOrThrow(event.params.wordId.toString());
  context.Word.set({ ...word, market: event.params.market });
});

indexer.onEvent({ contract: "OutcomeToken", event: "Transfer" }, async ({ event, context }) => {
  const yesWords = await context.Word.getWhere({ yes: { _eq: event.srcAddress } });
  const noWords = await context.Word.getWhere({ no: { _eq: event.srcAddress } });
  const word = yesWords[0] ?? noWords[0];
  if (!word) throw new Error(`OutcomeToken ${event.srcAddress} has no WordAdded`);
  const { from, to, value } = event.params;
  if (from === to || value === 0n) return;
  const side = word.yes === event.srcAddress ? "yes" : "no";
  for (const [account, delta] of [
    [from, -value],
    [to, value],
  ] as const) {
    // Protocol custody and book inventory are not players. House EOAs still are.
    if (
      account === ZERO ||
      account === word.market ||
      indexer.chains[context.chain.id].SaysoMarkets.addresses.includes(account)
    )
      continue;
    const position = await positionFor(context, account, word, event.block.timestamp);
    context.Position.set({ ...position, [side]: position[side] + delta });
    await refreshPlayer(context, account);
  }
  await rankEpisode(context, word.episode_id);
});

indexer.onEvent({ contract: "SaysoMarkets", event: "Traded" }, async ({ event, context }) => {
  const { wordId, account, tokenAmount, ausdAmount, side } = event.params;
  const word = await context.Word.getOrThrow(wordId.toString());
  const buy = side === 0n || side === 2n;
  context.Trade.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    word_id: word.id,
    player_id: account,
    side: Number(side),
    tokenAmount,
    ausdAmount,
    priceBps: tokenAmount === 0n ? 0 : Number((ausdAmount * 10_000n) / tokenAmount),
    timestamp: BigInt(event.block.timestamp),
    block: BigInt(event.block.number),
  });
  // Transfer is the only source of token balances (including refunds and YES dust).
  await cash(
    context,
    word,
    account,
    event.block.timestamp,
    buy ? 0n : ausdAmount,
    buy ? ausdAmount : 0n,
    0n,
    ausdAmount,
  );
});

indexer.onEvent({ contract: "SaysoMarkets", event: "SetMinted" }, async ({ event, context }) => {
  const word = await context.Word.getOrThrow(event.params.wordId.toString());
  await cash(context, word, event.params.payer, event.block.timestamp, 0n, event.params.amount);
});
indexer.onEvent({ contract: "SaysoMarkets", event: "SetBurned" }, async ({ event, context }) => {
  const word = await context.Word.getOrThrow(event.params.wordId.toString());
  await cash(context, word, event.params.recipient, event.block.timestamp, event.params.amount, 0n);
});
indexer.onEvent({ contract: "SaysoMarkets", event: "Redeemed" }, async ({ event, context }) => {
  const word = await context.Word.getOrThrow(event.params.wordId.toString());
  await cash(
    context,
    word,
    event.params.account,
    event.block.timestamp,
    event.params.ausdOut,
    0n,
    event.params.tokenAmount,
  );
});

indexer.onEvent({ contract: "SaysoMarkets", event: "WordFlagged" }, async ({ event, context }) => {
  const word = await context.Word.getOrThrow(event.params.wordId.toString());
  context.Word.set({
    ...word,
    state: "SaidPending",
    offsetMs: Number(event.params.offsetMs),
    flaggedAt: BigInt(event.block.timestamp),
  });
  const episode = await context.Episode.getOrThrow(word.episode_id);
  context.Episode.set({ ...episode, state: "Live" });
});
indexer.onEvent(
  { contract: "SaysoMarkets", event: "EpisodeClosed" },
  async ({ event, context }) => {
    const episode = await context.Episode.getOrThrow(event.params.episodeId.toString());
    context.Episode.set({ ...episode, state: "Closed", closedAt: BigInt(event.block.timestamp) });
  },
);

async function finalize(
  context: Context,
  word: Word,
  outcome: number,
  timestamp: number,
  tx: string,
  evidenceHash?: string,
) {
  context.Word.set({
    ...word,
    state: outcome === 2 ? "Yes" : outcome === 3 ? "No" : "Void",
    outcome,
    evidenceHash,
    resolvedAt: BigInt(timestamp),
    resolveTx: tx,
  });
  const episode = await context.Episode.getOrThrow(word.episode_id);
  context.Episode.set({ ...episode, resolvedCount: episode.resolvedCount + 1 });
  const positions = await context.Position.getWhere({ word_id: { _eq: word.id } });
  for (const position of positions) await refreshPlayer(context, position.player_id);
}
indexer.onEvent({ contract: "SaysoMarkets", event: "WordResolved" }, async ({ event, context }) => {
  const word = await context.Word.getOrThrow(event.params.wordId.toString());
  await finalize(
    context,
    word,
    Number(event.params.outcome),
    event.block.timestamp,
    event.transaction.hash,
    event.params.evidenceHash,
  );
});
indexer.onEvent({ contract: "SaysoMarkets", event: "WordVoided" }, async ({ event, context }) => {
  const word = await context.Word.getOrThrow(event.params.wordId.toString());
  await finalize(context, word, 4, event.block.timestamp, event.transaction.hash);
});
indexer.onEvent(
  { contract: "SaysoMarkets", event: "EpisodeSettled" },
  async ({ event, context }) => {
    const episode = await context.Episode.getOrThrow(event.params.episodeId.toString());
    context.Episode.set({ ...episode, state: "Settled", settledAt: BigInt(event.block.timestamp) });
    await rankEpisode(context, episode.id);
  },
);

// These events have no fields in ERD §2. EvidenceReady is a trigger, NOT an outcome;
// role/pause changes cannot rewrite commitments or holdings. Observe, do not invent state.
for (const event of [
  "EvidenceReady",
  "OperatorUpdated",
  "EpisodesPausedUpdated",
  "ReportOriginUpdated",
] as const) {
  indexer.onEvent({ contract: "SaysoMarkets", event }, async ({ context }) => {
    context.log.debug(`Observed SaysoMarkets ${event}; no ERD entity mutation`);
  });
}
