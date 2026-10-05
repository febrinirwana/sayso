export const PRICE_PRECISION = 10_000;
export const TICK = 100;
export const TOKEN_DECIMALS = 6;
export const ONE = 1_000_000n;
export const MIN_SIZE = ONE;
export const MAX_SIZE = 10_000_000_000n;
/** AUSD base units per Kuru quoteSize unit (1e6 / pricePrecision); Kuru settles quote only in these steps. */
export const QUOTE_UNIT = 100n;

const DECIMAL = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

export function priceToKuru(price: string): number {
  if (!DECIMAL.test(price)) {
    throw new Error("Invalid decimal price");
  }
  const [whole = "", rawFraction = ""] = price.split(".");
  const fraction = rawFraction.replace(/0+$/, "");
  if (fraction.length > 2) {
    throw new Error("Price must be on the one-cent tick");
  }
  const cents = BigInt(whole || "0") * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents < 1n || cents > 99n) {
    throw new Error("Price must be between 0.01 and 0.99");
  }
  return centsToKuru(Number(cents));
}

export function centsToKuru(cents: number): number {
  if (!Number.isInteger(cents) || cents < 1 || cents > 99) {
    throw new Error("Cents must be an integer from 1 to 99");
  }
  return cents * TICK;
}

export function kuruToCents(p: number): number {
  if (!Number.isInteger(p) || p < TICK || p >= PRICE_PRECISION || p % TICK !== 0) {
    throw new Error("Invalid Kuru price: expected a tick from 100 to 9900");
  }
  return p / TICK;
}

export function kuruToPrice(p: number): string {
  return `0.${kuruToCents(p).toString().padStart(2, "0")}`;
}

export function formatCents(p: number): string {
  return `${kuruToCents(p)}¢`;
}

export function sizeToKuru(amount: bigint): bigint {
  if (amount < MIN_SIZE || amount > MAX_SIZE) {
    throw new Error("Size must be between 1 and 10000 tokens");
  }
  return amount;
}

export function parseAmount(text: string): bigint {
  if (!DECIMAL.test(text)) {
    throw new Error("Invalid unsigned decimal amount");
  }
  const [whole = "", fraction = ""] = text.split(".");
  if (fraction.length > TOKEN_DECIMALS) {
    throw new Error("Amount exceeds six decimal places");
  }
  return BigInt(whole || "0") * ONE + BigInt(fraction.padEnd(TOKEN_DECIMALS, "0"));
}

export function formatAmount(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const magnitude = units < 0n ? -units : units;
  const whole = magnitude / ONE;
  const fraction = (magnitude % ONE).toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

function quoteNumerator(size: bigint, price: number): bigint {
  kuruToCents(price);
  if (size < 0n) {
    throw new Error("Quote size cannot be negative");
  }
  return size * BigInt(price);
}

export function quoteCost(size: bigint, price: number): bigint {
  const numerator = quoteNumerator(size, price);
  const step = BigInt(PRICE_PRECISION) * QUOTE_UNIT;
  return ((numerator + step - 1n) / step) * QUOTE_UNIT;
}

export function quoteProceeds(size: bigint, price: number): bigint {
  const step = BigInt(PRICE_PRECISION) * QUOTE_UNIT;
  return (quoteNumerator(size, price) / step) * QUOTE_UNIT;
}

export function noCost(size: bigint, bestBid: number): bigint {
  return size - quoteProceeds(size, bestBid);
}
