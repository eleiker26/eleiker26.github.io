// Runs the site from a local web server and drives it in Chromium.
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: ".",
  testMatch: "*.spec.js",
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: {
    baseURL: "http://localhost:8765/",
    viewport: { width: 390, height: 900 },
    geolocation: { latitude: 40.10, longitude: -83.10 },
    permissions: ["geolocation"],
    serviceWorkers: "block",
    trace: "off"
  },
  webServer: {
    command: "python3 -m http.server 8765 --directory ..",
    url: "http://localhost:8765/index.html",
    reuseExistingServer: !process.env.CI
  }
});
