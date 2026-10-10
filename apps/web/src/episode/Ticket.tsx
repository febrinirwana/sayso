import { Check, Clock3, LoaderCircle, Lock, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { play } from "@/sound";
import { TestnetPill } from "@/ui/TestnetPill";
import type { BetsView } from "./bets";
import { BALANCE_ANCHOR, useEpisodeFx, wordAnchor } from "./EpisodeFx";
import {
  formatAusd,
  formatAusdAmount,
  formatCents,
  formatClock,
  formatHolding,
  formatShares,
} from "./format";
import {
  AMOUNT_PRESETS_MICRO,
  type BuyQuote,
  buyQuote,
  SAID_BID_CENTS,
  type Side,
  saleValueMicro,
  sharesFromMicro,
  sharesToMicro,
} from "./quote";
import { EASE_OUT } from "./settle";
import type { WordState } from "./WordCard";

export type TicketStatus = "idle" | "sending" | "filled" | "failed";

export type TicketProps = {
  word: string;
  /** Open words buy YES or NO; SAID words cash out; settled words are read-only. */
  state: WordState;
  /** Current YES price in cents. */
  yesCents: number;
  /** The player's holding on this word. */
  position?: { side: Side; shares: number } | undefined;
  /** Spendable AUSD, 6-decimal units; presets above it are disabled. */
  balanceMicro?: bigint;
  /** Order lifecycle, driven by the caller: `sending` after confirm, then `filled` or `failed`. */
  status?: TicketStatus;
  /** Side picked when the ticket opens. */
  initialSide?: Side;
  onConfirm?: (order: { side: Side; amountMicro: bigint }) => void;
  onCashOut?: () => void;
  onClose?: () => void;
  /** `sheet` stacks for phones; `dock` lays out in two columns for the desktop panel. */
  layout?: "sheet" | "dock";
  /** Live callers supply executable book quotes, never a midpoint. */
  quoteFor?: (side: Side, amountMicro: bigint) => BuyQuote | null;
  noCents?: number;
  disabledReason?: string | undefined;
  cashOutBidCents?: number | null | undefined;
  onSell?: (side: Side) => void;
  sellPositions?: { yes: number; no: number };
  transactionUrl?: string | undefined;
  errorMessage?: string | undefined;
  /**
   * The bets window. Open: the header counts down to the close. Closed: an open word shows why it
   * cannot take a bet instead of the buy form; SAID cash-outs are unaffected. Omit outside an episode.
   */
  bets?: BetsView | undefined;
  minSharesFor?: (side: Side, amountMicro: bigint) => bigint | null;
};

const DEFAULT_AMOUNT = AMOUNT_PRESETS_MICRO[1] ?? 5_000_000n;
const SLIDE = { type: "spring", duration: 0.32, bounce: 0.2 } as const;

/**
 * S4 ticket body: YES/NO, amount, cost and payout if right, one confirm; cash out on SAID words.
 * Plays `confirm` on send, `fill` or `cashout` when the caller reports the fill, and flies coins
 * between the card and the balance. Key it by word so each word opens fresh.
 */
export function Ticket({
  word,
  state,
  yesCents,
  position,
  balanceMicro,
  status = "idle",
  initialSide = "yes",
  onConfirm,
  onCashOut,
  onClose,
  layout = "sheet",
  quoteFor,
  noCents,
  disabledReason,
  cashOutBidCents,
  onSell,
  sellPositions,
  transactionUrl,
  errorMessage,
  bets,
  minSharesFor,
}: TicketProps) {
  const fx = useEpisodeFx();
  // An order already in flight keeps its buy form until the receipt lands.
  const locked = bets?.lockedReason !== undefined && status !== "sending" && status !== "filled";
  const mode =
    state === "open" ? (locked ? "locked" : "buy") : state === "said" ? "cashout" : "settled";

  // Fill feedback when the caller's status lands, never on first render.
  const lastStatus = useRef(status);
  useEffect(() => {
    if (status === "filled" && lastStatus.current !== "filled") {
      if (mode === "cashout") {
        play("cashout");
        void fx.flyCoins(wordAnchor(word), BALANCE_ANCHOR);
      } else {
        play("fill");
        void fx.flyCoins(BALANCE_ANCHOR, wordAnchor(word));
      }
    }
    lastStatus.current = status;
  }, [status, mode, fx, word]);

  const dock = layout === "dock";
  return (
    <div className={`@container flex flex-col ${dock ? "gap-3" : "gap-4"}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-soft">
            {mode === "buy"
              ? "Will they say it?"
              : mode === "locked"
                ? "Bets locked"
                : mode === "cashout"
                  ? "Said!"
                  : "Settled"}
            {mode === "buy" && bets?.closesInSeconds !== undefined ? (
              <span
                className={`tabular inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-ink transition-colors duration-180 ease-out ${bets.tone === "closing" ? "bg-sun" : "bg-line"}`}
              >
                <Clock3 aria-hidden size={12} strokeWidth={3} />
                Bets close in {formatClock(bets.closesInSeconds)}
              </span>
            ) : null}
          </p>
          <h2
            className={`font-headline truncate uppercase leading-[1.02] ${dock ? "text-[26px] xl:text-[30px]" : "text-[34px]"}`}
          >
            {word}
          </h2>
        </div>
        {mode === "cashout" ? (
          <span className="mt-1 inline-flex h-8 shrink-0 items-center rounded-full border-2 border-ink bg-said px-3 text-[13px] font-extrabold tracking-[0.1em] text-ink">
            SAID
          </span>
        ) : null}
        {onClose ? (
          <button
            type="button"
            aria-label="Close ticket"
            onClick={() => {
              play("tap");
              onClose();
            }}
            className="sticker pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full"
          >
            <X aria-hidden size={20} strokeWidth={2.5} />
          </button>
        ) : null}
      </div>
      {mode === "buy" ? (
        <BuyBody
          yesCents={yesCents}
          balanceMicro={balanceMicro}
          status={status}
          initialSide={initialSide}
          onConfirm={onConfirm}
          dock={dock}
          quoteFor={quoteFor}
          noCents={noCents}
          disabledReason={disabledReason}
          minSharesFor={minSharesFor}
        />
      ) : mode === "cashout" ? (
        <CashOutBody
          position={position}
          status={status}
          onCashOut={onCashOut}
          dock={dock}
          bidCents={cashOutBidCents}
          disabledReason={disabledReason}
        />
      ) : mode === "locked" ? (
        <LockedBody reason={bets?.lockedReason} position={position} />
      ) : (
        <p className="text-[15px] leading-6 text-ink-soft">
          This word settled {state === "yes" ? "YES" : state === "void" ? "VOID" : "NO"}.
          {position ? " Redeem it from your results." : null}
        </p>
      )}
      {disabledReason ? <p className="text-[12px] text-ink-soft">{disabledReason}</p> : null}
      {onSell &&
      sellPositions &&
      (sellPositions.yes > 0 || sellPositions.no > 0) &&
      (mode === "buy" || mode === "cashout") ? (
        <div className="flex gap-2">
          {(["yes", "no"] as const).map((side) =>
            sellPositions[side] > 0 && !(mode === "cashout" && side === "yes") ? (
              <button
                key={side}
                type="button"
                className="sticker pressable rounded-full px-3 py-2 text-[12px] font-bold"
                disabled={!!disabledReason || status === "sending"}
                onClick={() => onSell(side)}
              >
                Cash out {formatShares(sellPositions[side])} {side.toUpperCase()}
              </button>
            ) : null,
          )}
          <TestnetPill />
        </div>
      ) : null}
      {transactionUrl ? (
        <a
          href={transactionUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] font-bold underline"
        >
          View transaction · TESTNET explorer
        </a>
      ) : null}
      {errorMessage ? (
        <p role="alert" className="text-[12px] text-ink-soft">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function BuyBody({
  yesCents,
  balanceMicro,
  status,
  initialSide,
  onConfirm,
  dock,
  quoteFor,
  noCents,
  disabledReason,
  minSharesFor,
}: {
  yesCents: number;
  balanceMicro: bigint | undefined;
  status: TicketStatus;
  initialSide: Side;
  onConfirm: TicketProps["onConfirm"];
  dock: boolean;
  quoteFor: TicketProps["quoteFor"];
  noCents: TicketProps["noCents"];
  disabledReason: TicketProps["disabledReason"];
  minSharesFor: TicketProps["minSharesFor"];
}) {
  const [side, setSide] = useState<Side>(initialSide);
  const [amountMicro, setAmountMicro] = useState(DEFAULT_AMOUNT);
  const quote = quoteFor ? quoteFor(side, amountMicro) : buyQuote(side, yesCents, amountMicro);
  const affordable = balanceMicro === undefined || amountMicro <= balanceMicro;
  const busy = status === "sending" || status === "filled";

  const finePrint = (
    <p className="text-[12px] leading-4 text-ink-soft">
      Immediate-or-cancel. 1% slippage guard; unspent AUSD returns to you.
    </p>
  );

  const choose = (
    <div className="flex flex-col gap-2.5">
      <SideToggle
        side={side}
        yesCents={yesCents}
        noCents={noCents}
        onChange={setSide}
        disabled={busy}
      />
      <fieldset className="flex flex-col gap-1.5" disabled={busy}>
        <legend className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-ink-soft">
          Amount · AUSD
        </legend>
        <div className="grid grid-cols-4 gap-1.5">
          {AMOUNT_PRESETS_MICRO.map((preset) => {
            const active = preset === amountMicro;
            const tooMuch = balanceMicro !== undefined && preset > balanceMicro;
            return (
              <button
                key={preset.toString()}
                type="button"
                aria-pressed={active}
                disabled={tooMuch}
                onClick={() => {
                  play("tap");
                  setAmountMicro(preset);
                }}
                className={`tabular pressable font-headline h-11 rounded-full border-2 border-ink text-[17px] shadow-sticker disabled:opacity-40 ${active ? "bg-sun" : "bg-card"}`}
              >
                {formatAusdAmount(preset).replace(/\.00$/, "")}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );

  const send = (
    <div className="flex flex-col gap-2">
      <div className="rounded-2xl border-2 border-ink bg-paper px-3.5 py-2.5">
        <Line label="You pay up to" value={formatAusd(amountMicro)} />
        <Line
          label={side === "yes" ? "You get if it's said" : "You get if it's not said"}
          value={quote ? formatAusd(quote.payoutMicro) : "–"}
          strong
        />
        {quote && minSharesFor ? (
          <Line
            label="Minimum shares"
            value={formatShares(sharesFromMicro(minSharesFor(side, amountMicro) ?? 0n))}
          />
        ) : null}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-[12px] text-ink-soft">
            {quote
              ? `${formatShares(sharesFromMicro(quote.sharesMicro))} ${side.toUpperCase()} at ${formatCents(quote.priceCents)}`
              : "No seller at this price"}
          </span>
          <TestnetPill />
        </div>
      </div>
      <ActionButton
        status={status}
        disabled={!quote || !affordable || !!disabledReason}
        onPress={() => {
          play("confirm");
          onConfirm?.({ side, amountMicro });
        }}
      >
        {affordable ? `Buy ${side.toUpperCase()} · ${formatAusd(amountMicro)}` : "Not enough AUSD"}
      </ActionButton>
    </div>
  );

  return (
    <div className={dock ? "flex flex-col gap-3" : "flex flex-col gap-4"}>
      <div
        className={dock ? "grid grid-cols-1 gap-4 @min-[480px]:grid-cols-2" : "flex flex-col gap-4"}
      >
        {choose}
        {send}
      </div>
      {finePrint}
    </div>
  );
}

function SideToggle({
  side,
  yesCents,
  onChange,
  disabled,
  noCents,
}: {
  side: Side;
  yesCents: number;
  onChange: (side: Side) => void;
  disabled: boolean;
  noCents?: number | undefined;
}) {
  const reduce = useReducedMotion() ?? false;
  const pillId = useId();
  const options = [
    { value: "yes", label: "YES", cents: yesCents },
    { value: "no", label: "NO", cents: noCents ?? 100 - yesCents },
  ] as const;
  return (
    <fieldset
      disabled={disabled}
      className="grid grid-cols-2 gap-1 rounded-full border-2 border-ink bg-paper p-1 shadow-sticker"
    >
      <legend className="sr-only">Side</legend>
      {options.map((option) => {
        const active = side === option.value;
        return (
          <label
            key={option.value}
            className={`relative flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full px-3 transition-colors duration-140 has-focus-visible:outline-3 has-focus-visible:outline-sky ${active ? "text-paper" : "text-ink"}`}
          >
            <input
              type="radio"
              name={pillId}
              value={option.value}
              checked={active}
              onChange={() => {
                play("tap");
                onChange(option.value);
              }}
              className="sr-only"
            />
            {active ? (
              <motion.span
                layoutId={pillId}
                className="absolute inset-0 rounded-full bg-ink"
                transition={reduce ? { duration: 0 } : SLIDE}
              />
            ) : null}
            <span className="font-headline relative text-[18px] leading-none">{option.label}</span>
            <span className="tabular relative text-[14px] font-bold leading-none opacity-80">
              {option.cents > 0 && option.cents < 100 ? formatCents(option.cents) : "–"}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function CashOutBody({
  position,
  status,
  onCashOut,
  dock,
  bidCents = SAID_BID_CENTS,
  disabledReason,
}: {
  position: TicketProps["position"];
  status: TicketStatus;
  onCashOut: TicketProps["onCashOut"];
  dock: boolean;
  bidCents: number | null | undefined;
  disabledReason: string | undefined;
}) {
  // A successful sell consumes both the bid and the player's holding. Receipt feedback belongs
  // to the submitted order, not to the next book/position snapshot (episode 12 live proof).
  if (status === "sending" || status === "filled")
    return (
      <ActionButton status={status} disabled onPress={() => onCashOut?.()}>
        Cash out
      </ActionButton>
    );
  if (bidCents !== SAID_BID_CENTS)
    return (
      <p className="text-[15px] leading-6 text-ink-soft">
        Hold until settled. The house cash-out bid is not on the book yet.
      </p>
    );
  if (!position || position.side === "no") {
    return (
      <p className="text-[15px] leading-6 text-ink-soft">
        {position
          ? `This word was flagged SAID. Hold until CRE confirms the result.`
          : "This word was flagged SAID. You have no YES position to cash out."}
      </p>
    );
  }
  const valueMicro = saleValueMicro(position.shares, SAID_BID_CENTS);
  const holdMicro = sharesToMicro(position.shares);
  const disclosure = (
    <p className="text-[12px] leading-4 text-ink-soft">
      The disclosed house bid is {formatCents(SAID_BID_CENTS)} while liquidity remains on the book.
    </p>
  );
  return (
    <div
      className={dock ? "grid grid-cols-1 gap-4 @min-[480px]:grid-cols-2" : "flex flex-col gap-4"}
    >
      <div className="flex flex-col justify-center rounded-2xl border-2 border-ink bg-said-tint px-4 py-3">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-ink-soft">
          Cash out now
        </p>
        <p className="flex items-baseline gap-1.5">
          <span className="font-headline tabular text-[40px] leading-[1.05]">
            {formatAusdAmount(valueMicro)}
          </span>
          <span className="text-[14px] font-bold text-ink-soft">AUSD</span>
        </p>
        <div className="flex items-center justify-between gap-2">
          <span className="tabular text-[13px] text-ink-soft">
            {formatShares(position.shares)} YES × {formatCents(SAID_BID_CENTS)}
          </span>
          <TestnetPill />
        </div>
      </div>
      <div className="flex flex-col justify-end gap-2.5">
        {dock ? disclosure : null}
        <p className="text-[14px] leading-5 text-ink-soft">
          Or hold: {formatAusd(holdMicro)} when the result is confirmed.
        </p>
        <ActionButton
          status={status}
          disabled={!!disabledReason}
          onPress={() => {
            play("confirm");
            onCashOut?.();
          }}
        >
          Cash out · {formatAusd(valueMicro)}
        </ActionButton>
        {dock ? null : disclosure}
      </div>
    </div>
  );
}

/** An open word after bets close: why it takes no bet, and what a holding can still do. */
function LockedBody({
  reason,
  position,
}: {
  reason: string | undefined;
  position: TicketProps["position"];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 rounded-2xl border-2 border-ink bg-paper px-4 py-3.5">
        <span
          aria-hidden
          className="inline-flex size-12 shrink-0 -rotate-6 items-center justify-center rounded-2xl border-2 border-ink bg-sun text-ink shadow-[0_2px_0_var(--color-ink)]"
        >
          <Lock size={22} strokeWidth={2.75} />
        </span>
        <p className="text-[15px] leading-6 text-ink">{reason}</p>
      </div>
      {position ? (
        <p className="text-[14px] leading-5 text-ink-soft">
          {formatHolding(position)}.{" "}
          {position.side === "yes"
            ? "If it's said, cash out here or hold for the result."
            : "Hold it until the result."}
        </p>
      ) : null}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className="flex items-baseline justify-between gap-3 leading-6">
      <span className="text-[13px] text-ink-soft">{label}</span>
      <span
        className={`tabular shrink-0 whitespace-nowrap ${strong ? "font-headline text-[20px] text-gain" : "text-[15px] font-semibold"}`}
      >
        {value}
      </span>
    </p>
  );
}

function ActionButton({
  status,
  disabled,
  onPress,
  children,
}: {
  status: TicketStatus;
  disabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const reduce = useReducedMotion() ?? false;
  const content =
    status === "sending" ? (
      <>
        <LoaderCircle aria-hidden size={20} strokeWidth={2.5} className="animate-spin" />
        Sending…
      </>
    ) : status === "filled" ? (
      <>
        <Check aria-hidden size={20} strokeWidth={3} />
        Filled!
      </>
    ) : status === "failed" ? (
      "Didn't fill. Try again"
    ) : (
      children
    );
  return (
    <button
      type="button"
      disabled={disabled || status === "sending" || status === "filled"}
      onClick={onPress}
      aria-live="polite"
      className={`sticker pressable font-headline relative inline-flex h-14 w-full shrink-0 items-center justify-center gap-2 overflow-hidden rounded-full px-5 text-[17px] transition-colors duration-140 disabled:pointer-events-none ${status === "filled" ? "bg-gain-bright text-ink" : "bg-ink text-paper"} ${disabled && status === "idle" ? "opacity-45" : ""}`}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          className="inline-flex items-center gap-2 whitespace-nowrap"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
        >
          {content}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
