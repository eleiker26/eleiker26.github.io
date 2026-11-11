# Tests

Browser tests for the route planner. Every outside service (address lookup, road routing,
map tiles) is simulated, so the tests give the same result every time and need no internet.

GitHub runs them automatically on every change (see `.github/workflows/tests.yml`).
To run them on a computer with Node.js installed:

```
cd tests
npm ci
npx playwright install chromium
npx playwright test
```
