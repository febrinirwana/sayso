/** Display formatting for prices, balances, shares and clocks. Pure; every screen shares these. */

const AUSD_DECIMALS = 6n;
const MICRO_PER_AUSD = 10n ** AUSD_DECIMALS;
const MICRO_PER_CENT = MICRO_PER_AUSD / 100n;
const MINUS = "\u2212";

const thousands = new Intl.NumberFormat("en-US", { useGrouping: true });
const shareFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  roundingMode: "trunc",
});

/** A word price in whole cents, 0 to 100: `62` → `"62¢"`. Anything else is a caller bug. */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0 || cents > 100) {
    throw new RangeError(`price must be an integer 0..100 cents, got ${cents}`);
  }
  return `${cents}¢`;
}

/** 6-decimal AUSD units to two decimals, truncated toward zero: `12_349_999n` → `"12.34 AUSD"`. */
export function formatAusd(micro: bigint): string {
  const negative = micro < 0n;
  const cents = (negative ? -micro : micro) / MICRO_PER_CENT;
  const whole = thousands.format(cents / 100n);
  const fraction = (cents % 100n).toString().padStart(2, "0");
  const sign = negative && cents > 0n ? MINUS : "";
  return `${sign}${whole}.${fraction} AUSD`;
}

/** A profit or loss with an explicit sign: `"+6.40 AUSD"`, `"−2.10 AUSD"`, `"0.00 AUSD"`. */
export function formatAusdChange(micro: bigint): string {
  const text = formatAusd(micro);
  return micro >= MICRO_PER_CENT ? `+${text}` : text;
}

/** Outcome-token amounts as players read them: `40` → `"40"`, `1234.567` → `"1,234.56"`. */
export function formatShares(shares: number): string {
  if (!Number.isFinite(shares) || shares < 0) {
    throw new RangeError(`shares must be a finite non-negative number, got ${shares}`);
  }
  return shareFormat.format(shares);
}

/** Countdown seconds as `m:ss`, rounding up so "0:01" shows until time is actually up. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(`seconds must be a finite non-negative number, got ${seconds}`);
  }
  const total = Math.ceil(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
}
