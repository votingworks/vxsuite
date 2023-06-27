# VxDesign (Backend)

**Experimental Prototype**

Backend server for VxDesign.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,

You generally should not need to run the backend directly. Instead, run the
frontend, which will automatically run the backend.

```sh
cd apps/design/frontend
pnpm start
```

## Configuration

There are a few environment variables that can be set to configure the backend.

### `WORKSPACE`

By default a `design-backend.db` file will be created in a `dev-workspace`
folder inside `apps/design/backend` when running the app. To choose another
location, set `WORKSPACE` to the path to another folder:

```sh
WORKSPACE=/path/to/workspace pnpm start
```

## Testing

```sh
pnpm test
```

## Test Ballots

The [fixtures](./fixtures) directory contains sample ballots for testing.

These ballots can be regenerated after code changes using the following command:

```sh
pnpm regenerate-fixtures
```
