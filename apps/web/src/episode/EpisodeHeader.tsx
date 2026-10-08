import { Logo } from "@/ui/Logo";
import { SoundToggle } from "@/ui/SoundToggle";
import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";
import { BALANCE_ANCHOR, useEpisodeFx } from "./EpisodeFx";
import { RollingAusd } from "./RollingAusd";

export type EpisodeHeaderProps = {
  /** Short episode tag, e.g. "Episode 14". */
  episode: string;
  /** Clip title as curated. */
  title: string;
  /** Player AUSD balance in 6-decimal units; undefined while it loads. Counts when it changes. */
  balanceMicro?: bigint;
};

/**
 * S3 top bar: mark, what is playing, the player's TESTNET balance (the coin-flight target) and the
 * mute switch. Sticky on phones so the balance is in view when coins land.
 */
export function EpisodeHeader({ episode, title, balanceMicro }: EpisodeHeaderProps) {
  const { anchor } = useEpisodeFx();
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2.5 border-b-2 border-ink bg-paper px-6 md:px-8 lg:static lg:h-[76px] lg:gap-4 lg:border-b-0 xl:px-12">
      <Logo variant="mark" height={38} className="shrink-0 lg:hidden" />
      <Logo variant="full" height={40} className="hidden shrink-0 lg:block" />
      <span aria-hidden className="hidden h-9 w-0.5 rounded-full bg-ink/15 lg:block" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold uppercase leading-4 tracking-[0.1em] text-ink-soft lg:text-[12px]">
          {episode}
        </p>
        <p className="font-headline truncate text-[16px] leading-5 lg:text-[24px] lg:leading-7">
          {title}
        </p>
      </div>
      <div
        ref={anchor(BALANCE_ANCHOR)}
        className="sticker flex h-11 shrink-0 items-center gap-1 rounded-full py-1 pr-3 pl-1 lg:h-12 lg:gap-2 lg:pr-4"
      >
        <Voxel name="money-2" size={30} className="size-7 -rotate-6 lg:size-9" />
        <span className="flex flex-col items-start">
          <span className="flex items-baseline gap-1 leading-none">
            <span className="sr-only">Balance </span>
            {balanceMicro === undefined ? (
              <span className="font-headline text-[16px] lg:text-[20px]">–</span>
            ) : (
              <RollingAusd
                micro={balanceMicro}
                className="font-headline tabular text-[16px] lg:text-[20px]"
              />
            )}
            <span className="hidden text-[11px] font-bold text-ink-soft lg:inline">AUSD</span>
          </span>
          <span className="mt-0.5 text-[9.5px] font-extrabold leading-none tracking-[0.08em] text-ink-soft lg:hidden">
            AUSD · <span className="text-ink">TESTNET</span>
          </span>
        </span>
      </div>
      <span className="hidden lg:contents">
        <TestnetPill />
      </span>
      <SoundToggle />
    </header>
  );
}
