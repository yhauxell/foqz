import { test, expect } from "@playwright/test";

test("a pan is stored and restored with the board", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");

  const pane = page.locator(".react-flow__pane");
  const box = await pane.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.wheel(0, 480);
  await page.mouse.wheel(320, 0);

  await page.waitForFunction(() => {
    const raw = localStorage.getItem("foqz_reactflow_poc_board_v1");
    if (!raw) return false;
    const snapshot = JSON.parse(raw) as { viewport?: { x: number; y: number; zoom: number } };
    return Boolean(snapshot.viewport && (snapshot.viewport.x !== 0 || snapshot.viewport.y !== 0));
  });

  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem("foqz_reactflow_poc_board_v1");
    return JSON.parse(raw ?? "{}").viewport as { x: number; y: number; zoom: number };
  });

  await page.reload();
  await page.waitForSelector(".react-flow__viewport");
  await page.waitForFunction(
    (viewport) => {
      const node = document.querySelector(".react-flow__viewport");
      const transform = node instanceof HTMLElement ? node.style.transform : "";
      return transform.includes(String(viewport.x)) && transform.includes(String(viewport.y));
    },
    saved
  );

  await page.screenshot({ path: "test-results/cloud-viewport-restored.png" });
});
