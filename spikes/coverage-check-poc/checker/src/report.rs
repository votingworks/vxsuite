// coverage-final.json structures, tolerant of the remapped-report data shapes:
// end columns are null, implicit-else branch locations are empty objects.

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

pub fn load_report(path: &std::path::Path) -> Result<HashMap<String, FileCov>, String> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| format!("cannot read report {}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("bad report json: {e}"))
}
