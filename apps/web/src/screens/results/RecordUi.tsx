import { ArrowDown, ArrowUp, LoaderCircle, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { play } from "@/sound";
import { amount } from "./format";

export function Money({
  value,
  signed = false,
  className = "",
}: {
  value: bigint;
  signed?: boolean;
  className?: string;
}) {
  return (
    <span className={`tabular ${className}`}>
      <span>{amount(value, signed)}</span>
      <span className="ml-1.5 text-[0.5em] font-semibold tracking-normal">AUSD</span>
      <span className="ml-2 inline-block align-middle text-[10px] font-bold tracking-[0.08em] text-ink-soft">
        TESTNET
      </span>
    </span>
  );
}
export function RecordHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="mb-2 text-xs font-bold tracking-[0.16em] uppercase text-ink-soft">
          {eyebrow}
        </p>
        <h1 className="font-headline text-[clamp(40px,4vw,64px)] leading-[1.08]">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
          {description}
        </p>
      </div>
      {children}
    </header>
  );
}
export function RecordTabs<T extends string>({
  value,
  items,
  onChange,
  label,
}: {
  value: T;
  items: readonly { id: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <fieldset
      aria-label={label}
      className="inline-flex max-w-full gap-1 rounded-full border-2 border-ink bg-white p-1"
    >
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-pressed={value === item.id}
          onClick={() => {
            play("tap");
            onChange(item.id);
          }}
          className={`min-h-11 rounded-full px-5 text-sm font-semibold ${value === item.id ? "bg-ink text-paper" : "text-ink"}`}
        >
          {item.label}
        </button>
      ))}
    </fieldset>
  );
}
export function Spinner() {
  return (
    <LoaderCircle
      aria-hidden="true"
      size={18}
      className="shrink-0 animate-spin motion-reduce:animate-none"
    />
  );
}
export function RankChange({ rank, previousRank }: { rank: number; previousRank: number | null }) {
  const difference = previousRank === null ? 0 : previousRank - rank;
  return (
    <span
      role="img"
      className={`inline-flex items-center gap-1 text-xs font-bold ${difference > 0 ? "text-gain" : "text-ink-soft"}`}
      aria-label={
        previousRank === null
          ? "New player"
          : difference === 0
            ? "Rank unchanged"
            : `${difference > 0 ? "Up" : "Down"} ${Math.abs(difference)} places`
      }
    >
      {difference > 0 ? (
        <ArrowUp size={14} />
      ) : difference < 0 ? (
        <ArrowDown size={14} />
      ) : (
        <Minus size={14} />
      )}
      {previousRank === null ? "New" : Math.abs(difference) || "—"}
    </span>
  );
}
