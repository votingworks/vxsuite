# VxScan Backend

Backend server for the VxScan precinct scanner app.

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

### `SCANNER_MODEL`

VxScan uses the Custom A4 scanner by default. To use the Plustek VTM-300, set
`SCANNER_MODEL` to `plustek`:

```sh
SCANNER_MODEL=plustek pnpm start
```

### `USE_NH_NEXT`

VxScan uses the `@votingworks/ballot-interpreter-nh` package by default. To use
the faster `@votingworks/ballot-interpreter-nh-next` package, set `USE_NH_NEXT`
to `true`:

```sh
USE_NH_NEXT=true pnpm start
```

## Testing

```sh
pnpm test
```

## License

GPLv3
