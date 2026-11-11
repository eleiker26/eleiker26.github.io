// Planning: shortest order, map, turn-by-turn directions, route end choices, layout.
const { test, expect } = require("@playwright/test");
const { mockServices, planRoute, stopOrder, watchErrors, PLACES, blocks } = require("./helpers");

let errors;
test.beforeEach(async ({ page, context }) => {
  await mockServices(context);
  errors = watchErrors(page);
  await page.goto("/");
});
test.afterEach(() => expect(errors, "script errors on the page").toEqual([]));

// Every possible order of the stops, with the total length of each.
function allOrders(start, stops, end) {
  const perms = a => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
  return perms(stops.map((_, i) => i)).map(o => {
    const pts = [start, ...o.map(i => stops[i])];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += blocks([pts[i - 1][1], pts[i - 1][0]], [pts[i][1], pts[i][0]]);
    if (end) len += blocks([pts[pts.length - 1][1], pts[pts.length - 1][0]], [end[1], end[0]]);
    return { o, len };
  });
}

test("the route solver always finds the shortest order", async ({ page }) => {
  // Compare the page's own solver against trying every order, on many random trips.
  const bad = await page.evaluate(() => {
    let bad = 0;
    const perms = a => a.length < 2 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(p => [x, ...p]));
    for (let t = 0; t < 120; t++) {
      const n = 1 + (t % 7), P = Array.from({ length: n + 2 }, () => [Math.random() * 1e4, Math.random() * 1e4]);
      const D = P.map(a => P.map(b => Math.hypot(a[0] - b[0], a[1] - b[1]) * (1 + Math.random() * 0.2)));
      const withEnd = t % 2 === 1, E = n + 1;
      const Dn = D.slice(0, E).map(r => r.slice(0, E));
      const tail = withEnd ? { d: D.map(r => r[E]), t: D.map(r => r[E]) } : null;
      const group = [-1, ...Array.from({ length: n }, (_, i) => i)];
      const order = solve(Dn, Dn, group, n, new Array(E).fill(null), 0, false, null, tail);
      const len = o => o.reduce((s, x, i) => s + Dn[i ? o[i - 1] : 0][x], 0) + (withEnd ? D[o[o.length - 1]][E] : 0);
      const best = Math.min(...perms([...Array(n)].map((_, i) => i + 1)).map(len));
      if (order.length !== n || new Set(order).size !== n || Math.abs(len(order) - best) > 1e-6) bad++;
    }
    return bad;
  });
  expect(bad).toBe(0);
});

test("plans the shortest order and shows map pins and directions", async ({ page }) => {
  const stops = ["2948 Dublin Arbor Lane, Dublin OH", "5684 Duddingston Drive, Dublin OH", "488 Meadoway Park, Worthington OH"];
  await planRoute(page, stops);
  const shown = (await stopOrder(page)).slice(1);
  const best = allOrders([40.10, -83.10], stops.map(s => PLACES[s.split(" ")[0]])).sort((a, b) => a.len - b.len)[0];
  expect(shown).toEqual(best.o.map(i => stops[i].split(",")[0]));
  await expect(page.locator(".pin:not(.group)")).toHaveCount(4);
  await expect(page.locator("#dirSum")).toContainText("Turn-by-turn directions");
  await page.click("#dirSum");
  await expect(page.locator("#steps li.legHead")).toHaveCount(3);
  await page.locator("#steps li:not(.legHead)").nth(1).click();
  await expect(page.locator(".turnDot")).toHaveCount(1);
});

test("route can end back at the start or at another address", async ({ page }) => {
  const stops = ["100 East Rd, Town OH", "200 West Rd, Town OH", "300 North Rd, Town OH"];
  await page.context().setGeolocation({ latitude: 40.00, longitude: -83.00 });
  await planRoute(page, stops, { endMode: "other", endAddr: "999 Far North Rd, Town OH" });
  const shown = (await stopOrder(page)).slice(1);
  const best = allOrders([40.00, -83.00], stops.map(s => PLACES[s.split(" ")[0]]), PLACES["999"]).sort((a, b) => a.len - b.len)[0];
  expect(shown.slice(0, 3)).toEqual(best.o.map(i => stops[i].split(",")[0]));
  expect(shown[3]).toContain("999 Far North Rd");
  const dest = await page.$eval("#links a", a => new URL(a.href).searchParams.get("destination"));
  expect(dest).toBe("40.100000,-83.000000");
  await page.click("#dirSum");
  await expect(page.locator("#steps li.legHead")).toHaveCount(4);
});

test("calendar fits on a small phone without sideways scrolling", async ({ page }) => {
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 800 });
    const r = await page.evaluate(() => {
      const cal = document.querySelector(".cal").getBoundingClientRect();
      const right = Math.max(...[...document.querySelectorAll("#calGrid .calday")].map(d => d.getBoundingClientRect().right));
      return { inside: right <= cal.right + 0.5, scroll: document.documentElement.scrollWidth > innerWidth };
    });
    expect(r, "at " + width + "px").toEqual({ inside: true, scroll: false });
  }
});
