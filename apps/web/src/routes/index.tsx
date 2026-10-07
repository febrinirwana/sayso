import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-6 px-4">
      <span className="sticker w-fit rounded-full px-3 py-1 text-sm font-semibold">TESTNET</span>
      <h1 className="font-display-wide text-5xl leading-[1.05] md:text-7xl">
        Bet on the words before they're spoken.
      </h1>
      <p className="max-w-prose text-lg text-ink-soft">
        Six words. One clip. When a word is said, its card flips within a block.
      </p>
    </main>
  );
}
