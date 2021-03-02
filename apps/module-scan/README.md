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

You can also scan directly from image files instead of using a real scanner:

```sh
# single batch with single sheet
MOCK_SCANNER_FILES=front.png,back.png pnpm dev

# single batch with multiple sheets
MOCK_SCANNER_FILES=front-01.png,back-01.png,front-02.png,back-02.png pnpm dev

# multiple batches with one sheet each (note ",," batch separator)
MOCK_SCANNER_FILES=front-01.png,back-01.png,,front-02.png,back-02.png pnpm dev

# use a manifest file
cat <<EOS > manifest
# first batch (this is a comment)
front-01.png
back-01.png

# second batch
front-02.png
back-02.png
EOS
MOCK_SCANNER_FILES=@manifest pnpm dev

# scanning from an election backup file
./bin/extract-backup /path/to/election-backup.zip
MOCK_SCANNER_FILES=@/path/to/election-backup/manifest pnpm dev
```

If you are seeing unhandled promise rejection errors you may have an issue with where your image files are located, try moving them into the local scope of the app.

### Using Fixtures Data

To force `requires_adjudication` of ballots, run this in `module-scan`:
```
sqlite3 dev-workspace/ballots.db 'update sheets set requires_adjudication = 1;'
```

#### Letter-sized ballots

First init `module-smartcards` with:
```
./mockCardReader.py enable --admin ../module-scan/test/fixtures/2020-choctaw/election.json
```

Init `module-scan` with:
```
MOCK_SCANNER_FILES=test/fixtures/2020-choctaw/ballot-p1.jpg,test/fixtures/2020-choctaw/ballot-p2.jpg pnpm dev
```

#### Legal-sized ballots

First init `module-smartcards` with:
```
./mockCardReader.py enable --admin ../../libs/hmpb-interpreter/test/fixtures/choctaw-county-2020-general-election/election.json
```

Init `module-scan` with:
```
MOCK_SCANNER_FILES=../../libs/hmpb-interpreter/test/fixtures/choctaw-county-2020-general-election/filled-in-p1-03.png,../../libs/hmpb-interpreter/test/fixtures/choctaw-county-2020-general-election/filled-in-p2-03.png pnpm dev
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
