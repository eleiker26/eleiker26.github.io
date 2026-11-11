// Mileage log, daily summary, CSV export, backups and the backup reminder.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const { mockServices, planRoute, watchErrors } = require("./helpers");

let errors;
test.beforeEach(async ({ page, context }) => {
  await mockServices(context);
  errors = watchErrors(page);
  await page.goto("/");
});
test.afterEach(() => expect(errors, "script errors on the page").toEqual([]));

const todayMiles = page => page.locator(".logCard").first().locator("b");

test("logs each finished stop once and removes it when unchecked", async ({ page }) => {
  await planRoute(page, ["2948 Dublin Arbor Lane, Dublin OH", "488 Meadoway Park, Worthington OH"], { mpg: 25, price: 3.2 });
  await page.click("#logSum");
  await expect(todayMiles(page)).toHaveText("0.0 mi");

  await page.check('#list input[data-i="0"]');
  const one = await todayMiles(page).textContent();
  expect(parseFloat(one)).toBeGreaterThan(0);

  await page.check('#list input[data-i="1"]');
  const two = await todayMiles(page).textContent();
  expect(parseFloat(two)).toBeGreaterThan(parseFloat(one));

  await page.uncheck('#list input[data-i="1"]');
  await expect(todayMiles(page)).toHaveText(one);
  await page.check('#list input[data-i="1"]');
  await expect(todayMiles(page)).toHaveText(two);   // counted once, not twice
  await expect(page.locator(".logCard").first()).toContainText("2 stops");
  await expect(page.locator(".logCard").first()).toContainText("$");
});

test("tracks GPS miles in driving mode", async ({ page }) => {
  await planRoute(page, ["2948 Dublin Arbor Lane, Dublin OH"]);
  await page.click("#startDrive");
  await page.waitForTimeout(600);
  // About 1 mile east, in 10 steps.
  for (let i = 1; i <= 10; i++) {
    await page.context().setGeolocation({ latitude: 40.10, longitude: -83.10 + 0.0019 * i, accuracy: 10 });
    await page.waitForTimeout(250);
  }
  await page.click("#navExit");
  await page.click("#logSum");
  const gps = await page.locator("#logRows tr").first().locator("td").nth(3).textContent();
  expect(parseFloat(gps)).toBeGreaterThan(0.9);
  expect(parseFloat(gps)).toBeLessThan(1.1);
});

test("exports a CSV and includes the log in backups", async ({ page }) => {
  await planRoute(page, ["2948 Dublin Arbor Lane, Dublin OH"]);
  await page.check('#list input[data-i="0"]');
  await page.click("#logSum");
  await page.fill("#mileRate", "0.70");
  const [csvDl] = await Promise.all([page.waitForEvent("download"), page.click("#logExport")]);
  const csv = fs.readFileSync(await csvDl.path(), "utf8").split(/\r?\n/);
  expect(csv[0]).toBe("Date,Stops,Road miles,GPS miles,Drive minutes,Gas cost,Reimbursement ($0.7/mi)");
  expect(csv[csv.length - 1]).toMatch(/^Total,1,/);

  await expect(page.locator("#backupNudge")).toBeVisible();
  const [bk] = await Promise.all([page.waitForEvent("download"), page.click("#nudgeBackup")]);
  const data = JSON.parse(fs.readFileSync(await bk.path(), "utf8")).data;
  expect(Object.keys(JSON.parse(data.mileLog)).length).toBe(1);
  await expect(page.locator("#backupNudge")).toBeHidden();
});
