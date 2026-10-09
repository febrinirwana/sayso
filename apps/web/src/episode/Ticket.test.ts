import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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
