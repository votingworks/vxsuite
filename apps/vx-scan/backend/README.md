# Scan Module

This web server component provides a web interface to a scanner for use by the
VxSuite [Ballot Scanning Device (BSD)](../bsd) or the VxSuite
[Precinct Scanner](../precinct-scanner).

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up,
then start up VxScan (`frontends/precinct-scanner`) or VxCentralScan
(`frontends/bsd`) by running the appropriate frontend. You generally should not
need to run this service directly. Instead, run like so:

```sh
cd frontends/bsd # or frontends/precinct-scanner
pnpm start
```

The commands to run the service below assume you'll be running them in a
frontend, not this service directly.

## Mock Scanning

There are a couple different modes the mock scanners operate in. Choose the one
that's appropriate for you.

### Multi-sheet scanner

```sh
# single batch with single sheet
MOCK_SCANNER_FILES=front.jpeg,back.jpeg pnpm start

# single batch with multiple sheets
MOCK_SCANNER_FILES=front-01.jpeg,back-01.jpeg,front-02.jpeg,back-02.jpeg pnpm start

# multiple batches with one sheet each (note ",," batch separator)
MOCK_SCANNER_FILES=front-01.jpeg,back-01.jpeg,,front-02.jpeg,back-02.jpeg pnpm start

# use a manifest file
cat <<EOS > manifest
# first batch (this is a comment)
front-01.jpeg
back-01.jpeg

# second batch
front-02.jpeg
back-02.jpeg
EOS
MOCK_SCANNER_FILES=@manifest pnpm start

# scanning from an election backup file
../../services/scan/bin/extract-backup /path/to/election-backup.zip
MOCK_SCANNER_FILES=@/path/to/election-backup/manifest pnpm start
```

If you are seeing unhandled promise rejection errors you may have an issue with
where your image files are located, try moving them into the local scope of the
app.

### Single-sheet scanner

This mode is designed for use with `precinct-scanner`.

```sh
cd frontends/precinct-scanner

# start the server with an HTTP-based mock
MOCK_SCANNER_HTTP=1 pnpm start

# in another terminal, simulate the user feeding paper into the scanner:
./bin/mock-scanner load path/to/front.jpg path/to/back.jpg

# simulate the user pulling the loaded paper out of the scanner:
./bin/mock-scanner remove
```

### Using Fixtures Data

To force `requires_adjudication` of ballots, run this in `services/scan`:

```
sqlite3 dev-workspace/ballots.db 'update sheets set requires_adjudication = 1;'
```

#### Letter-sized ballots

First init `services/smartcards` with:

```
./mockCardReader.py enable --admin ../scan/test/fixtures/choctaw-2020-09-22-f30480cc99/election.json
```

Init `services/scan` with:

```
MOCK_SCANNER_FILES=test/fixtures/choctaw-2020-09-22-f30480cc99/blank-p1.png,test/fixtures/choctaw-2020-09-22-f30480cc99/blank-p2.png pnpm start
```

#### Legal-sized ballots

First init `services/smartcards` with:

```
./mockCardReader.py enable --admin ../../libs/ballot-interpreter-vx/test/fixtures/choctaw-county-2020-general-election/election.json
```

Init `services/scan` with:

```
MOCK_SCANNER_FILES=../../libs/ballot-interpreter-vx/test/fixtures/choctaw-county-2020-general-election/filled-in-p1-03.png,../../libs/ballot-interpreter-vx/test/fixtures/choctaw-county-2020-general-election/filled-in-p2-03.png pnpm start
```

## Switching Workspaces

By default a `ballots.db` file and a `ballot-images` directory will be created
in a `dev-workspace` folder inside `services/scan` when running this service. To
choose another location, set `SCAN_WORKSPACE` to the path to another folder:

```sh
SCAN_WORKSPACE=/path/to/workspace pnpm start
```

## Testing

```sh
pnpm test
```

## License

GPLv3
