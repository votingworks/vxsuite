# VxMarkScan

A ballot-marking device (BMD) that also supports limited-dexterity casting.

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then run the app like so:

```sh
# In apps/mark-scan/frontend
pnpm start
```


The server will be available at http://localhost:3000, with the backend at
http://localhost:3001. To use a different port, set the `FRONTEND_PORT`
environment variable and the backend port will use `$FRONTEND_PORT + 1`.


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

The VxMarkScan accessible controller and PAT input are managed via the
[fai-100-controller daemon](../fai-100-controller). That daemon is specifically
for the VSAP 150. Other daemons are for the VSAP 155, which we used for early
prototyping.
