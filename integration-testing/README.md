# Integration Testing

Home for integration testing a whole component by testing different packages
together. Copy an existing subfolder if you need to set up a new bundle of
packages to test.

## App Bundles

- bsd - Tests the bsd frontend with the scan service
- election-manager - Tests the election-manager frontend with the smartcards and
  converter-sems-ms services

## Development

You will need to make sure to have cypress dependencies installed see:
https://on.cypress.io/required-dependencies.

In each subfolder, install dependencies and build all packages that will be
tested with

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

Note: You will need to have Google Chrome installed in order to run tests end to
end.

### Notes

Cypress makes it easy to use fixtures files in the `cypress/fixtures` directory.
For this reason some fixtures from the shared `lib/fixtures` module are
duplicated into tests fixtures folders. Tests also rely on the data in
`lib/fixtures` so you must run pnpm build to make sure those files get built
properly.