use serde::{Deserialize, Serialize};

const APP_NAME: &str = "vx-mark-scan-controller-daemon";

#[derive(Serialize, Deserialize)]
#[serde(rename = "event-type")]
pub enum EventType {
    #[serde(rename = "system-action")]
    SystemAction,
    #[serde(rename = "system-status")]
    SystemStatus,
}

#[derive(Serialize, Deserialize)]
#[serde(rename = "disposition")]
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
    pub event_id: String,
    pub message: String,
    #[serde(rename = "event-type")]
    pub event_type: EventType,
    pub user: String,
    pub disposition: Disposition,
}

impl Default for Log {
    fn default() -> Self {
        Self {
            source: APP_NAME.to_string(),
            event_id: "".to_string(),
            message: "".to_string(),
            event_type: EventType::SystemStatus,
            user: "system".to_string(),
            disposition: Disposition::NA,
        }
    }
}

pub fn log(log: Log) -> () {
    match serde_json::to_string(&log) {
        Ok(json) => {
            println!("{}", json);
        }
        Err(e) => {
            println!("Error serializing log: {e}");
        }
    }
}
