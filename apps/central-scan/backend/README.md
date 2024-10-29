# VxCentralScan Backend

Backend server for VxCentralScan.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then start up the VxCentralScan (`apps/central-scan`) frontend. You
generally should not need to run this service directly. Instead, run like so:

```sh
cd apps/central-scan/frontend
pnpm start
```

The commands to run the service below assume you'll be running them in a
frontend, not this service directly.

## Mock Scanning

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
./bin/extract-backup /path/to/election-backup.zip
MOCK_SCANNER_FILES=@/path/to/election-backup/manifest pnpm start
```

If you are seeing unhandled promise rejection errors you may have an issue with
where your image files are located, try moving them into the local scope of the
app.

### Testing Adjudication

To force `requires_adjudication` of ballots, run this in
`apps/central-scan/backend`:

```
sqlite3 dev-workspace/ballots.db 'update sheets set requires_adjudication = 1;'
```

## Switching Workspaces

By default a `ballots.db` file and a `ballot-images` directory will be created
in a `dev-workspace` folder inside `apps/central-scan/backend` when running this
service. To choose another location, set `SCAN_WORKSPACE` to the path to another
folder:

```sh
SCAN_WORKSPACE=/path/to/workspace pnpm start
```

## Testing

```sh
pnpm test
```
