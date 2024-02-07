use std::io::Write;
use std::{io::stdout, sync::OnceLock};
pub(crate) static APP_NAME: OnceLock<String> = OnceLock::new();

/// Prints a log to stdout in JSON format. You probably want to use the `log!` macro instead of
/// calling this directly.
///
/// # Example
///
/// ```
/// use vx_logging::{print_log, Log, EventId, set_app_name};
///
/// set_app_name("my-app");
/// print_log(&Log {
///    event_id: EventId::AuthLogin,
///    message: format!("User {user} logged in", user = "test-user"),
///    ..Default::default()
/// });
pub fn print_log(log: &Log) {
    let mut stdout = stdout().lock();
    match serde_json::to_writer(&mut stdout, &log) {
        Ok(()) => {
            let _ = writeln!(&mut stdout);
        }
        Err(e) => eprintln!("Error serializing log: {e}"),
    };
}

pub fn set_app_name(app_name: impl Into<String>) {
    APP_NAME.set(app_name.into()).unwrap();
}

mod log_event_enums;
pub use self::log_event_enums::EventId;

pub mod types;
pub use self::types::{Disposition, EventType, Log, User};
