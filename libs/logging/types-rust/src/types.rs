use std::collections::HashMap;

// Non-generated types. This file can be edited directly.
use serde::{Deserialize, Serialize};

use crate::{
    derive_display,
    log_event_enums::{EventId, EventType, Source},
    SOURCE,
};

#[derive(Serialize, Deserialize)]
pub enum Disposition {
    #[serde(rename = "success")]
    Success,
    #[serde(rename = "failure")]
    Failure,
    #[serde(rename = "n/a")]
    NA,
}

derive_display!(Disposition);

#[derive(Serialize, Deserialize)]
pub enum User {
    #[serde(rename = "system")]
    System,
    #[serde(rename = "system_administrator")]
    SystemAdministrator,
    #[serde(rename = "election_manager")]
    ElectionManager,
    #[serde(rename = "poll_worker")]
    PollWorker,
    #[serde(rename = "cardless_voter")]
    CardlessVoter,
    // dash-case serialization for VxStaff is consistent with TypeScript implementation
    #[serde(rename = "vx-staff")]
    VxStaff,
    #[serde(rename = "unknown")]
    Unknown,
}

derive_display!(User);

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub source: Source,
    pub event_id: EventId,
    pub message: String,
    pub event_type: EventType,
    pub user: User,
    pub disposition: Disposition,
    #[serde(flatten)]
    pub extras: HashMap<String, serde_json::Value>,
}

impl Default for Log {
    fn default() -> Self {
        let source = *SOURCE.get().expect("Log source is not initialized");
        Self {
            source,
            user: User::System,
            event_id: EventId::Unspecified,
            event_type: EventType::SystemStatus,
            message: String::new(),
            disposition: Disposition::NA,
            extras: HashMap::default(),
        }
    }
}
