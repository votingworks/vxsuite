// Non-generated types. This file can be edited directly.
use serde::{Deserialize, Serialize};

use crate::log_event_enums::EventId;

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
#[serde(deny_unknown_fields)]
pub struct Log {
    pub source: String,
    #[serde(rename = "event-id")]
    pub event_id: EventId,
    pub message: String,
    #[serde(rename = "event-type")]
    pub event_type: EventType,
    pub user: String,
    pub disposition: Disposition,
}
