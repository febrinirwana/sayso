type TestnetPillProps = { className?: string };

/** Static label shown wherever a balance, price or payout appears. Outlined, not raised: it is not pressable. */
export function TestnetPill({ className }: TestnetPillProps) {
  return (
    <span
      className={[
        "inline-flex h-7 shrink-0 items-center rounded-full border-2 border-ink bg-paper px-2.5 text-[11px] font-bold leading-none tracking-[0.08em] text-ink",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      TESTNET
    </span>
  );
}
