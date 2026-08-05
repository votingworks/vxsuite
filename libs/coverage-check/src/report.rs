//! `coverage-final.json` structures, tolerant of the remapped-report data
//! shapes: end columns are null, implicit-else branch locations are empty
//! objects.

use serde::Deserialize;
use std::collections::HashMap;

use crate::lines::LinePos;

#[derive(Debug, Deserialize, Default, Clone)]
pub struct RawPos {
    #[serde(default)]
    pub line: Option<u32>,
    #[serde(default)]
    pub column: Option<i64>,
}

#[derive(Debug, Deserialize, Default, Clone)]
pub struct RawRange {
    #[serde(default)]
    pub start: Option<RawPos>,
    #[serde(default)]
    pub end: Option<RawPos>,
}

impl RawRange {
    /// Start as (line, col), if the location is non-empty.
    #[must_use]
    pub fn start_pos(&self) -> Option<LinePos> {
        let start = self.start.as_ref()?;
        let line = start.line?;
        let col = start.column.unwrap_or(0);
        let col = u32::try_from(col.max(0)).unwrap_or(0);
        Some((line, col))
    }
}

#[derive(Debug, Deserialize, Clone)]
pub struct RawFn {
    pub name: String,
    pub decl: RawRange,
    pub loc: RawRange,
}

#[derive(Debug, Deserialize, Clone)]
pub struct RawBranch {
    pub loc: RawRange,
    #[serde(rename = "type")]
    pub branch_type: String,
    pub locations: Vec<RawRange>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct FileCov {
    pub path: String,
    #[serde(default, rename = "statementMap")]
    pub statement_map: HashMap<String, RawRange>,
    #[serde(default, rename = "fnMap")]
    pub fn_map: HashMap<String, RawFn>,
    #[serde(default, rename = "branchMap")]
    pub branch_map: HashMap<String, RawBranch>,
    #[serde(default)]
    pub s: HashMap<String, i64>,
    #[serde(default)]
    pub f: HashMap<String, i64>,
    #[serde(default)]
    pub b: HashMap<String, Vec<i64>>,
}

impl FileCov {
    #[must_use]
    pub fn empty(path: &std::path::Path) -> Self {
        Self {
            path: path.display().to_string(),
            statement_map: HashMap::default(),
            fn_map: HashMap::default(),
            branch_map: HashMap::default(),
            s: HashMap::default(),
            f: HashMap::default(),
            b: HashMap::default(),
        }
    }

    #[must_use]
    pub fn has_uncovered(&self) -> bool {
        self.s.values().any(|v| *v == 0)
            || self.f.values().any(|v| *v == 0)
            || self.b.values().any(|arr| arr.contains(&0))
    }

    #[must_use]
    pub fn has_any_hit(&self) -> bool {
        self.s.values().any(|v| *v > 0)
            || self.f.values().any(|v| *v > 0)
            || self.b.values().any(|arr| arr.iter().any(|v| *v > 0))
    }
}

pub type Report = HashMap<String, FileCov>;

/// # Errors
///
/// Returns an error if the report file cannot be read or is not valid
/// istanbul JSON.
pub fn load_report(path: &std::path::Path) -> Result<Report, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("cannot read report {}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("bad report json: {e}"))
}

/// Partial-run detection: a watch-mode, `--changed`, filtered, or failing run
/// produces a report where the files whose tests never executed show every
/// entity at 0 hits, which would flood the checker with bogus failures. The
/// script-level `&&` wiring is the primary guard; this heuristic is the
/// belt-and-suspenders refusal for reports that slipped past it.
#[must_use]
pub fn partial_run_signal(report: &Report) -> Option<String> {
    // Small packages can legitimately concentrate coverage in few files;
    // don't guess below this size.
    const MIN_FILES: usize = 10;
    let total = report.len();
    if total < MIN_FILES {
        return None;
    }
    let unexecuted = report.values().filter(|fc| !fc.has_any_hit()).count();
    if unexecuted * 2 > total {
        Some(format!(
            "{unexecuted} of {total} files in the report have no executed entities at all — \
             this looks like a partial coverage run (watch mode, --changed, a filtered run, \
             or a failed run). Re-run the full suite: vitest run --coverage"
        ))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file_cov(hits: i64) -> FileCov {
        let mut cov = FileCov::empty(std::path::Path::new("x.ts"));
        cov.s.insert("0".to_string(), hits);
        cov
    }

    fn report_with(executed: usize, unexecuted: usize) -> Report {
        let mut report = Report::new();
        for i in 0..executed {
            report.insert(format!("e{i}"), file_cov(1));
        }
        for i in 0..unexecuted {
            report.insert(format!("u{i}"), file_cov(0));
        }
        report
    }

    #[test]
    fn small_reports_are_never_flagged() {
        assert_eq!(partial_run_signal(&report_with(0, 9)), None);
    }

    #[test]
    fn majority_unexecuted_is_flagged() {
        let signal = partial_run_signal(&report_with(4, 6)).expect("flagged");
        assert!(signal.contains("6 of 10 files"), "{signal}");
    }

    #[test]
    fn exactly_half_unexecuted_is_not_flagged() {
        assert_eq!(partial_run_signal(&report_with(5, 5)), None);
    }

    #[test]
    fn healthy_report_is_not_flagged() {
        assert_eq!(partial_run_signal(&report_with(50, 2)), None);
    }
}
