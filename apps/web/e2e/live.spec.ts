import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  addAuthenticator,
  clearSiteData,
  joinWithPasskey,
  readAddress,
  restoreWithPasskey,
  SCREENS_DIR,
  screenshot,
} from "./helpers";

const STUDIO_HEALTH_URL = process.env.SAYSO_STUDIO_HEALTH_URL ?? "http://127.0.0.1:3001/v1/health";
const REDEEM_SKIPPED =
  "Redeem skipped: settlement waits on CRE login (docs/BLOCKERS.md B02), so no word reaches YES onchain in this run.";

type Tx = { step: string; hash: string; url: string; atMs: number };
type Evidence = {
  startedAt: string;
  finishedAt?: string;
  failed?: string;
  address?: string;
  restoredAddress?: string;
  episodeId?: number;
  joinedDuring?: "pre-roll" | "live";
  word?: string;
  transactions: Tx[];
  timings: {
    buyReceiptMs?: number;
    flip?: { msAfterBuyReceipt: number; clipSeconds: number | null; clipDurationSeconds: number };
    cashOutReceiptMs?: number;
  };
  screenshots: string[];
  redeem: string;
};

test.describe("live episode on Monad testnet", () => {
  test.skip(
    process.env.SAYSO_E2E_LIVE !== "1",
    "Live path needs a running studio, funded drip and testnet; set SAYSO_E2E_LIVE=1 to run it.",
  );

  test.beforeAll(async () => {
    let response: Response;
    try {
      response = await fetch(STUDIO_HEALTH_URL, { signal: AbortSignal.timeout(5_000) });
    } catch (cause) {
      throw new Error(
        `Studio precondition failed: GET ${STUDIO_HEALTH_URL} is unreachable (${cause instanceof Error ? cause.message : String(cause)}). Start the studio (bun run --cwd apps/studio dev) before SAYSO_E2E_LIVE=1.`,
      );
    }
    if (!response.ok)
      throw new Error(
        `Studio precondition failed: GET ${STUDIO_HEALTH_URL} answered HTTP ${response.status}.`,
      );
  });

  test("join, drip, buy YES, see SAID, cash out, results, restore", async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const started = Date.now();
    const evidence: Evidence = {
      startedAt: new Date(started).toISOString(),
      transactions: [],
      timings: {},
      screenshots: [],
      redeem: REDEEM_SKIPPED,
    };
    const shot = async (name: string) => {
      evidence.screenshots.push(await screenshot(page, `live-${name}`));
    };
    try {
      await addAuthenticator(page, { hasPrf: true });
      await joinWithPasskey(page, "/account");
      evidence.address = await readAddress(page);

      // Arena: the starter drip lands and the TESTNET balance shows AUSD. In-app links only:
      // a full page load drops the memory-only passkey session by design.
      await navigate(page, "Arena", "/arena");
      await expect(page.getByText(/You.re ready to play\.|Starter kit claimed\./)).toBeVisible({
        timeout: 180_000,
      });
      await expect
        .poll(() => headerAusd(page), { timeout: 120_000, message: "AUSD balance never arrived" })
        .toBeGreaterThan(0);
      await shot("01-arena-funded");

      // Episode: open the running one, or start one with the Arena button.
      const enter = page.getByRole("button", { name: /Join now|Get ready/ });
      const start = page.getByRole("button", { name: "Start an episode" });
      await expect(enter.or(start)).toBeVisible({ timeout: 60_000 });
      if (!(await enter.isVisible())) {
        await expect(start).toBeEnabled({ timeout: 60_000 });
        if (!(await enter.isVisible())) await start.click();
      }
      await enter.click({ timeout: 180_000 });
      await page.waitForURL(/\/episode\/\d+$/);
      evidence.episodeId = Number(new URL(page.url()).pathname.split("/").pop());

      const board = page.getByRole("region", { name: "Word board" });
      await expect(board).toBeVisible({ timeout: 60_000 });
      const timer = page.getByRole("timer");
      await expect(timer).toBeVisible({ timeout: 60_000 });
      evidence.joinedDuring = (await timer.getAttribute("aria-label"))?.startsWith("Clip starts")
        ? "pre-roll"
        : "live";
      if (evidence.joinedDuring === "live")
        test.info().annotations.push({
          type: "note",
          description: "Joined after pre-roll; the buy happened while the clip was playing.",
        });

      // Buy YES on the first open word for the smallest preset (1 AUSD).
      const open = board.getByRole("button", { name: /, open(,|$)/ }).first();
      await expect(open).toBeVisible({ timeout: 60_000 });
      const word = ((await open.getAttribute("aria-label")) ?? "").split(",")[0] ?? "";
      evidence.word = word;
      await open.click();
      const ticket = page.getByRole("dialog", { name: `Ticket: ${word}` });
      await ticket.getByRole("button", { name: "1", exact: true }).click();
      const buy = ticket.getByRole("button", { name: /^Buy YES/ });
      await expect(buy).toBeEnabled({ timeout: 60_000 });
      await shot("02-ticket");
      const buyStarted = Date.now();
      await buy.click();
      await awaitReceipt(ticket, "buy", evidence, started);
      const buyReceipt = Date.now();
      evidence.timings.buyReceiptMs = buyReceipt - buyStarted;
      await shot("03-bought");
      await ticket.getByRole("button", { name: "Close ticket" }).click();

      // Wait for the held card to flip SAID; deadline is pre-roll + clip + 30 s, refined live.
      const card = board.getByRole("button", { name: new RegExp(`^${escapeRegExp(word)}, `) });
      await expect(card).toHaveAttribute("aria-label", /you hold/, { timeout: 60_000 });
      const flip = await awaitSaid(page, card);
      evidence.timings.flip = { msAfterBuyReceipt: Date.now() - buyReceipt, ...flip };
      await shot("04-said");

      // Cash out at the house SAID bid.
      await card.click();
      const cashOutTicket = page.getByRole("dialog", { name: `Ticket: ${word}` });
      const cashOut = cashOutTicket.getByRole("button", { name: /^Cash out ·/ });
      await expect(cashOut, "house SAID bid never reached the book").toBeEnabled({
        timeout: 60_000,
      });
      const cashOutStarted = Date.now();
      await cashOut.click();
      await awaitReceipt(cashOutTicket, "cash-out", evidence, started);
      evidence.timings.cashOutReceiptMs = Date.now() - cashOutStarted;
      await shot("05-cashed-out");
      await cashOutTicket.getByRole("button", { name: "Close ticket" }).click();

      // After close: results and portfolio.
      await expect(page.getByRole("link", { name: "See results" })).toBeVisible({
        timeout: 10 * 60_000,
      });
      await page.getByRole("link", { name: "See results" }).click();
      await page.waitForURL((url) => url.pathname === `/results/${evidence.episodeId}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 60_000 });
      await shot("06-results");
      await navigate(page, "Portfolio", "/portfolio");
      await expect(page.getByText("The word on your words.")).toBeVisible({ timeout: 60_000 });
      await shot("07-portfolio");

      test.info().annotations.push({ type: "skip", description: REDEEM_SKIPPED });

      await clearSiteData(page);
      evidence.restoredAddress = await restoreWithPasskey(page);
      await shot("08-restored");
      expect(evidence.restoredAddress).toBe(evidence.address);
    } catch (error) {
      evidence.failed =
        error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error);
      throw error;
    } finally {
      evidence.finishedAt = new Date().toISOString();
      await mkdir(SCREENS_DIR, { recursive: true });
      await writeFile(join(SCREENS_DIR, "e2e-live.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    }
  });
});

async function navigate(page: Page, label: string, path: string) {
  await page.getByRole("link", { name: label, exact: true }).first().click();
  await page.waitForURL((url) => url.pathname === path);
}

async function headerAusd(page: Page): Promise<number> {
  const balance = page
    .locator("header")
    .getByText(/\d[\d,.]*\s*AUSD/)
    .first();
  if (!(await balance.isVisible())) return 0;
  const amount = Number.parseFloat((await balance.innerText()).replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

/** Waits for "Filled!" while recording every explorer link the ticket exposes on the way. */
async function awaitReceipt(ticket: Locator, step: string, evidence: Evidence, started: number) {
  const link = ticket.getByRole("link", { name: /View transaction/ });
  const deadline = Date.now() + 120_000;
  for (;;) {
    if (await link.isVisible()) {
      const url = (await link.getAttribute("href")) ?? "";
      const hash = url.match(/0x[0-9a-fA-F]{64}/)?.[0];
      if (hash && !evidence.transactions.some((tx) => tx.hash === hash))
        evidence.transactions.push({ step, hash, url, atMs: Date.now() - started });
    }
    if (await ticket.getByText("Filled!").isVisible()) return;
    if (await ticket.getByText(/Didn.t fill/).isVisible()) {
      const alert = await ticket.getByRole("alert").allInnerTexts();
      throw new Error(`${step} did not fill: ${alert.join(" ") || "no error message"}`);
    }
    if (Date.now() > deadline) throw new Error(`${step} receipt not shown within 120 s`);
    await ticket.page().waitForTimeout(250);
  }
}

/** Polls the held card until it reads SAID, bounded by the clip end plus 30 s. */
async function awaitSaid(page: Page, card: Locator) {
  const timer = page.getByRole("timer");
  const progress = page.getByRole("progressbar", { name: "Clip progress" });
  let deadline = Date.now() + 15 * 60_000;
  let clipDurationSeconds = 0;
  for (;;) {
    const label = (await card.getAttribute("aria-label")) ?? "";
    if (/, said(,|$)/.test(label)) {
      const now = (await progress.isVisible())
        ? Number(await progress.getAttribute("aria-valuenow"))
        : null;
      return { clipSeconds: now, clipDurationSeconds };
    }
    if (/settled/.test(label)) throw new Error(`Held word settled before SAID: ${label}`);
    if (await progress.isVisible())
      clipDurationSeconds = Number(await progress.getAttribute("aria-valuemax"));
    const timerLabel = (await timer.isVisible()) ? await timer.getAttribute("aria-label") : null;
    const clock = timerLabel?.match(/(\d+):(\d\d)/);
    if (clock && timerLabel?.includes("left in the clip"))
      deadline = Date.now() + (Number(clock[1]) * 60 + Number(clock[2]) + 30) * 1_000;
    if (Date.now() > deadline)
      throw new Error(
        `Held word never flipped SAID within the clip + 30 s (last label: ${label}). The clip may not say it; rerun to pick another word.`,
      );
    await page.waitForTimeout(500);
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
