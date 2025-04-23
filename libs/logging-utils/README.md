# Logging Utils

Provides utilities for logging. See [`libs/logging`](../logging).

## Utilities

### `convertVxLogToCdf`

Converts a log file produced with the VotingWorks JSON-lines format and produces a log file in the CDF event logging format.

## Build

This package use [NAPI-RS](https://napi.rs/) to produce a NodeJS addon in Rust. The JavaScript and TypeScript definitions are all auto-generated and should not be edited manually.

### Development

> **Tip:** Install [`zellij`](https://zellij.dev/) (`cargo install zellij`) for an improved build & test experience with `pnpm test:watch`.

- `pnpm test:watch` (or just `pnpm test` in dev): runs tests and builds, both re-building and re-testing on changes.
- `pnpm build:watch`: builds just this package, watching for changes and re-building.
- `pnpm build`: builds the package and all its dependencies.
