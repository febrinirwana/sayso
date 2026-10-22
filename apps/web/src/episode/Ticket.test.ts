import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountContext } from "@/account/AccountProvider";
import type { Account } from "@/account/types";
import { betsView } from "./bets";
import { Ticket } from "./Ticket";

describe("SAID cash-out receipt feedback", () => {
  it.each([
    ["sending", "Sending…"],
    ["filled", "Filled!"],
  ] as const)("keeps %s visible after the sell consumes the bid and holding", (status, label) => {
    const html = renderToStaticMarkup(
      createElement(Ticket, {
        word: "block",
        state: "said",
        yesCents: 0,
        cashOutBidCents: null,
        status,
      }),
    );
    expect(html).toContain(label);
    expect(html).not.toContain("Hold until settled");
    expect(html).not.toContain("98¢");
  });

  it("does not offer a cash-out quote without an actual bid when idle", () => {
    const html = renderToStaticMarkup(
      createElement(Ticket, {
        word: "block",
        state: "said",
        yesCents: 0,
        position: { side: "yes", shares: 1.96 },
        cashOutBidCents: null,
      }),
    );
    expect(html).toContain("Hold until settled");
    expect(html).not.toContain("Cash out ·");
    expect(html).not.toContain("Filled!");
  });
});

describe("bets window on the ticket", () => {
  const render = (props: Partial<Parameters<typeof Ticket>[0]>) =>
    renderToStaticMarkup(
      createElement(Ticket, { word: "block", state: "open", yesCents: 50, ...props }),
    );

  it("counts down to the close on an open bet", () => {
    const html = render({ bets: betsView({ status: "open", closesInMs: 12_000 }, false) });
    expect(html).toContain("Bets close in 0:12");
    expect(html).toContain("Buy YES");
  });

  it("replaces the buy form with the locked notice once bets close", () => {
    const html = render({
      bets: betsView({ status: "closed" }, false),
      position: { side: "yes", shares: 2 },
      sellPositions: { yes: 2, no: 0 },
      onSell: () => {},
    });
    expect(html).toContain("Bets locked");
    expect(html).toContain("You hold 2 YES");
    expect(html).not.toContain("Buy YES");
    expect(html).not.toContain("Cash out");
  });

  it("keeps the SAID cash-out working after bets close", () => {
    const html = render({
      state: "said",
      yesCents: 98,
      cashOutBidCents: 98,
      position: { side: "yes", shares: 2 },
      bets: betsView({ status: "closed" }, false),
    });
    expect(html).toContain("Cash out ·");
    expect(html).not.toContain("Bets locked");
  });
});

describe("signing actions while the account is locked", () => {
  const none = () => {};
  const account = (status: Account["status"]): Account => ({
    status,
    address: "0xF278cF59F82eDcf871d630F28EcC8056f25C1cdb",
    nickname: "Test",
    signer: null,
    errorCode: null,
    unlocking: false,
    mismatch: null,
    join: async () => {},
    signIn: async () => {},
    unlock: async () => "ready",
    switchToFound: none,
    dismissMismatch: none,
    signOut: none,
    send: async () => {
      throw new Error("not used");
    },
  });
  const render = (status: Account["status"], props: Partial<Parameters<typeof Ticket>[0]>) =>
    renderToStaticMarkup(
      createElement(
        AccountContext.Provider,
        { value: account(status) },
        createElement(Ticket, { word: "block", state: "open", yesCents: 50, ...props }),
      ),
    );

  it("asks for the passkey instead of offering Buy", () => {
    const html = render("locked", {});
    expect(html).toContain("Unlock with passkey");
    expect(html).toContain("Then tap Buy again");
    expect(html).not.toContain("Buy YES");
  });

  it("keeps Buy for a ready account", () => {
    const html = render("ready", {});
    expect(html).toContain("Buy YES");
    expect(html).not.toContain("Unlock with passkey");
  });

  it("asks for the passkey instead of the SAID cash-out", () => {
    const html = render("locked", {
      state: "said",
      yesCents: 98,
      cashOutBidCents: 98,
      position: { side: "yes", shares: 2 },
    });
    expect(html).toContain("Unlock with passkey");
    expect(html).not.toContain("Cash out ·");
  });

  it("shows a single unlock and no sell buttons when holdings could be sold", () => {
    const html = render("locked", {
      sellPositions: { yes: 2, no: 0 },
      onSell: none,
    });
    expect(html.match(/Unlock with passkey/g)).toHaveLength(1);
    expect(html).not.toContain("Cash out 2 YES");
  });

  it("offers a sell on SAID NO holdings behind one unlock when the body has no action", () => {
    const html = render("locked", {
      state: "said",
      yesCents: 98,
      cashOutBidCents: null,
      sellPositions: { yes: 0, no: 3 },
      onSell: none,
    });
    expect(html.match(/Unlock with passkey/g)).toHaveLength(1);
    expect(html).not.toContain("Cash out 3 NO");
  });

  it("keeps an in-flight order's status visible", () => {
    const html = render("locked", { status: "sending" });
    expect(html).toContain("Sending…");
    expect(html).not.toContain("Unlock with passkey");
  });
});
