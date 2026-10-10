// New positions open only before playback. At this instant the web closes the trade ticket and
// the house starts pulling every word's quotes, which must all confirm before startsAt, so
// nobody can buy after hearing the clip and no open ticket faces an empty book.
export const TRADING_CLOSE_LEAD_MS = 20_000;

export function tradingClosesAtMs(startsAtMs: number): number {
  return startsAtMs - TRADING_CLOSE_LEAD_MS;
}
