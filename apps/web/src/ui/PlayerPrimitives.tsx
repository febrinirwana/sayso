import type { ReactNode } from "react";
import { Voxel } from "./Voxel";

export type TokenAmountProps = { amount: bigint; symbol: "AUSD" | "MON"; className?: string };
/** Integer-only display: never rounds money through a floating-point Number. */
export function formatTokenAmount(amount: bigint, decimals = 6): string {
  const negative = amount < 0n;
  const value = negative ? -amount : amount;
  const unit = 10n ** BigInt(decimals);
  const whole = (value / unit).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = ((value % unit) / (unit / 100n)).toString().padStart(2, "0");
  return `${negative ? "−" : ""}${whole}.${fraction}`;
}
export function TokenAmount({ amount, symbol, className }: TokenAmountProps) {
  return (
    <span className={className}>
      <span className="tabular">{formatTokenAmount(amount, symbol === "MON" ? 18 : 6)}</span>{" "}
      <span>{symbol}</span> <span className="text-[10px] font-semibold tracking-wide">TESTNET</span>
    </span>
  );
}
export type PlayerAvatarProps = { nickname: string; size?: number };
export function PlayerAvatar({ nickname, size = 44 }: PlayerAvatarProps) {
  const names = ["duck", "alien", "pixle", "smiley-face", "globe", "star"] as const;
  let hash = 0;
  for (const char of nickname) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border-2 border-ink bg-sun-tint"
      style={{ width: size, height: size }}
    >
      <Voxel name={names[hash % names.length] ?? "duck"} size={Math.round(size * 0.8)} />
    </span>
  );
}
export type PageHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
};
export function PageHeading({ eyebrow, title, description, children }: PageHeadingProps) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-ink-soft">
          {eyebrow}
        </p>
        <h1 className="font-headline text-[clamp(36px,4vw,60px)] leading-[1.08]">{title}</h1>
        {description && <p className="mt-3 max-w-xl text-base text-ink-soft">{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function CreditFooter() {
  return (
    <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-xs text-ink-soft">
      <span>SAYSO · Monad TESTNET · No real money.</span>
      <span>
        Sound effects:{" "}
        <a
          className="inline-flex min-h-11 items-center underline underline-offset-4"
          href="https://elevenlabs.io"
          target="_blank"
          rel="noreferrer"
        >
          elevenlabs.io
        </a>
      </span>
    </footer>
  );
}
