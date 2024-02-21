pub mod client;
pub mod protocol;
mod rusb_async;
pub mod scanner;
mod types;

use client::Client;
use scanner::Scanner;
pub use types::{Error, Result};

/// Connect to the scanner and return the scanner and client. When you're done,
/// you should call [`Scanner::stop`] to properly close the connection.
pub fn connect() -> color_eyre::Result<(Scanner, Client)> {
    let mut scanner = Scanner::open()?;
    let (tx, rx) = scanner.start();
    let client = Client::new(tx, rx);
    Ok((scanner, client))
}
