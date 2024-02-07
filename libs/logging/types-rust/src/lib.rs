use std::{io::stdout, sync::OnceLock};
pub(crate) static APP_NAME: OnceLock<String> = OnceLock::new();

pub fn print_log(log: Log) {
    match serde_json::to_writer(stdout(), &log) {
        Ok(_) => println!(),
        Err(e) => eprintln!("Error serializing log: {e}"),
    }
}

pub fn set_app_name(app_name: impl Into<String>) {
    APP_NAME.set(app_name.into()).unwrap();
}

mod log_event_enums;
pub use self::log_event_enums::EventId;

pub mod types;
pub use self::types::{Disposition, EventType, Log, User};
