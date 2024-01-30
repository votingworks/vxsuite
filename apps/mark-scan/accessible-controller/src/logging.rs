use vx_logging::{
    log_event_enums::EventId,
    print_log,
    types::{Disposition, EventType, Log},
};

const APP_NAME: &str = "vx-mark-scan-controller-daemon";

// This module's purpose is to wrap vx_logging functionality and
// provide defaults specific to this app.

pub struct MarkScanLog {
    pub event_id: EventId,
    pub event_type: EventType,
    pub message: String,
    pub disposition: Disposition,
    // `source` and `user` are omitted because they will always be the same
}

impl Default for MarkScanLog {
    fn default() -> Self {
        Self {
            event_id: EventId::Unspecified,
            event_type: EventType::SystemStatus,
            message: "".to_string(),
            disposition: Disposition::NA,
        }
    }
}

pub fn log(log: MarkScanLog) {
    let full_log = Log {
        source: APP_NAME.to_string(),
        user: "system".to_string(),
        event_id: log.event_id,
        event_type: log.event_type,
        message: log.message,
        disposition: log.disposition,
    };

    print_log(full_log);
}
