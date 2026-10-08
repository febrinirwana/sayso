import { expect, test } from "@playwright/test";
import {
  addAuthenticator,
  clearSiteData,
  joinWithPasskey,
  readAddress,
  restoreWithPasskey,
  screenshot,
} from "./helpers";

test("passkey join survives a full site-data clear and restores the same address", async ({
  page,
}) => {
  await addAuthenticator(page, { hasPrf: true });
  await page.goto("/join?redirect=%2Faccount");
  await expect(page.getByRole("button", { name: "Join with passkey" })).toBeEnabled();
  await screenshot(page, "account-01-join");

  await joinWithPasskey(page, "/account");
  const joined = await readAddress(page);
  await screenshot(page, "account-02-joined");

  await clearSiteData(page);
  const restored = await restoreWithPasskey(page, () => screenshot(page, "account-03-cleared"));
  await screenshot(page, "account-04-restored");
  expect(restored).toBe(joined);
});

test("a passkey without PRF shows the unsupported-browser screen", async ({ page }) => {
  await addAuthenticator(page, { hasPrf: false });
  await page.goto("/join");
  await page.getByRole("button", { name: "Join with passkey" }).click();
  await expect(page.getByText("Take the show to your phone.", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Try this browser again" })).toBeVisible();
  await screenshot(page, "account-05-prf-unavailable");
});
