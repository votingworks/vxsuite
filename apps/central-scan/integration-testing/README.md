# VxCentralScan Integration Testing

Integration tests for VxCentralScan using both the backend
(`apps/central-scan/backend`) and frontend (`apps/central-scan/frontend`).

## Development

You will need to make sure to have cypress dependencies installed see:
https://on.cypress.io/required-dependencies.

```
pnpm build
```

Run the server for all packages with

```
pnpm start
```

Open the cypress testing window with

```
pnpm test
```

Start the server and run all tests e2e with

```
pnpm test:ci
```

Note: You will need to have Chromium installed in order to locally run tests end
to end.

### Notes

Cypress makes it easy to use fixtures files in the `cypress/fixtures` directory.
For this reason some fixtures from the shared `lib/fixtures` module are
duplicated into tests fixtures folders. Tests also rely on the data in
`lib/fixtures` so you must run pnpm build to make sure those files get built
properly.
