// Shared test setup: fake versions of every outside service the site uses,
// so tests are fast and give the same answer every time.
const fs = require("fs");
const path = require("path");

const LEAFLET = path.dirname(require.resolve("leaflet/dist/leaflet.js"));
const TILE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN4+vTpfwAIBANvLdWXbgAAAABJRU5ErkJggg==", "base64");

// Addresses are matched by their house number.
const PLACES = {
  "2948": [40.13, -83.08],
  "5684": [40.14, -83.12],
  "488": [40.08, -83.02],
  "100": [40.00, -82.90],
  "200": [40.00, -83.05],
  "300": [40.03, -82.97],
  "999": [40.10, -83.00]
};
const placeFor = q => { const k = Object.keys(PLACES).find(n => q.trim().startsWith(n + " ")); return k ? PLACES[k] : null; };

// Road distance in the fake world: east-west and north-south blocks (meters).
const blocks = (a, b) => Math.abs(a[0] - b[0]) * 85000 + Math.abs(a[1] - b[1]) * 111000;

/**
 * Installs the fake services on a browser context.
 * Returns counters the tests can check (for example how many routes were requested).
 */
async function mockServices(context) {
  const calls = { route: 0, navRoute: 0, census: 0 };
  await context.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) speechSynthesis.speak = u => { if (u.text) window.__said.push(u.text); };
  });
  await context.route("**/*", route => {
    const u = new URL(route.request().url());
    if (u.hostname === "localhost") return route.continue();
    if (u.host === "unpkg.com") {
      const css = u.pathname.endsWith(".css");
      return route.fulfill({ body: fs.readFileSync(path.join(LEAFLET, css ? "leaflet.css" : "leaflet.js")), contentType: css ? "text/css" : "application/javascript" });
    }
    if (u.pathname.endsWith(".png")) return route.fulfill({ body: TILE, contentType: "image/png" });
    if (u.host.includes("census.gov")) {
      calls.census++;
      const q = u.searchParams.get("address"), cb = u.searchParams.get("callback"), c = placeFor(q);
      const matches = c ? [{ matchedAddress: q.toUpperCase(), coordinates: { x: c[1], y: c[0] } }] : [];
      return route.fulfill({ contentType: "application/javascript", body: cb + "(" + JSON.stringify({ result: { addressMatches: matches } }) + ")" });
    }
    if (u.host.includes("nominatim") || u.host.includes("photon") || u.host.includes("overpass")) {
      return route.fulfill({ contentType: "application/json", body: u.host.includes("photon") ? '{"features":[]}' : "[]" });
    }
    if (u.host.includes("project-osrm.org")) {
      const pts = u.pathname.split("/driving/")[1].split(";").map(s => s.split(",").map(Number));
      if (u.pathname.includes("/table/")) {
        const d = pts.map(a => pts.map(b => blocks(a, b)));
        return route.fulfill({ contentType: "application/json", body: JSON.stringify({ code: "Ok", distances: d, durations: d.map(r => r.map(x => x / 15)) }) });
      }
      calls.route++;
      if (pts.length === 2) calls.navRoute++;
      // Each leg: head north (or south) first, then turn right/left onto the east-west road.
      const legs = [], coords = [];
      let total = 0, dur = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], z = pts[i + 1], corner = [a[0], z[1]];
        coords.push(a, corner);
        const d1 = Math.abs(a[1] - z[1]) * 111000, d2 = Math.abs(a[0] - z[0]) * 85000;
        total += d1 + d2; dur += (d1 + d2) / 15;
        legs.push({ distance: d1 + d2, duration: (d1 + d2) / 15, steps: [
          { name: "Sawmill Road", distance: d1, maneuver: { type: "depart", bearing_after: z[1] >= a[1] ? 0 : 180, location: a } },
          { name: "Hard Road", distance: d2, maneuver: { type: "turn", modifier: (z[1] >= a[1]) === (z[0] >= a[0]) ? "right" : "left", location: corner } },
          { name: "", distance: 0, maneuver: { type: "arrive", modifier: "left", location: z } }
        ] });
      }
      coords.push(pts[pts.length - 1]);
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ code: "Ok", routes: [{ distance: total, duration: dur, geometry: { coordinates: coords }, legs }] }) });
    }
    return route.abort();
  });
  return calls;
}

/** Types stops into the table, plans the route, and waits for the result. */
async function planRoute(page, stops, { endMode, endAddr, mpg, price } = {}) {
  if (endMode || mpg || price) {
    if (!(await page.$eval("#optsBox", e => e.open))) await page.click("#optsBox summary");
    if (mpg) await page.fill("#mpg", String(mpg));
    if (price) await page.fill("#price", String(price));
    if (endMode) await page.selectOption("#endMode", endMode);
    if (endAddr) await page.fill("#endAddr", endAddr);
  }
  for (let i = 0; i < stops.length; i++) await page.fill("#stop" + i, stops[i]);
  await page.keyboard.press("Escape");
  await page.click("#go");
  await page.waitForSelector("#result:not([hidden])", { timeout: 30000 });
  await page.waitForTimeout(400);
}

/** The stop names in the planned order (first entry is the start). */
const stopOrder = page => page.$$eval("#list li .addr > span:first-child", e => e.map(x => x.textContent.split(",")[0]));

/** Fails the test on any script error in the page. */
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  return errors;
}

module.exports = { mockServices, planRoute, stopOrder, watchErrors, PLACES, blocks };
