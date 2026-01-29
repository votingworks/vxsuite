# VxPollBook Frontend

## Setup

To run the app:

```sh
pnpm start
```


The server will be available at http://localhost:3000, with the backend at
http://localhost:3001. To use a different port, set the `PORT` environment
variable and the backend port will use `$PORT + 1`. The avahi peer port will
be `$PORT + 2`.

Alternatively, set `LOCAL_PORT` to configure the backend port and `PEER_PORT` to
set the avahi peer port to arbitrary values without regard to `PORT`
