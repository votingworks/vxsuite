# VxCentralScan Integration Testing

Integration tests for VxCentralScan using the backend
(`apps/central-scan/backend`), frontend (`apps/central-scan/frontend`), and
dependent services.

## Development

These tests run in the Playwright-managed Chromium browser. Install it with:

```bash
pnpm exec playwright install chromium
```

Do **not** install a system Chromium (e.g. `apt install chromium`): a
system-wide browser can change image rendering and throw the image snapshots in
other libraries out of sync with CI. CI installs the Playwright-managed browser
the same way (see the generated `Install Browser` step in
`.circleci/config.yml`).

See the "Installation" section of the Playwright docs for more information:
<https://playwright.dev/docs/intro>.

```bash
# build the frontend, backend, and required services
pnpm build

# to run tests in headless mode
pnpm test

# to run tests via the Playwright window
pnpm test:watch
```
