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

/// Log a message with the given event id.
///
/// # Example
///
/// ```
/// use vx_logging::{log, set_app_name, Disposition, EventId};
///
/// set_app_name("my-app");
///
/// // shorthand versions: event ID and optional message
/// log!(EventId::MachineBootComplete);
/// log!(EventId::AuthLogin, "User {user} logged in", user = "test-user");
///
/// // full version: specify any set of fields by name
/// log!(
///    message: format!("User {user} blocked!", user = "bad-user"),
///    event_id: EventId::AuthLogin,
///    disposition: Disposition::Failure
/// );
/// ```
#[macro_export]
macro_rules! log {
    ($event_id:expr) => {
        $crate::print_log(&$crate::Log {
            event_id: $event_id,
            ..Default::default()
        });
    };
    ($event_id:expr, $($format_args:tt)*) => {
        $crate::print_log(&$crate::Log {
            event_id: $event_id,
            message: format!($($format_args)*),
            ..Default::default()
        });
    };
    ($event_id:expr; $event_type:expr) => {
        $crate::print_log(&$crate::Log {
            event_id: $event_id,
            event_type: $event_type,
            ..Default::default()
        });
    };
    ($($arg:tt)*) => {
        $crate::print_log(&$crate::Log {
            $($arg)*,
            ..Default::default()
        });
    };
}

/// Set the app name to be used in logs for this process.
///
/// # Example
///
/// ```
/// use vx_logging::{log, set_app_name, EventId};
///
/// set_app_name("my-app");
/// log!(EventId::AuthLogin, "User {user} logged in", user = "test-user");
/// ```
pub fn set_app_name(app_name: impl Into<String>) {
    if let Err(e) = APP_NAME.set(app_name.into()) {
        eprintln!("Error setting app name: {e}");
    }
}

mod log_event_enums;
pub use self::log_event_enums::EventId;

pub mod types;
pub use self::types::{Disposition, EventType, Log, User};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_set_app_name() {
        set_app_name("test-app");
        assert_eq!(APP_NAME.get().unwrap(), "test-app");
    }

    #[test]
    fn test_print_log() {
        set_app_name("test-app");

        print_log(&Log::default());
    }

    #[test]
    fn test_log_macro() {
        set_app_name("test-app");

        log!(EventId::MachineBootComplete);

        let user = "test-user";
        log!(EventId::AuthLogin, "somebody logged in: {user}");

        log!(
            message: format!("here is a log message: {}", "what!"),
            event_id: EventId::AuthLogin,
            disposition: Disposition::Failure
        );
    }
}
