import { Logo } from "@/ui/Logo";
import { SoundToggle } from "@/ui/SoundToggle";
import { TestnetPill } from "@/ui/TestnetPill";
import { formatAusd } from "./format";

type EpisodeHeaderProps = {
  /** Short episode tag, e.g. "Episode 14". */
  episode: string;
  /** Clip title as curated. */
  title: string;
  /** Player AUSD balance in 6-decimal units; undefined while it loads. */
  balanceMicro?: bigint;
};

/** S3 top bar: mark, what is playing, the player's TESTNET balance and the mute switch. */
export function EpisodeHeader({ episode, title, balanceMicro }: EpisodeHeaderProps) {
  return (
    <header className="flex items-center gap-3 px-4 py-2.5">
      <Logo variant="mark" height={36} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-soft">
          {episode}
        </p>
        <p className="truncate font-display-wide text-[17px] leading-6">{title}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className="tabular text-[13px] font-semibold leading-4">
          <span className="sr-only">Balance </span>
          {balanceMicro === undefined ? "– AUSD" : formatAusd(balanceMicro)}
        </p>
        <TestnetPill />
      </div>
      <SoundToggle />
    </header>
  );
}
