import { test, expect } from "@playwright/test";

test("cloud settings offers both copies when a board conflicts", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  await page.waitForFunction(() => {
    const store = (window as unknown as { __foqzCloudSync?: { setState: (patch: object) => void } })
      .__foqzCloudSync;
    return typeof store?.setState === "function";
  });
  await page.evaluate(() => {
    const store = (window as unknown as { __foqzCloudSync: { setState: (patch: object) => void } })
      .__foqzCloudSync;
    store.setState({
      phase: "error",
      conflict: true,
      email: "ada@example.com",
      detail:
        "Remote changes on “Main” differ from this device. Use the cloud copy or keep this device’s version.",
    });
  });

  await page.getByRole("button", { name: /^Error\./ }).click();
  const dialog = page.getByRole("dialog", { name: "Cloud sync" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("ada@example.com")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Use cloud copy" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Keep this device" })).toBeVisible();
  await page.screenshot({ path: "test-results/cloud-conflict-choices.png" });
});
