# Scan Module

This web server component provides a web interface to a scanner

## Install Requisite Software

```sh
# install application packages
pnpm install

# install external tools
make install
```

You may need to install a few image libraries if you are using a new Ubuntu
image.

```
sudo apt-get install libpng-dev libjpeg-dev libx11-dev
```

## Run Tests

```sh
pnpm test
```

## Start the Server

```sh
# use a real scanner
pnpm dev

# build & run for production
pnpm build && pnpm start
```

## Mock Scanning

There are a couple different modes the mock scanners operate in. Choose the one that's appropriate for you.

### Multi-sheet scanner

```sh
# single batch with single sheet
MOCK_SCANNER_FILES=front.jpeg,back.jpeg pnpm dev

# single batch with multiple sheets
MOCK_SCANNER_FILES=front-01.jpeg,back-01.jpeg,front-02.jpeg,back-02.jpeg pnpm dev

# multiple batches with one sheet each (note ",," batch separator)
MOCK_SCANNER_FILES=front-01.jpeg,back-01.jpeg,,front-02.jpeg,back-02.jpeg pnpm dev

# use a manifest file
cat <<EOS > manifest
# first batch (this is a comment)
front-01.jpeg
back-01.jpeg

# second batch
front-02.jpeg
back-02.jpeg
EOS
MOCK_SCANNER_FILES=@manifest pnpm dev

# scanning from an election backup file
./bin/extract-backup /path/to/election-backup.zip
MOCK_SCANNER_FILES=@/path/to/election-backup/manifest pnpm dev
```

If you are seeing unhandled promise rejection errors you may have an issue with
where your image files are located, try moving them into the local scope of the
app.

### Single-sheet scanner

This mode is designed for use with `precinct-scanner`.

```sh
# start the server with an HTTP-based mock
VX_MACHINE_TYPE=precinct-scanner MOCK_SCANNER_HTTP=1 pnpm dev

# in another terminal, simulate the user feeding paper into the scanner:
curl -X PUT -d '{"files":["/path/to/front.jpg", "/path/to/back.jpg"]}' -H 'Content-Type: application/json' http://localhost:9999/mock

# simulate the user pulling the loaded paper out of the scanner:
curl -X DELETE http://localhost:9999/mock
```

## Switching Workspaces

By default a `ballots.db` file and a `ballot-images` directory will be created
in the root of the folder when running this service. To choose another location,
set `MODULE_SCAN_WORKSPACE` to the path to another folder:

```sh
$ MODULE_SCAN_WORKSPACE=/path/to/workspace pnpm dev
```

## API Documentation

This scanner module provides the following API:

- `GET /scan/status` returns status information:

  ```
  {"batches": [
      {
       "id": <batchId>,
       "count": <count>,
       "startedAt: <startedAt>,
       "endedAt": <endedAt>
      }
   ]
  }
  ```

- `PATCH /config` configures `election` with an `election.json` or `testMode`

- `POST /scan/invalidateBatch` invalidates a batch

  - `batchId`

- `POST /scan/scanBatch` scans a batch of ballots and stores them in the
  scanner's database

- `POST /scan/export` return all the CVRs as an attachment

- `DELETE /scan/batch/:batchId` delete a batch by ID

- `POST /scan/zero` zero's all data but not the election config
