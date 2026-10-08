import type { RecordWordState } from "./types";

export function amount(value: bigint, signed = false): string {
  const absolute = value < 0n ? -value : value;
  const whole = (absolute / 1_000_000n).toLocaleString("en-US");
  const fraction = ((absolute % 1_000_000n) / 10_000n).toString().padStart(2, "0");
  return `${value < 0n ? "−" : signed && value > 0n ? "+" : ""}${whole}.${fraction}`;
}
export function shares(value: bigint): string {
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return `${(value / 1_000_000n).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""}`;
}
export function price(bps: number): string {
  return `${bps / 100}¢`;
}
export function positionValue(
  yes: bigint,
  no: bigint,
  state: RecordWordState,
  yesBps: number,
): bigint {
  if (state === "Yes") return yes;
  if (state === "No") return no;
  if (state === "Void") return yes / 2n + no / 2n;
  return (yes * BigInt(yesBps) + no * BigInt(10_000 - yesBps)) / 10_000n;
}
export function timestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}.${Math.floor(
    (ms % 1000) / 10,
  )
    .toString()
    .padStart(2, "0")}`;
}
