import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { SCREENS_DIR } from "./helpers";

// Offline: the dev-only /design specimen drives the real stage, board and ticket through
// pre-roll, the bets close and playback on a sample clock (no studio, no chain).
test("bets open only before kickoff; the clip stays hidden until it plays; SAID still cashes out", async ({
  page,
}) => {
  await page.goto("/design");
  const board = page.getByRole("region", { name: "Word board" });
  const stage = page.getByRole("region", { name: "Clip" });
  await expect(board).toBeVisible();

  await specimen(page, "Pre-roll");
  await expect(stage.getByText("Clip hidden until kickoff")).toBeVisible();
  await expect(board.getByText(/Bets close in 0:1\d/)).toBeVisible();
  await expect(stage.getByText(/Bets close in 0:\d\d/)).toBeVisible();
  await shot(page, "gate-01-preroll-412");
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(stage.getByText("Clip hidden until kickoff")).toBeVisible();
  await shot(page, "gate-01b-preroll-1280");
  await page.setViewportSize({ width: 412, height: 915 });

  const card = board.getByRole("button", { name: /^Championship, .*, open/ });
  await card.click();
  const ticket = page.getByRole("dialog", { name: "Ticket: Championship" });
  await expect(ticket.getByText(/Bets close in 0:\d\d/)).toBeVisible();
  await expect(ticket.getByRole("button", { name: /^Buy YES/ })).toBeEnabled();
  await shot(page, "gate-02-preroll-ticket-412");

  // The open ticket turns into the locked notice the instant bets close.
  await expect(ticket.getByText("Bets locked")).toBeVisible({ timeout: 20_000 });
  await expect(ticket.getByRole("button", { name: /^Buy/ })).toHaveCount(0);
  await expect(board.getByText("Bets locked — watch")).toBeVisible();
  await expect(stage.getByText("Bets locked — watch")).toBeVisible();
  await shot(page, "gate-03-preroll-locked-412");
  await ticket.getByRole("button", { name: "Close ticket" }).click();
  await expect(ticket).toHaveCount(0);

  // Kickoff: the frame unblurs and plays; unflagged words stay locked.
  await expect(page.getByRole("timer")).toHaveAttribute("aria-label", /left in the clip/, {
    timeout: 30_000,
  });
  await expect(stage.getByText("Clip hidden until kickoff")).toHaveCount(0);
  await expect(board.getByRole("button", { name: /, open, bets locked/ }).first()).toBeVisible();

  // A held word is said: its cash-out works during playback.
  await specimen(page, "Cash out");
  const cashOut = page.getByRole("dialog", { name: "Ticket: Pressure" });
  await expect(cashOut.getByRole("button", { name: /^Cash out ·/ })).toBeEnabled();
  await expect(board.getByRole("button", { name: /^Pressure, 98¢, said/ })).toBeVisible();
  await shot(page, "gate-04-live-cashout-412");

  await page.setViewportSize({ width: 1280, height: 800 });
  const dock = page.getByRole("region", { name: "Ticket: Pressure" });
  await expect(dock.getByRole("button", { name: /^Cash out ·/ })).toBeEnabled();
  await shot(page, "gate-05-live-cashout-1280");
});

/** Presses one of the specimen's dev controls, then folds the panel away when nothing covers it. */
async function specimen(page: Page, control: string) {
  const toggle = page.getByRole("button", { name: "Dev specimen" });
  await toggle.click();
  await page.getByRole("button", { name: control, exact: true }).click();
  // "Cash out" opens a ticket sheet over the page shortly after; then the panel stays open.
  await toggle.click({ timeout: 2_000 }).catch(() => {});
}

/** Viewport captures from the top: a full-page capture misplaces the fixed sheet and sticky header. */
async function shot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await mkdir(SCREENS_DIR, { recursive: true });
  await page.screenshot({ path: join(SCREENS_DIR, `${name}.png`) });
}
