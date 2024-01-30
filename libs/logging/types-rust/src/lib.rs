use crate::types::Log;
use std::io::stdout;

pub fn print_log(log: Log) {
    match serde_json::to_writer(stdout(), &log) {
        Ok(_) => println!(),
        Err(e) => eprintln!("Error serializing log: {e}"),
    }
}

pub mod log_event_enums;
pub mod types;
