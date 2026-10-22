import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/shell/AppShell";
import { AccountScreen } from "../account/AccountScreen";
import { ArenaScreen } from "../arena/ArenaScreen";
import { JoinScreen } from "./JoinScreen";

const noop = () => {};
const join = {
  currentUrl: "https://sayso.example/join",
  onJoin: noop,
  onSignIn: noop,
  onRetry: noop,
};
describe("player-visible screen states", () => {
  it("offers an optional passkey name without disabling one-tap join", () => {
    const html = renderToStaticMarkup(h(JoinScreen, { ...join, state: { status: "idle" } }));
    expect(html).toContain("Name this passkey");
    expect(html).toContain("password manager");
    expect(html).not.toContain("required");
    expect(html).not.toMatch(/ disabled(?:=""|>)/);
  });
  it("does not ask to name an existing passkey on sign-in retry", () => {
    const html = renderToStaticMarkup(
      h(JoinScreen, {
        ...join,
        state: { status: "error", message: "Prompt dismissed.", action: "signIn" },
      }),
    );
    expect(html).not.toContain("Name this passkey");
  });
  it("shows expected and found addresses after choosing another passkey", () => {
    const html = renderToStaticMarkup(
      h(AccountScreen, {
        address: "0x123456000000000000000000000000000000abcd",
        balances: { monWei: 0n, ausd: 10000000n },
        copyState: "idle",
        restoreState: "mismatch",
        restoredAddress: "0x987654000000000000000000000000000000dcba",
        onCopy: noop,
        onRestoreCheck: noop,
        onSignOut: noop,
      }),
    );
    expect(html).toContain("Expected");
    expect(html).toContain("0x1234…abcd");
    expect(html).toContain("Found");
    expect(html).toContain("0x9876…dcba");
  });
  it("disables passkey actions while a prompt is pending", () => {
    const html = renderToStaticMarkup(h(JoinScreen, { ...join, state: { status: "waiting" } }));
    expect(html).toContain("disabled");
    expect(html).toContain("Check your passkey prompt");
  });
  it("explains unsupported browsers without a fake scannable QR", () => {
    const html = renderToStaticMarkup(
      h(JoinScreen, { ...join, state: { status: "prf-unavailable" } }),
    );
    expect(html).toContain(join.currentUrl);
    expect(html).toContain("phone");
  });
  it("offers retry when joining fails", () => {
    const html = renderToStaticMarkup(
      h(JoinScreen, { ...join, state: { status: "error", message: "Prompt was dismissed." } }),
    );
    expect(html).toContain("Prompt was dismissed.");
    expect(html).toContain("Try again");
  });
  it("lets a lone player start an episode and prevents double starting", () => {
    const common = {
      nickname: "Sunny Duck",
      starter: { status: "unclaimed" as const },
      recentEpisodes: [],
      firstTime: true,
      onStart: noop,
      onJoin: noop,
      onResults: noop,
      nowMs: 0,
    };
    const idle = renderToStaticMarkup(h(ArenaScreen, { ...common, episode: { status: "idle" } }));
    const busy = renderToStaticMarkup(
      h(ArenaScreen, { ...common, episode: { status: "starting" } }),
    );
    expect(idle).toContain("Start an episode");
    expect(busy).toContain("disabled");
    expect(busy).toContain("Setting the stage");
  });
  it("offers another kit after completion and waits for the caller quota to reopen", () => {
    const props = {
      nickname: "Sunny Duck",
      episode: { status: "idle" as const },
      recentEpisodes: [],
      firstTime: false,
      onStart: noop,
      onJoin: noop,
      onResults: noop,
      onClaimStarter: noop,
      nowMs: 1000,
    };
    const received = {
      status: "received" as const,
      amounts: { monWei: "500000000000000000", ausd: "10000000" },
      quota: { limit: 2, remaining: 1, nextClaimAtMs: null },
    };
    const available = renderToStaticMarkup(h(ArenaScreen, { ...props, starter: received }));
    expect(available).toContain("Claim again");
    expect(available).toContain("TESTNET");
    const waiting = renderToStaticMarkup(
      h(ArenaScreen, {
        ...props,
        starter: {
          ...received,
          quota: { limit: 2, remaining: 0, nextClaimAtMs: 2000 },
        },
      }),
    );
    expect(waiting).not.toContain("Claim again");
    expect(waiting).toContain("Next claim");
    const reopened = renderToStaticMarkup(
      h(ArenaScreen, {
        ...props,
        nowMs: 2000,
        starter: {
          ...received,
          quota: { limit: 2, remaining: 0, nextClaimAtMs: 2000 },
        },
      }),
    );
    expect(reopened).toContain("Claim again");
  });
  it("shows an exact large AUSD balance and active nav", () => {
    const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
    const html = renderToStaticMarkup(
      h(RouterContextProvider, {
        router,
        // biome-ignore lint/correctness/noChildrenProp: required typed children in a non-JSX Vitest file.
        children: h(AppShell, {
          active: "arena",
          balance: 9007199254740991000000n,
          nickname: "Sunny Duck",
          // biome-ignore lint/correctness/noChildrenProp: required typed children in a non-JSX Vitest file.
          children: "Round",
        }),
      }),
    );
    expect(html).toContain("9,007,199,254,740,991.00");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("TESTNET");
  });
  it("keeps the complete address and passkey restore instructions", () => {
    const html = renderToStaticMarkup(
      h(AccountScreen, {
        address: "0x0000000000000000000000000000000000000001",
        balances: { monWei: 500000000000000000n, ausd: 10000000n },
        copyState: "idle",
        restoreState: "idle",
        onCopy: noop,
        onRestoreCheck: noop,
        onSignOut: noop,
      }),
    );
    expect(html).toContain("0x0000000000000000000000000000000000000001");
    expect(html).toContain("same passkey");
    expect(html).toContain("10.00");
    expect(html).toContain("0.50");
    expect(html).toContain("elevenlabs.io");
  });
});
