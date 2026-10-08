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
  it("disables passkey actions while a prompt is pending", () => {
    const html = renderToStaticMarkup(h(JoinScreen, { ...join, state: { status: "waiting" } }));
    expect(html).toContain("disabled");
    expect(html).toContain("Check your passkey prompt");
  });
  it("explains unsupported browsers without a fake scannable QR", () => {
    const html = renderToStaticMarkup(
      h(JoinScreen, { ...join, state: { status: "prf-unavailable" } }),
    );
    expect(html).toContain("QR placeholder");
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
      starter: { status: "already-claimed" as const },
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
  it("shows an exact large AUSD balance and active nav", () => {
    const html = renderToStaticMarkup(
      h(AppShell, {
        active: "arena",
        balance: 9007199254740991000000n,
        nickname: "Sunny Duck",
        // biome-ignore lint/correctness/noChildrenProp: required typed children in a non-JSX Vitest file.
        children: "Round",
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
