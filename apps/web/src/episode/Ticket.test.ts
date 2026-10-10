import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
