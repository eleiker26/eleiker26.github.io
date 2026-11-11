// Installable app: manifest, offline loading, and the new-version notice.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { mockServices, watchErrors } = require("./helpers");

test.use({ serviceWorkers: "allow" });

test("has an app manifest and icons", async ({ page, context }) => {
  await mockServices(context);
  await page.goto("/");
  const href = await page.getAttribute('link[rel="manifest"]', "href");
  const res = await page.request.get(href);
  const man = await res.json();
  expect(man.name).toBe("Shortest Stop Route");
  expect(man.display).toBe("standalone");
  for (const icon of man.icons) expect((await page.request.get(icon.src)).ok(), icon.src).toBe(true);
});

test("opens with no internet after the first visit", async ({ page, context }) => {
  await mockServices(context);
  const errors = watchErrors(page);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Shortest Stop Route");
  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("offers to load a newer version", async ({ page, context }) => {
  await mockServices(context);
  await page.goto("/");
  const current = +(await page.textContent("body")).match(/Version (\d+) ·/)[1];
  // Pretend the server now has the next version.
  await context.route(/localhost:8765\/\?check=/, async route => {
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").replace(/Version \d+ ·/, "Version " + (current + 1) + " ·");
    await route.fulfill({ body: html, contentType: "text/html" });
  });
  await page.evaluate(() => checkForUpdate());
  await expect(page.locator("#updateBar")).toBeVisible();
});
