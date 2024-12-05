# VxScan

A precinct scanner for casting of ballots (marked by hand or by BMD).

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then run the app like so:

```sh
# In apps/scan/frontend
pnpm start
```

The server will be available at http://localhost:3000.

## Development

VxScan requires a PDI scanner to be connected via USB.

To use a mock PDI scanner, enable the `USE_MOCK_PDI_SCANNER` feature flag in a
`.env` or `.env.local` file. The mock scanner can be controlled using the dev
dock.

## Testing

```sh
pnpm test
```
