# VxMark

A fully accessible ballot-marking device (BMD).

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then run the app like so:

```sh
# In apps/mark-scan/frontend
pnpm start
```

The server will be available at http://localhost:3000.

To run without hot reloading, e.g., if developing on resource-constrained
hardware:

```sh
DISABLE_MARK_HOT_RELOAD=true pnpm start
```

## Testing

```sh
pnpm test
```

## Peripherals

The VxMark accessible controller and PAT input are managed via the
[fai-100-controller daemon](../fai-100-controller). That daemon is specifically
for the VSAP 150. Other daemons are for the VSAP 155, which we used for early
prototyping.
