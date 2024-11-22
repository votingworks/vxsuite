# VxMark v2 Integration Testing

Integration tests for VxMark using the backend (`apps/mark/backend`), frontend
(`apps/mark/frontend`), and dependent services.

## Development

In order to run integration tests locally on your VM, you will have to install
Chromium with:

```bash
sudo apt install chromium
```

The tests can also be run in Chrome (and in CircleCI, they do run in Chrome) but
currently there is not a Debian 11 ARM version of Chrome available so we use
Chromium locally.

See the "Installation" section of the Playwright docs for more information:
https://playwright.dev/docs/intro.

```bash
# build the frontend, backend, and required services
pnpm build

# to run tests in headless mode
pnpm test

# to run tests via the Playwright window
pnpm test:watch
```
