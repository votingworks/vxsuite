# VxMark

A traditional ballot-marking device (BMD). For a BMD that also supports
limited-dexterity casting, see [VxMarkScan](../../mark-scan/frontend).

## Setup

Follow the instructions in the [VxSuite README](../../../README.md) to get set
up, then run the app like so:

```sh
# In apps/mark/frontend
pnpm start
```


The server will be available at http://localhost:3000, with the backend at
http://localhost:3001. To use a different port, set the `FRONTEND_PORT`
environment variable and the backend port will use `$FRONTEND_PORT + 1`.


## Testing

```sh
pnpm test
```
