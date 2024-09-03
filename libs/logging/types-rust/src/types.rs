// Non-generated types. This file can be edited directly.
use serde::{Deserialize, Serialize};

use crate::{log_event_enums::EventId, APP_NAME};

#[derive(Serialize, Deserialize)]
pub enum EventType {
    #[serde(rename = "system-action")]
    SystemAction,
    #[serde(rename = "system-status")]
    SystemStatus,
}

#[derive(Serialize, Deserialize)]
pub enum Disposition {
    #[serde(rename = "success")]
    Success,
    #[serde(rename = "failure")]
    Failure,
    #[serde(rename = "n/a")]
    NA,
}

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

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct Log {
    pub source: String,
    pub event_id: EventId,
    pub message: String,
    pub event_type: EventType,
    pub user: User,
    pub disposition: Disposition,
}

impl Default for Log {
    fn default() -> Self {
        let app_name = APP_NAME.get().expect("App name is not initialized").clone();
        Self {
            source: app_name,
            user: User::System,
            event_id: EventId::Unspecified,
            event_type: EventType::SystemStatus,
            message: String::new(),
            disposition: Disposition::NA,
        }
    }
}
