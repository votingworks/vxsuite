# VxCentralScan

A central scanner for batch scanning of ballots, often used for absentee ballot
processing.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then run the app like so:

```sh
# In apps/central-scan/frontend
pnpm start
```

The server will be available at http://localhost:3000.

## Testing

```sh
pnpm test
```

## Development Tips

### Mock Scanning

To scan ballots without scanner hardware, use the `MOCK_SCANNER_FILES`
environment variable.

```sh
# Single batch with single sheet
MOCK_SCANNER_FILES=front.jpeg,back.jpeg pnpm start

# Single batch with multiple sheets
MOCK_SCANNER_FILES=front-01.jpeg,back-01.jpeg,front-02.jpeg,back-02.jpeg pnpm start

# Multiple batches with one sheet each (note ",," batch separator)
MOCK_SCANNER_FILES=front-01.jpeg,back-01.jpeg,,front-02.jpeg,back-02.jpeg pnpm start

# Use a manifest file
cat <<EOS > manifest
# First batch (this is a comment)
front-01.jpeg
back-01.jpeg

# Second batch
front-02.jpeg
back-02.jpeg
EOS
MOCK_SCANNER_FILES=@manifest pnpm start

# Use an election backup file
./bin/extract-backup /path/to/election-backup.zip
MOCK_SCANNER_FILES=@/path/to/election-backup/manifest pnpm start
```

### Testing Adjudication

To force `requires_adjudication` of ballots, run this in
`apps/central-scan/backend`:

```
sqlite3 dev-workspace/ballots.db 'update sheets set requires_adjudication = 1;'
```
