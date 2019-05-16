# Scan Module

This web server component provides a web interface to a scanner

## Install Requisite Software

```
yarn install
```

## Run Tests

```
yarn test
```

## Start the Server

```
yarn start
```

## API Documentation

This scanner module provides the following API:

* `POST /scan/configure` configures the scanner with an `election.json`
* `POST /scan/scan` scans a batch of ballots and stores them in the scanner's database
* `GET /scan/status` returns status information about scanned ballots so far
* `POST /scan/export` saves all the CVRs to a USB stick
* `POST /scan/zero` zero's all data

## Architecture


