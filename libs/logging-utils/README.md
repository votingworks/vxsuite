# Logging Utils

Provides utilities for logging. See [`libs/logging`](../logging).

## Utilities

### `convertVxLogToCdf`

Converts a log file produced with the VotingWorks JSON-lines format and produces a log file in the CDF event logging format.

## Build

This package use [NAPI-RS](https://napi.rs/) to produce a NodeJS addon in Rust. The JavaScript and TypeScript definitions are all auto-generated and should not be edited manually.
