//! Golden-corpus support: analyze the corpus fixtures against their committed
//! coverage report and compare with the expected verdicts (`expected/*.json`).
//! Consumed by the cargo integration test (the enforcement path) and the
//! `dump` CLI subcommand (for auditing and regenerating expected files).
//!
//! The committed report records absolute paths from the machine that
//! generated it, so fixtures are matched to report entries by file name
//! (unique within the corpus) — never by absolute path.

use std::collections::HashSet;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::analyze::analyze_file;
use crate::classify::FileAnalysis;
use crate::lines::LineTable;
use crate::never::{build_registry, source_files};
use crate::report::{load_report, FileCov, Report};

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct DirectiveRecord {
    pub line: u32,
    pub label: String,
    pub form: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub binds: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub stale: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EntityRecord {
    pub id: String,
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub branch_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attributed_at: Option<String>,
    pub hits: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snippet: Option<String>,
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FixtureRecord {
    pub file: String,
    pub directives: Vec<DirectiveRecord>,
    pub entities: Vec<EntityRecord>,
}

fn normalize_snippet(text: &str, max_chars: usize) -> String {
    let collapsed: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(max_chars).collect()
}

#[must_use]
pub fn snippet_at(source: &str, table: &LineTable, at: (u32, u32)) -> String {
    match table.offset_of(source, at) {
        Some(offset) => normalize_snippet(&source[offset..], 40),
        None => String::from("<pos not found>"),
    }
}

#[must_use]
pub fn to_record(
    file_name: &str,
    source: &str,
    analysis: &FileAnalysis,
    with_dump_fields: bool,
) -> FixtureRecord {
    let table = LineTable::new(source);
    let directives = analysis
        .directives
        .iter()
        .map(|d| DirectiveRecord {
            line: d.line,
            label: d.label.as_str().to_string(),
            form: d.form.as_str().to_string(),
            reason: d.reason.clone(),
            binds: d
                .binds_range
                .map(|(start, end)| normalize_snippet(&source[start as usize..end as usize], 60)),
            error: d.error.map(|e| e.as_str().to_string()),
            stale: d.stale,
        })
        .collect();
    let entities = analysis
        .entities
        .iter()
        .map(|e| EntityRecord {
            id: e.id.clone(),
            kind: e.kind.to_string(),
            branch_type: e.branch_type.clone(),
            at: e.at.map(|(l, c)| format!("{l}:{c}")),
            attributed_at: e.attributed_at.map(|(l, c)| format!("{l}:{c}")),
            hits: e.hits,
            snippet: if with_dump_fields {
                e.at.or(e.attributed_at)
                    .map(|p| snippet_at(source, &table, p))
            } else {
                None
            },
            status: e.status.as_str().to_string(),
            note: e.note.clone(),
        })
        .collect();
    FixtureRecord {
        file: file_name.to_string(),
        directives,
        entities,
    }
}

fn corpus_fixtures(corpus_dir: &Path) -> Vec<PathBuf> {
    let mut files = source_files(&corpus_dir.join("fixtures"));
    files.sort();
    files
}

/// # Errors
///
/// Returns an error if the corpus coverage report is missing or malformed.
fn load_corpus(corpus_dir: &Path) -> Result<(Vec<PathBuf>, Report, HashSet<String>), String> {
    let report = load_report(&corpus_dir.join("coverage/coverage-final.json"))?;
    let fixtures = corpus_fixtures(corpus_dir);
    if fixtures.is_empty() {
        return Err(format!("no fixtures found in {}", corpus_dir.display()));
    }
    let never_names = build_registry(&[&corpus_dir.join("fixtures")]);
    Ok((fixtures, report, never_names))
}

/// Fixture file names are unique in the corpus; the committed report's
/// absolute paths are machine-specific, so match by name only.
fn find_cov<'r>(report: &'r Report, path: &Path) -> Option<&'r FileCov> {
    let name = path.file_name()?;
    report
        .values()
        .find(|fc| Path::new(&fc.path).file_name() == Some(name))
}

