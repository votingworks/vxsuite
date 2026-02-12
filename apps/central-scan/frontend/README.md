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

The server will be available at http://localhost:3000, with the backend at
http://localhost:3001. To use a different port, set the `FRONTEND_PORT`
environment variable and the backend port will use `$FRONTEND_PORT + 1`.

## Testing

```sh
pnpm test
```

## Development Tips

### Mock Scanning

To scan ballots without scanner hardware, use the mock central scanner with the
dev dock:

```sh
REACT_APP_VX_USE_MOCK_CENTRAL_SCANNER=TRUE pnpm start
```

This enables a "Batch Scanner" control in the dev dock where you can load ballot
PDFs or images (JPG/PNG). Loaded ballots persist across scans — click "Clear" in
the dev dock to reset. Each click of "Scan New Batch" in the main UI will scan
all loaded ballots.

### Testing Adjudication

To force `requires_adjudication` of ballots, run this in
`apps/central-scan/backend`:

```
sqlite3 dev-workspace/ballots.db 'update sheets set requires_adjudication = 1;'
```
