use crate::cdf;
use crate::vx;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Read error: {0}")]
    Read(#[from] vx::LogReaderError),

    #[error("Missing or invalid entry '{0}")]
    MissingOrInvalidEntry(String),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

const TIME_LOG_WRITTEN_KEY: &str = "timeLogWritten";

impl TryFrom<vx::LogEntry> for cdf::Event {
    type Error = Error;

    fn try_from(value: vx::LogEntry) -> std::result::Result<Self, Self::Error> {
        let log_line = value.line?;
        let lineno = value.lineno;
        let lineno0 = lineno - 1;

        let time_log_written = match log_line.extras.get(TIME_LOG_WRITTEN_KEY) {
            Some(serde_json::Value::String(time_log_written)) => time_log_written,
            Some(_) | None => {
                return Err(Error::MissingOrInvalidEntry(
                    TIME_LOG_WRITTEN_KEY.to_owned(),
                ))
            }
        };

        let disposition = if log_line.disposition.is_empty() {
            cdf::EventDispositionType::Na
        } else {
            serde_json::from_value::<cdf::EventDispositionType>(serde_json::Value::String(
                log_line.disposition.clone(),
            ))
            .unwrap_or(cdf::EventDispositionType::Other)
        };

        let mut details = log_line.extras.clone();
        details.remove(TIME_LOG_WRITTEN_KEY);
        details.insert(
            "source".to_owned(),
            serde_json::Value::String(log_line.source.to_string()),
        );
        Ok(cdf::Event {
            object_type: cdf::EventType::Event,
            id: log_line.event_id.to_string(),
            disposition,
            other_disposition: if disposition == cdf::EventDispositionType::Other {
                Some(log_line.disposition.clone())
            } else {
                None
            },
            sequence: lineno0.to_string(),
            time_stamp: time_log_written.to_owned(),
            r#type: log_line.event_type.to_string(),
            description: log_line.message,
            details: Some(serde_json::to_string(&details)?),
            user_id: Some(log_line.user.to_string()),
            hash: None,
            severity: None,
        })
    }
}
