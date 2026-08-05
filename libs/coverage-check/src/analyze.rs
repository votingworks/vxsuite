//! Per-file analysis: parse + bind directives + classify against coverage.
//! The parse is the expensive step, so callers gate it behind
//! [`has_directive_text`] and the report's uncovered-entity check
//! (skip-most-files invariant).

use std::collections::HashSet;
use std::path::Path;

use oxc_allocator::Allocator;

use crate::attach::{bind_directives, parse_file, BoundDirective};
use crate::classify::{classify, FileAnalysis};
use crate::report::FileCov;

/// Cheap raw-text pre-filter: `false` guarantees the file contains no
/// directives (the grammar requires the `@`-prefixed label verbatim).
#[must_use]
pub fn has_directive_text(source: &str) -> bool {
    source.contains("@coverage-exclude") || source.contains("@coverage-defer")
}

fn source_len(source: &str) -> u32 {
    u32::try_from(source.len()).expect("source file smaller than 4 GiB")
}

#[must_use]
#[allow(clippy::implicit_hasher)]
pub fn analyze_file(
    path: &Path,
    source: &str,
    cov: &FileCov,
    never_names: &HashSet<String>,
) -> FileAnalysis {
    let allocator = Allocator::default();
    let parsed = parse_file(&allocator, path, source);
    let directives = bind_directives(&parsed, source_len(source));
    classify(source, &parsed, &directives, cov, never_names)
}

/// Bind directives without coverage data — for directive-bearing files that
/// never made it into the report (no instrumentable entities).
#[must_use]
pub fn bind_only(path: &Path, source: &str) -> Vec<BoundDirective> {
    let allocator = Allocator::default();
    let parsed = parse_file(&allocator, path, source);
    bind_directives(&parsed, source_len(source))
}
