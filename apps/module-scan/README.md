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

There are a few ways of scanning using a mock scanner instead of a real one.

### Define batches upfront

You can defined the batches of sheets to scan upfront.

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

### Define batches dynamically

Use an HTTP-controlled scanner to add and update batches as `module-scan` runs:

```sh
# start module-scan
MOCK_SCANNER=remote pnpm dev

# in another terminal:
./bin/mock-scanner new-batch path/to/front.jpg path/to/back.jpg
./bin/mock-scanner add-to-batch path/to/front2.jpg path/to/back2.jpg
```

You can issue updates to the remote scanner as long as `module-scan` is running.

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
