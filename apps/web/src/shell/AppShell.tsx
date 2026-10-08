import { Gamepad2, Layers3, Trophy, UserRound } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { play } from "@/sound";
import { Logo } from "@/ui/Logo";
import { PlayerAvatar, TokenAmount } from "@/ui/PlayerPrimitives";
import { SoundToggle } from "@/ui/SoundToggle";

export type AppSection = "arena" | "portfolio" | "leaderboard" | "account";
export type AppShellProps = {
  active: AppSection;
  balance: bigint;
  nickname: string;
  children: ReactNode;
};
const sections = [
  { id: "arena", label: "Arena", icon: Gamepad2, href: "/design/player?state=arena-live" },
  { id: "portfolio", label: "Portfolio", icon: Layers3, href: "/design/records?screen=portfolio" },
  {
    id: "leaderboard",
    label: "Leaderboard",
    icon: Trophy,
    href: "/design/records?screen=leaderboard",
  },
  { id: "account", label: "Account", icon: UserRound, href: "/design/player?state=account" },
] as const;

/** Presentational in-app frame. Specimen navigation is replaced at the production route cutover. */
export function AppShell({ active, balance, nickname, children }: AppShellProps) {
  const reduced = useReducedMotion();
  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b-2 border-ink bg-paper">
        <div className="mx-auto flex max-w-[1616px] items-center justify-between gap-3 px-6 py-5 md:px-8 lg:px-12">
          <a
            href="/"
            aria-label="SAYSO home"
            className="inline-flex min-h-11 shrink-0 items-center"
          >
            <Logo height={28} className="h-7 w-auto md:h-9" />
          </a>
          <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
            {sections.map(({ id, label, href }) => (
              <a
                key={id}
                href={href}
                aria-current={active === id ? "page" : undefined}
                onClick={() => play("tap")}
                className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${active === id ? "bg-ink text-paper" : "text-ink-soft hover:bg-sun-tint"}`}
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <div className="rounded-full border-2 border-ink bg-sun-tint px-3 py-2.5 font-headline text-xs md:px-4 md:text-sm">
              <TokenAmount amount={balance} symbol="AUSD" />
            </div>
            <a
              href="/design/player?state=account"
              className="hidden min-h-11 items-center gap-2 text-sm font-semibold xl:flex"
            >
              <PlayerAvatar nickname={nickname} size={40} />
              {nickname}
            </a>
            <SoundToggle />
          </div>
        </div>
      </header>
      <main
        id="main-content"
        className="mx-auto max-w-[1616px] px-6 pt-8 pb-28 md:px-8 md:pt-10 lg:px-12 lg:pb-10"
      >
        {children}
      </main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-ink bg-paper pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-4 px-3 py-2">
          {sections.map(({ id, label, icon: Icon, href }) => (
            <a
              key={id}
              href={href}
              aria-current={active === id ? "page" : undefined}
              onClick={() => play("tap")}
              className="relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold"
            >
              {active === id && (
                <motion.span
                  layoutId="player-active-tab"
                  transition={{ duration: reduced ? 0 : 0.18, ease: [0.23, 1, 0.32, 1] }}
                  className="absolute inset-0 rounded-2xl border-2 border-ink bg-sun-tint"
                />
              )}
              <Icon size={21} className="relative" aria-hidden />
              <span className="relative">{label}</span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
