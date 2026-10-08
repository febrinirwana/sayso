import { matchesTarget } from "@sayso/core";
import { Check, ChevronDown, ExternalLink, Fingerprint, ShieldCheck } from "lucide-react";
import { play } from "@/sound";
import { amount, price, shares, timestamp } from "./format";
import { Money, Spinner } from "./RecordUi";
import type { ResultWord } from "./types";

export function WordResult({
  word,
  index,
  expanded = false,
  onOpen,
  onRedeem,
  redeemable = 0n,
  redeemSending = false,
}: {
  word: ResultWord;
  index: number;
  expanded?: boolean;
  onOpen?: ((wordId: string) => void) | undefined;
  onRedeem?: ((wordId: string) => void) | undefined;
  redeemable?: bigint;
  redeemSending?: boolean;
}) {
  const pending = word.state === "Open" || word.state === "SaidPending";
  const yes = word.state === "Yes";
  return (
    <details
      open={expanded || undefined}
      className="group min-w-0 rounded-3xl border-2 border-ink bg-card shadow-sticker open:md:col-span-2"
      onToggle={(event) => {
        if (event.currentTarget.open) {
          play("sheet");
          onOpen?.(word.id);
        }
      }}
    >
      <summary className="flex min-h-[100px] cursor-pointer list-none items-center gap-3 p-5 [&::-webkit-details-marker]:hidden sm:p-6">
        <span className="self-start text-xs font-bold text-ink-soft">0{index + 1}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-headline break-words text-[clamp(21px,2vw,28px)]">{word.text}</h3>
          <p className="mt-1 text-xs text-ink-soft">
            {word.accountingUnavailable
              ? "Trade history unavailable"
              : word.trades.length
                ? `${word.trades.length} ${word.trades.length === 1 ? "trade" : "trades"} · ${pending ? "waiting for CRE" : "your result"}`
                : "You sat this word out"}
          </p>
          <div className="mt-2 min-h-5">
            {!pending && !word.accountingUnavailable && word.trades.length > 0 && (
              <Money
                value={word.profit}
                signed
                className={`block text-sm font-bold ${word.profit > 0n ? "text-gain" : "text-ink"}`}
              />
            )}
          </div>
        </div>
        <span
          className={`flex shrink-0 items-center gap-1 rounded-lg border-2 px-2 py-1.5 font-headline text-sm ${pending ? "border-line bg-paper" : yes ? "rotate-[-5deg] border-gain bg-gain-tint text-gain" : "border-ink-soft bg-line text-ink-soft"}`}
        >
          {pending ? <Spinner /> : yes ? <Check size={16} /> : null}
          {pending ? "CRE" : word.state.toUpperCase()}
        </span>
        <ChevronDown size={18} className="shrink-0 group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-5 pb-6 pt-5 sm:px-6">
        {pending ? (
          <p role="status" className="text-sm leading-relaxed text-ink-soft">
            Chainlink CRE is checking both committed transcripts. This word is not final yet.
          </p>
        ) : null}
        {word.proof ? (
          <>
            <p className="mb-4 flex items-center gap-2 text-sm font-bold">
              <ShieldCheck size={18} className="text-sky" />
              {word.proof.specimen
                ? "Chainlink CRE proof preview"
                : pending
                  ? "Transcript verified against the onchain roots"
                  : "Verified by Chainlink CRE"}
            </p>
            {word.proof.engines.map((engine) => (
              <div key={engine.engine} className="mb-3 rounded-2xl bg-paper p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-bold tracking-wide text-ink-soft">
                  <span>
                    ENGINE {engine.engine} · {engine.engine === "A" ? "WHISPER" : "VOSK"}
                  </span>
                  <span>
                    {timestamp(engine.startMs)}–{timestamp(engine.endMs)}
                  </span>
                </div>
                <p className="text-sm leading-7">
                  {engine.tokens.map(([token, start, end]) => (
                    <span
                      key={`${start}-${end}-${token}`}
                      title={`${timestamp(start)}–${timestamp(end)}`}
                    >
                      {matchesTarget(word.text.toLowerCase(), token) ? (
                        <mark className="rounded bg-gain-tint px-1 font-bold text-gain">
                          {token}
                        </mark>
                      ) : (
                        token
                      )}{" "}
                    </span>
                  ))}
                </p>
                {word.state === "No" && (
                  <p className="mt-2 text-xs font-semibold text-ink-soft">
                    No agreed match across {engine.verifiedChunkCount} / {engine.totalChunkCount}{" "}
                    verified chunks. This excerpt alone is not the proof.
                  </p>
                )}
                <p className="mt-3 break-all font-mono text-[10px] leading-relaxed text-ink-soft">
                  Root: {engine.root}
                </p>
              </div>
            ))}
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
              <Fingerprint size={16} className="shrink-0" />
              Both Merkle roots were committed before trading. The outcome could not be edited
              afterwards.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs font-semibold">
              {word.proof.resolveTxUrl ? (
                <a
                  className="inline-flex min-h-11 items-center gap-1 underline underline-offset-4"
                  href={word.proof.resolveTxUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  CRE transaction <ExternalLink size={13} />
                </a>
              ) : (
                <span className="py-3 text-ink-soft">
                  {word.proof.specimen
                    ? "DEV evidence · not broadcast"
                    : "Awaiting transaction evidence"}
                </span>
              )}
              {word.proof.commitmentTxUrl && (
                <a
                  className="inline-flex min-h-11 items-center gap-1 underline"
                  href={word.proof.commitmentTxUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  View commitment <ExternalLink size={13} />
                </a>
              )}
              <span className="rounded-full bg-sky-tint px-2 py-1 text-ink">
                {word.proof.mode === "simulation" ? "CRE simulation mode" : "CRE DON mode"}
              </span>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-soft">
            {word.proofStatus ?? "Proof evidence is not available in this read model yet."}
          </p>
        )}
        {word.roots && !word.proof && (
          <div className="mt-4 space-y-2 break-all font-mono text-[10px] text-ink-soft">
            <p>Root A: {word.roots[0]}</p>
            <p>Root B: {word.roots[1]}</p>
          </div>
        )}
        {(word.evidenceHash || word.proof?.evidenceHash) && (
          <p className="mt-3 break-all font-mono text-[10px] text-ink-soft">
            Evidence hash: {word.evidenceHash ?? word.proof?.evidenceHash}
          </p>
        )}
        {!word.proof && word.resolveTxUrl && (
          <a
            href={word.resolveTxUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs underline"
          >
            CRE transaction <ExternalLink size={13} />
          </a>
        )}
        {!word.proof && word.settlementMode && (
          <p className="mt-3 text-xs text-ink-soft">CRE {word.settlementMode} mode</p>
        )}
        {onRedeem && redeemable > 0n && (
          <button
            type="button"
            onClick={() => onRedeem(word.id)}
            disabled={redeemSending}
            className="mt-4 min-h-11 rounded-full border-2 border-ink bg-ink px-4 text-sm font-bold text-paper disabled:opacity-50"
          >
            {redeemSending ? "Redeeming…" : "Redeem this word"} · {amount(redeemable)} AUSD TESTNET
          </button>
        )}
        <h4 className="mt-5 border-t border-line pt-4 text-xs font-bold tracking-wider uppercase">
          Your trades
        </h4>
        {word.accountingUnavailable && (
          <p className="mt-2 text-sm text-ink-soft">
            Trade history and P/L unavailable: Envio is offline.
          </p>
        )}
        {word.trades.length ? (
          <ul className="mt-2 divide-y divide-line">
            {word.trades.map((trade) => (
              <li key={trade.id} className="flex flex-wrap justify-between gap-2 py-3 text-xs">
                <span className="font-semibold">
                  {["Bought YES", "Cashed out YES", "Bought NO", "Cashed out NO"][trade.side]} ·{" "}
                  {shares(trade.tokenAmount)} shares
                </span>
                <span>
                  {price(trade.priceBps)} · {amount(trade.ausdAmount)} AUSD{" "}
                  <b className="text-[9px]">TESTNET</b>
                </span>
                {trade.txUrl && (
                  <a
                    href={trade.txUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-11 items-center gap-1 underline"
                  >
                    Trade transaction <ExternalLink size={12} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {word.accountingUnavailable
              ? "Waiting for indexed trade history."
              : "No trades on this word."}
          </p>
        )}
      </div>
    </details>
  );
}
