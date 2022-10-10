# SEMS Converter Module

This web server component provides a web interface to convert files for
Mississippi's SEMS.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.
This service is intended to be run as part of the VxAdmin stack and is used by
the `election-manager` frontend, not run on its own. To run it as part of
VxAdmin, first build this service and then run the `election-manager` frontend:

```sh
# in services/converter-ms-sems
make install-dev-dependencies
make build

# in frontends/election-manager
pnpm start
```

## Run Tests

Install dependencies you need

```
make install-dev-dependencies
```

and then run the tests

```
make test
```

With code coverage

```
make coverage
```

## Start the Development Server

```
make run
```

## API

First, some API calls to work with election definitions:

- `GET /convert/election/files` lists the files that are needed for conversion
  into an election file as well as the files that are produced by the conversion
  process.

  ```
  {
  "inputFiles": [{"name": <filename>, "path": <filepath>}, ...],
  "outputFiles": [{"name": "Vx Election Definition", "path": <filepath>}]
  }
  ```

  where `<filepath>` is null if not yet uploaded.

- `POST /convert/election/submitfile` sends a needed file with parameters with
  `enctype="multipart/form-data"`

  - `name` which should be one of the file names from `filelist`
  - `file` is the file being uploaded

- `POST /convert/election/process` converts SEMS election files to a Vx Election
  File, doesn't return anything.

- `GET /convert/election/output?name=<name>` download the election.json file
  from `outputFiles`.

- `POST /convert/reset` resets input and output file paths.

Next, we do results

- `GET /convert/results/files` lists the files for input and output, just like
  above

  ```
  {
  "inputFiles": [{"name": "Vx Election Definition", "path": <filepath>}, {"name": "CVRs", "path": <filepath>}],
  "outputFiles": [{"name": "election.json", "path": <filepath>}]
  }
  ```

  where `<filepath>` is null if not yet uploaded.

- `POST /convert/results/submitfile` submit a file,
  `enctype="multipart/form-data`

  - `name` of the inputFile
  - `file`

- `POST /convert/results/process` converts Vx CVRs to a SEMS result file

- `GET /convert/results/output?name=<name>` download the result file indicated
  by the name picked from the `results/filelist`

- `POST /convert/reset` resets input and output file paths.
