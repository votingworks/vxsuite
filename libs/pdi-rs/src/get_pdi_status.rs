use std::{thread, time::Duration};

use pdiscan_next::client::{Client, Config};

mod pdiscan;
mod pdiscan_next;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut client = Client::new(Config::new(0x0bd7, 0xa002, 1, 0, 5, 133))?;

    let result = client.get_test_string_from_scanner();
    println!("get test string result: {result:#?}");

    let result = client.get_firmware_version();
    println!("get firmware version result: {result:#?}");

    let result = client.set_duplex_mode(pdiscan_next::client::DuplexMode::SimplexFrontOnly);
    println!("set duplex mode result: {result:#?}");

    let result = client.get_scan_settings();
    println!("get scan settings result: {result:#?}");

    let result = client.get_status();
    println!("get status result: {result:#?}");

    let result = client.set_scan_delay_interval(Duration::from_secs(0));
    println!("set scan delay interval result: {result:#?}");

    let result = client.set_feeder_enabled(true);
    println!("set feeder enabled result: {result:#?}");

    let thread = thread::spawn(move || loop {
        let message = client.wait_for_unsolicited_message(Duration::from_secs(1));
        println!("unsolicited message poll result: {message:#?}");
    });

    thread.join().unwrap();

    Ok(())
}
