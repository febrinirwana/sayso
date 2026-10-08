import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";

/** Evidence screenshots land beside the handoff notes unless `SAYSO_SCREENS_DIR` overrides. */
export const SCREENS_DIR =
  process.env.SAYSO_SCREENS_DIR ??
  fileURLToPath(new URL("../../../../handoff/sayso/screens/e2e/", import.meta.url));

export async function screenshot(page: Page, name: string): Promise<string> {
  await mkdir(SCREENS_DIR, { recursive: true });
  const path = join(SCREENS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

/** CDP virtual platform authenticator; the passkey survives site-data clears like a real device. */
export async function addAuthenticator(page: Page, { hasPrf }: { hasPrf: boolean }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf,
      automaticPresenceSimulation: true,
    },
  });
}

/** Joins with a fresh passkey and lands on `redirect`. */
export async function joinWithPasskey(page: Page, redirect: string): Promise<void> {
  await page.goto(`/join?redirect=${encodeURIComponent(redirect)}`);
  await page.getByRole("button", { name: "Join with passkey" }).click();
  await page.waitForURL((url) => url.pathname === redirect, { timeout: 60_000 });
}

export async function readAddress(page: Page): Promise<string> {
  if (new URL(page.url()).pathname !== "/account") await page.goto("/account");
  const address = page.getByTestId("account-address");
  await expect(address).toHaveText(/^0x[0-9a-fA-F]{40}$/, { timeout: 30_000 });
  return (await address.innerText()).trim();
}

/** Drops every site store the app could keep identity in: local, session, IndexedDB, cookies. */
export async function clearSiteData(page: Page): Promise<void> {
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    for (const { name } of await indexedDB.databases()) {
      if (!name) continue;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error(`IndexedDB delete blocked: ${name}`));
      });
    }
  });
  await page.context().clearCookies();
}

/** After a clear, `/account` bounces to join; "I already have one" must bring the address back. */
export async function restoreWithPasskey(
  page: Page,
  onJoinScreen?: () => Promise<unknown>,
): Promise<string> {
  await page.goto("/account");
  await page.waitForURL((url) => url.pathname === "/join");
  const signIn = page.getByRole("button", { name: "I already have one" });
  await expect(signIn).toBeEnabled();
  await onJoinScreen?.();
  await signIn.click();
  await page.waitForURL((url) => url.pathname === "/account", { timeout: 60_000 });
  return readAddress(page);
}
