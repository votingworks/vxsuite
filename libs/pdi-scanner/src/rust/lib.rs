pub mod client;
pub mod protocol;
pub mod rusb_async;
pub mod scanner;
mod types;

use client::Client;
use scanner::Scanner;
pub use types::{Error, Result, UsbError};

/// Connect to the scanner and return the scanner and client. When you're done,
/// you should call [`Scanner::stop`] to properly close the connection.
pub fn connect() -> color_eyre::Result<Client<Scanner>, Error> {
    let mut scanner = Scanner::open()?;
    let (tx, ack_rx, rx) = scanner.start();
    let client = Client::new(tx, ack_rx, rx, Some(scanner));
    Ok(client)
}
