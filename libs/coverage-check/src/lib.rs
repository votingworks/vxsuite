//! Enforces the repo's per-entity coverage invariant: every uncovered
//! statement, function, and branch in a coverage report must carry an inline
//! `@coverage-exclude` / `@coverage-defer` directive (or be auto-excluded by
//! policy, e.g. never-param call sites). Runs after `vitest run --coverage`
//! and reads the istanbul `coverage-final.json` it produces.

pub mod analyze;
pub mod attach;
pub mod classify;
pub mod corpus;
pub mod diagnostics;
pub mod grammar;
pub mod lines;
pub mod never;
pub mod report;