fn analyze_fixture(path: &Path, report: &Report, never_names: &HashSet<String>) -> FixtureRecord {
    let source = std::fs::read_to_string(path)
        .unwrap_or_else(|e| panic!("fixture {} unreadable: {e}", path.display()));
    let cov = find_cov(report, path)
        .cloned()
        .unwrap_or_else(|| FileCov::empty(path));
    let analysis = analyze_file(path, &source, &cov, never_names);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    to_record(&name, &source, &analysis, false)
}

/// Analyze all fixtures and render them as pretty JSON (the `dump`
/// subcommand; used when auditing or regenerating `expected/`). Includes
/// snippet fields, which the expected files omit.
///
/// # Errors
///
/// Returns an error if the corpus cannot be loaded.
pub fn dump(corpus_dir: &Path) -> Result<String, String> {
    let (fixtures, report, never_names) = load_corpus(corpus_dir)?;
    let mut records = Vec::new();
    for path in &fixtures {
        let source = std::fs::read_to_string(path)
            .map_err(|e| format!("fixture {} unreadable: {e}", path.display()))?;
        let cov = find_cov(&report, path)
            .cloned()
            .unwrap_or_else(|| FileCov::empty(path));
        let analysis = analyze_file(path, &source, &cov, &never_names);
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        records.push(to_record(&name, &source, &analysis, true));
    }
    serde_json::to_string_pretty(&records).map_err(|e| format!("serialize failed: {e}"))
}

/// Compare every fixture's analysis against its `expected/*.json`. Returns
/// one human-readable line per divergence; empty means the corpus passes.
///
/// # Errors
///
/// Returns an error if the corpus cannot be loaded or an expected file is
/// malformed.
pub fn run(corpus_dir: &Path) -> Result<Vec<String>, String> {
    let (fixtures, report, never_names) = load_corpus(corpus_dir)?;
    let mut failures = Vec::new();
    for path in &fixtures {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let expected_path = corpus_dir.join("expected").join(format!("{stem}.json"));
        let Ok(expected_text) = std::fs::read_to_string(&expected_path) else {
            failures.push(format!(
                "{name}: missing expected file {}",
                expected_path.display()
            ));
            continue;
        };
        let expected: FixtureRecord = serde_json::from_str(&expected_text)
            .map_err(|e| format!("{}: bad expected json: {e}", expected_path.display()))?;
        let actual = analyze_fixture(path, &report, &never_names);
        for diff in diff_records(&actual, &expected) {
            failures.push(format!("{name}: {diff}"));
        }
    }
    Ok(failures)
}

fn diff_records(actual: &FixtureRecord, expected: &FixtureRecord) -> Vec<String> {
    let mut diffs: Vec<String> = Vec::new();
    if actual.directives != expected.directives {
        for (a, e) in actual.directives.iter().zip(expected.directives.iter()) {
            if a != e {
                diffs.push(format!(
                    "directive L{}: actual {a:?} != expected {e:?}",
                    a.line
                ));
            }
        }
        if actual.directives.len() != expected.directives.len() {
            diffs.push(format!(
                "directive count: actual {} != expected {}",
                actual.directives.len(),
                expected.directives.len()
            ));
        }
    }
    for e in &expected.entities {
        match actual.entities.iter().find(|a| a.id == e.id) {
            None => diffs.push(format!("entity {}: missing in actual", e.id)),
            Some(a) if a.status != e.status => diffs.push(format!(
                "entity {} at {:?}: actual status {} != expected {}",
                e.id, a.at, a.status, e.status
            )),
            _ => {}
        }
    }
    for a in &actual.entities {
        if !expected.entities.iter().any(|e| e.id == a.id) {
            diffs.push(format!(
                "entity {} at {:?} ({}, hits {}): not in expected",
                a.id, a.at, a.status, a.hits
            ));
        }
    }
    diffs
}
