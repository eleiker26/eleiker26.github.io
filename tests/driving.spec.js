// Live GPS driving mode: following you, next-turn banner, voice, rerouting, arrivals.
const { test, expect } = require("@playwright/test");
const { mockServices, planRoute, watchErrors } = require("./helpers");

let errors, calls;
test.beforeEach(async ({ page, context }) => {
  calls = await mockServices(context);
  errors = watchErrors(page);
  await page.goto("/");
});
test.afterEach(() => expect(errors, "script errors on the page").toEqual([]));

const moveTo = async (page, lat, lon) => {
  await page.context().setGeolocation({ latitude: lat, longitude: lon, accuracy: 10 });
  await page.waitForTimeout(400);
};

test("guides turn by turn, re-routes, and moves on after each stop", async ({ page }) => {
  // From (40.10,-83.10): north on Sawmill Road, then right onto Hard Road to stop 1 at (40.13,-83.08).
  await planRoute(page, ["2948 Dublin Arbor Lane, Dublin OH", "488 Meadoway Park, Worthington OH"]);
  await page.click("#startDrive");
  await expect(page.locator("#nav")).toBeVisible();
  await expect(page.locator("#navText")).toHaveText("Turn right onto Hard Road");

  await moveTo(page, 40.125, -83.10);
  await expect(page.locator("#navDist")).toHaveText("0.3 mi");
  await moveTo(page, 40.1295, -83.10);
  await expect(page.locator("#navDist")).toHaveText(/ft$/);

  await moveTo(page, 40.13, -83.095);
  await expect(page.locator("#navText")).toContainText("Arrive at stop 1");

  // Leave the route for a while: it should ask for a new route.
  await page.waitForTimeout(10500);
  const before = calls.navRoute;
  for (let i = 1; i <= 4; i++) await moveTo(page, 40.13 + 0.003 * i, -83.093);
  await page.waitForTimeout(600);
  expect(calls.navRoute).toBeGreaterThan(before);

  await moveTo(page, 40.1301, -83.0801);
  await expect(page.locator("#navText")).toHaveText("Arrived at stop 1");
  await page.click("#navDone");
  await expect(page.locator("#navNext")).toContainText("2 · 488 Meadoway Park");

  const said = await page.evaluate(() => window.__said);
  expect(said[0]).toMatch(/^In .+, turn right onto Hard Road$/);
  expect(said).toContain("Rerouting");
  expect(said.some(t => t.startsWith("You have arrived at stop 1"))).toBe(true);

  await page.click("#navExit");
  await expect(page.locator("#nav")).toBeHidden();
  await expect(page.locator('#list input[data-i="0"]')).toBeChecked();
});

test("heads back to the start after the last stop when asked to", async ({ page }) => {
  await planRoute(page, ["2948 Dublin Arbor Lane, Dublin OH"], { endMode: "start" });
  await page.check('#list input[data-i="0"]');
  await moveTo(page, 40.13, -83.08);
  await page.click("#startDrive");
  await expect(page.locator("#navNext")).toHaveText("⌂ Back to start");
  await moveTo(page, 40.1001, -83.1001);
  await expect(page.locator("#navText")).toHaveText("You're back at your start");
});
