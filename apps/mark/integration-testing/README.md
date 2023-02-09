# VxMark Integration Testing

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

You will also need to make sure to have cypress dependencies installed see:
https://on.cypress.io/required-dependencies.

```bash
# build the frontend, backend, and required services
pnpm build

# to run tests in headless mode
pnpm test

# to run tests via the Cypress window
pnpm test:watch
```

### Notes

Cypress makes it easy to use fixtures files in the `cypress/fixtures` directory.
For this reason some fixtures from the shared `lib/fixtures` module are
duplicated into tests fixtures folders. Tests also rely on the data in
`lib/fixtures` so you must run pnpm build to make sure those files get built
properly.
