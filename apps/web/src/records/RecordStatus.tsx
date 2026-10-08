import type { Redemption } from "./hooks";

export function RecordStatus({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="mb-6 rounded-2xl border-2 border-ink bg-sky-tint p-4 text-sm leading-relaxed"
    >
      {message}
    </p>
  );
}
export function RedeemReceipts({ redemption }: { redemption: Redemption }) {
  return (
    <div aria-live="polite" className="mb-6 space-y-2">
      {redemption.error && (
        <p className="rounded-2xl border-2 border-ink bg-paper p-4 text-sm break-words">
          Redemption failed: {redemption.error}
        </p>
      )}
      {redemption.failedTxUrl && (
        <a
          className="block min-h-11 text-xs underline"
          href={redemption.failedTxUrl}
          target="_blank"
          rel="noreferrer"
        >
          Failed redemption transaction
        </a>
      )}
      {redemption.transactions.map((transaction) => (
        <a
          className="block min-h-11 break-all text-xs underline"
          key={transaction.hash}
          href={transaction.url}
          target="_blank"
          rel="noreferrer"
        >
          Word {transaction.wordId} redeemed · {transaction.hash}
        </a>
      ))}
    </div>
  );
}
