# Scan Module

This web server component provides a web interface to a scanner

## Install Requisite Software

```sh
# install application packages
yarn install

# install external tools
make install
```

## Run Tests

```sh
yarn test
```

## Start the Server

```sh
yarn start
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

- `POST /scan/configure` configures the scanner with an `election.json` as the
  body

- `POST /scan/invalidateBatch` invalidates a batch

  - `batchId`

- `POST /scan/scanBatch` scans a batch of ballots and stores them in the
  scanner's database

- `POST /scan/export` return all the CVRs as an attachment

- `POST /scan/zero` zero's all data but not the election config

- `POST /scan/unconfigure` removes all configuration information and data

## Architecture
