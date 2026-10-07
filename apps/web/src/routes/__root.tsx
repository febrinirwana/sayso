import { createRootRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="font-display-wide text-5xl">Nobody said that.</p>
      <p className="text-ink-soft">This page doesn't exist.</p>
      <Link
        to="/"
        className="sticker pressable rounded-full bg-ink px-6 py-3 font-semibold text-paper"
      >
        Back to SAYSO
      </Link>
    </main>
  );
}
