# VxScan Backend

Backend server for the VxScan precinct scanner app. You'll need the Custom A4
scanner to use this app with a real scanner.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md)

You generally should not need to run the backend directly. Instead, run the
frontend, which will automatically run the backend.

```sh
cd apps/scan/frontend
pnpm start
```

The commands below assume you'll be running them as described above.

## Configuration

There are a few environment variables that can be set to configure the backend.

### `SCAN_WORKSPACE`

By default a `ballots.db` file and a `ballot-images` directory will be created
in a `dev-workspace` folder inside `apps/scan/backend` when running the app. To
choose another location, set `SCAN_WORKSPACE` to the path to another folder:

```sh
SCAN_WORKSPACE=/path/to/workspace pnpm start
```

## Testing

```sh
pnpm test
```
