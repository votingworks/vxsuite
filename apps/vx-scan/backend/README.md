# VxScan Backend

Backend server for the VxScan precinct scanner app.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md)

You generally should not need to run the backend directly. Instead, run the
frontend, which will automatically run the backend.

```sh
cd apps/vx-scan/frontend
pnpm start
```

The commands below assume you'll be running them as described above.

## Mock Scanning

```sh
cd apps/vx-scan/frontend

# start the server with an HTTP-based mock
MOCK_SCANNER_HTTP=1 pnpm start

# in another terminal, simulate the user feeding paper into the scanner:
./bin/mock-scanner load path/to/front.jpg path/to/back.jpg

# simulate the user pulling the loaded paper out of the scanner:
./bin/mock-scanner remove
```

### Using Fixtures Data

#### Letter-sized ballots

First configure the scanner with the election definition by running
`services/smartcards` with:

```
./mockCardReader.py enable --admin ../scan/test/fixtures/choctaw-2020-09-22-f30480cc99/election.json
```

Then run the mock scanner with:

```
./bin/mock-scanner load test/fixtures/choctaw-2020-09-22-f30480cc99/blank-p1.png test/fixtures/choctaw-2020-09-22-f30480cc99/blank-p2.png
```

#### Legal-sized ballots

First configure the scanner with the election definition by running
`services/smartcards` with:

```
./mockCardReader.py enable --admin ../../libs/ballot-interpreter-vx/test/fixtures/choctaw-county-2020-general-election/election.json
```

Then run the mock scanner with:

```
./bin/mock-scanner ../../../libs/ballot-interpreter-vx/test/fixtures/choctaw-county-2020-general-election/filled-in-p1-03.png ../../../libs/ballot-interpreter-vx/test/fixtures/choctaw-county-2020-general-election/filled-in-p2-03.png
```

## Switching Workspaces

By default a `ballots.db` file and a `ballot-images` directory will be created
in a `dev-workspace` folder inside `apps/vx-scan/backend` when running the app.
To choose another location, set `SCAN_WORKSPACE` to the path to another folder:

```sh
SCAN_WORKSPACE=/path/to/workspace pnpm start
```

## Testing

```sh
pnpm test
```

## License

GPLv3
