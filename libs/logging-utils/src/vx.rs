use std::{
    collections::HashMap,
    fmt::Display,
    io::{BufRead, Lines},
};

use serde::{Deserialize, Serialize};
use vx_logging::{EventId, EventType, Source};

/// Data contained by a single line of a VX-style log file, in JSON.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLine {
    pub source: Source,
    pub event_id: EventId,
    pub event_type: EventType,
    pub user: UserRole,
    pub disposition: Disposition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_log_initiated: Option<String>,

    #[serde(flatten)]
    pub extras: HashMap<String, serde_json::Value>,
}

/// Possible roles for a user.
// TODO: Generate this in vx_logging based on the TOML config.
#[derive(Serialize, Deserialize)]
pub enum UserRole {
    #[serde(rename = "vendor")]
    Vendor,
    #[serde(rename = "system_administrator")]
    SystemAdministrator,
    #[serde(rename = "election_manager")]
    ElectionManager,
    #[serde(rename = "poll_worker")]
    PollWorker,
    #[serde(rename = "cardless_voter")]
    CardlessVoter,
    #[serde(rename = "vx-staff")]
    VxStaff,
    #[serde(rename = "system")]
    System,
    #[serde(rename = "unknown")]
    Unknown,
}

impl Display for UserRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.serialize(f)
    }
}

pub type Disposition = String;

/// Reads log entries from a buffered reader.
pub struct LogReader<R: BufRead> {
    lines: Lines<R>,
    lineno: usize,
}

impl<R> LogReader<R>
where
    R: BufRead,
{
    pub fn new(reader: R) -> Self {
        Self {
            lines: reader.lines(),
            lineno: 0,
        }
    }

    fn handle_line(line: Result<String, std::io::Error>) -> Result<LogLine, LogReaderError> {
        let line = line?;
        Ok(serde_json::from_str(&line)?)
    }
}

impl<R> Iterator for LogReader<R>
where
    R: BufRead,
{
    type Item = LogEntry;

    fn next(&mut self) -> Option<Self::Item> {
        let result = self.lines.next()?;
        self.lineno += 1;
        let lineno = self.lineno;

        match result {
            Ok(line) => Some(LogEntry {
                line: Self::handle_line(Ok(line.clone())),
                original: Some(line),
                lineno,
            }),
            Err(e) => Some(LogEntry {
                line: Self::handle_line(Err(e)),
                original: None,
                lineno,
            }),
        }
    }
}

/// A log line and its line number.
pub struct LogEntry {
    pub line: Result<LogLine, LogReaderError>,
    pub original: Option<String>,
    pub lineno: usize,
}

impl LogEntry {
    pub fn error_detail(&self) -> Option<String> {
        if let Some(original) = &self.original {
            return Some(original.clone());
        }

        if let Err(e) = &self.line {
            return Some(e.to_string());
        }

        None
    }
}

#[derive(Debug, thiserror::Error)]
pub enum LogReaderError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parsing entry failed: {0}")]
    ParseFailed(#[from] serde_json::Error),
}
