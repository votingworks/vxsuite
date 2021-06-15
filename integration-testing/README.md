# Integration Testing

Home for integration testing different apps that need to be tested in conjuction with one another. Copy an existing subfolder if you need to set up a new bundle of apps to test.

## App Bundles

bsd - Tests the frontend of bsd with the backend of module-scan

## Development 

You will need to make sure to have cypress dependencies installed see: https://on.cypress.io/required-dependencies. 

In each subfolder, install dependencies and build all apps that will be tested with 
```
pnpm build
```

Run the server for all apps with

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
Note: You will need to have google chrome installed in order to run tests end to end. 
