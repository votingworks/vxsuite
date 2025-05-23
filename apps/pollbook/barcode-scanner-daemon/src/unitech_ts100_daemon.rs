use color_eyre::eyre::Context;
use nusb::Error;
use parse_aamva::AamvaDocument;
use serialport::{DataBits, FlowControl, Parity, StopBits};
use std::fs;
use std::io::{self, BufRead, BufReader, ErrorKind, Write};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::process::exit;
use std::str::{from_utf8, FromStr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::sleep;
use std::time::{Duration, Instant};
use vx_logging::{log, set_source, Disposition, EventId, EventType, Source};

mod aamva_jurisdictions;
mod parse_aamva;

/*
 * Logging config
 */
const SOURCE: Source = Source::VxPollbookBarcodeScannerDaemon;
const HEARTBEAT_LOG_INTERVAL: Duration = Duration::from_secs(60);

/*
 * Unix domain socket config
 */
const UDS_PATH: &str = "/tmp/barcodescannerd.sock";
// How long to wait for a UDS client (the pollbook node backend) to connect
const UDS_CLIENT_CONNECTION_TIMEOUT: Duration = Duration::from_secs(30);

/*
 * Barcode scanner config
 */
const UNITECH_VENDOR_ID: u16 = 0x2745;
const TS100_PRODUCT_ID: u16 = 0x300a;
const TS100_PORT_NAME: &str = "/dev/ttyACM0";
const TS100_BAUD_RATE: u32 = 115_200;
const TS100_DATA_TERMINATOR: u8 = b'\r';

// The string denoting the start of an AAMVA-encoded document.
// 3 ASCII chars '@', 'line feed', 'record separator' expected per "D.12.3 Header" AAMVA 2020 p.50
const COMPLIANCE_INDICATOR: &[u8] = b"@\n\x1E";

// Resets the TS100 barcode scanner
fn reset_scanner() -> Result<(), Error> {
    match nusb::list_devices()?
        .find(|dev| dev.vendor_id() == UNITECH_VENDOR_ID && dev.product_id() == TS100_PRODUCT_ID)
    {
        Some(device) => {
            device.open()?.reset()?;
            sleep(std::time::Duration::from_millis(500));
            Ok(())
        }
        None => Err(Error::new(
            ErrorKind::NotConnected,
            format!("No USB device found at {UNITECH_VENDOR_ID}:{TS100_PRODUCT_ID}"),
        )),
    }
}

// Connects to TS100 barcode scanner
fn init_port(
    port_name: &str,
    baud_rate: u32,
) -> color_eyre::Result<Box<dyn serialport::SerialPort>> {
    // We have experienced difficulty reconnecting the scanner when the daemon
    // is stopped and started multiple times. Resetting the scanner solves the issue.
    // Configuration such as USB COM Port Emulation persists between resets.
    match reset_scanner() {
        Ok(()) => {
            log!(
                event_id: EventId::UsbDeviceReconnectAttempted,
                message: "Barcode scanner reset succeeded".to_owned(),
                event_type: EventType::SystemAction,
                disposition: Disposition::Success
            );
        }
        Err(e) => {
            log!(
                event_id: EventId::UsbDeviceReconnectAttempted,
                message: format!("Barcode scanner reset failed: {e}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );

            log!(
                EventId::ProcessTerminated;
                EventType::SystemAction
            );
            exit(1);
        }
    }

    let port = serialport::new(port_name, baud_rate)
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(500))
        .open()
        .with_context(|| format!("Failed to open serial port {port_name}"))?;

    Ok(port)
}

// Waits for and accepts a socket client until `timeout` has elapsed.
// Returns a Result containing a UnixStream to write to the client or
// a TimedOut error if no client was accepted.
fn accept_with_timeout(
    running: &Arc<AtomicBool>,
    listener: &UnixListener,
    timeout: Duration,
) -> color_eyre::Result<UnixStream, io::Error> {
    listener.set_nonblocking(true)?;

    let start = Instant::now();
    log!(EventId::SocketServerAwaitingClient);
    loop {
        if !running.load(Ordering::SeqCst) {
            log!(
                EventId::ProcessTerminated;
                EventType::SystemAction
            );
            exit(1);
        }

        match listener.accept() {
            Ok((stream, _)) => {
                log!(event_id: EventId::SocketClientConnected, message: "Accepted UDS client".to_owned(), disposition: Disposition::Success);
                return Ok(stream);
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {
                if start.elapsed() >= timeout {
                    return Err(io::Error::new(
                        ErrorKind::TimedOut,
                        "Timed out waiting for UDS client",
                    ));
                }

                sleep(Duration::from_millis(200));
            }
            Err(e) => {
                return Err(e);
            }
        }
    }
}

fn open_socket() -> Result<UnixListener, std::io::Error> {
    // Unlink old socket if it exists
    let _ = fs::remove_file(UDS_PATH);
    // Assign address to socket
    let listener = UnixListener::bind(UDS_PATH)?;
    // TODO(Kevin) run server and daemon as same user so we can avoid lax permissions
    fs::set_permissions(UDS_PATH, fs::Permissions::from_mode(0o666))?;
    log!(
        event_id: EventId::SocketServerBind,
        message: format!("UDS bound on {UDS_PATH}"),
        disposition: Disposition::Success
    );

    Ok(listener)
}

fn read_scanner(
    running: &Arc<AtomicBool>,
    scanner_reader: &mut BufReader<Box<dyn serialport::SerialPort>>,
    uds_client: &mut UnixStream,
) {
    let mut buf = Vec::new();
    let mut start = Instant::now();

    while running.load(Ordering::SeqCst) {
        if start.elapsed() > HEARTBEAT_LOG_INTERVAL {
            start = Instant::now();
            log!(
                EventId::Heartbeat;
                EventType::SystemStatus
            );
        }

        buf.clear();

        match scanner_reader.read_until(TS100_DATA_TERMINATOR, &mut buf) {
            Ok(_) => {
                if buf.ends_with(&[TS100_DATA_TERMINATOR]) {
                    buf.pop();
                }

                if buf.is_empty() {
                    continue;
                }

                // We expect the input sequence to start with the compliance indicator
                // on its own line so we just ignore it and skip to the next line
                if buf.as_slice() == COMPLIANCE_INDICATOR {
                    continue;
                }

                match from_utf8(&buf) {
                    Ok(s) => match AamvaDocument::from_str(s) {
                        Ok(document) => {
                            let success = serde_json::to_writer(&mut *uds_client, &document)
                                .is_ok_and(|()| uds_client.write_all(b"\n").is_ok());

                            if !success {
                                log!(
                                    EventId::SocketServerError,
                                    "Failed to write serialized document to UDS client"
                                );
                            }
                        }
                        Err(e) => {
                            log!(
                                event_id: EventId::ParseError,
                                message: format!("Scanned data was not in AAMVA format: {e}"),
                                event_type: EventType::SystemAction,
                                disposition: Disposition::Failure
                            );
                        }
                    },
                    Err(e) => {
                        log!(
                            event_id: EventId::ParseError,
                            message: format!("Error parsing scanned bytes as UTF-8: {e}")
                        );
                    }
                }
            }
            // no data in this interval; no-op
            Err(ref e) if e.kind() == ErrorKind::TimedOut => {}
            // any other error is fatal
            Err(e) => {
                log!(
                    event_id: EventId::UnknownError,
                    message: format!("Error reading from USB device: {e}")
                );
                running.store(false, Ordering::SeqCst);
            }
        }
    }
}

fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;

    set_source(SOURCE);
    log!(
        EventId::ProcessStarted;
        EventType::SystemAction
    );

    // Set up ctrl+c handler
    let running = Arc::new(AtomicBool::new(true));
    ctrlc::set_handler({
        let running = running.clone();
        move || {
            running.store(false, Ordering::SeqCst);
        }
    })?;

    // Connect to barcode scanner device
    let port = match init_port(TS100_PORT_NAME, TS100_BAUD_RATE) {
        Ok(p) => p,
        Err(e) => {
            log!(
                event_id: EventId::DeviceAttached,
                message: format!("Failed to connect to USB barcode scanner: {e}"),
                event_type: EventType::SystemStatus,
                disposition: Disposition::Failure
            );

            // Exit and allow systemctl config to restart daemon
            log!(
                EventId::ProcessTerminated;
                EventType::SystemAction
            );
            exit(1);
        }
    };
    log!(
        event_id: EventId::DeviceAttached,
        message: format!("Connected to TS100 barcode scanner at {TS100_PORT_NAME}..."),
        event_type: EventType::SystemStatus,
        disposition: Disposition::Success
    );

    // Reader to read from the barcode scanner
    let mut scanner_reader = BufReader::new(port);
    // Open Unix domain socket and get back a handle to the socket
    let listener = open_socket()?;

    // Wait for socket client (eg. pollbook backend) to connect. Simultaneous clients are not supported.
    let mut uds_client = accept_with_timeout(&running, &listener, UDS_CLIENT_CONNECTION_TIMEOUT)?;

    read_scanner(&running, &mut scanner_reader, &mut uds_client);

    // Close port and unlink socket
    let mut port = scanner_reader.into_inner();
    let _ = port.write_data_terminal_ready(false);
    drop(port);

    let _ = fs::remove_file(UDS_PATH);

    log!(
        EventId::ProcessTerminated;
        EventType::SystemAction
    );

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir;
    use std::io::ErrorKind;
    use std::os::unix::net::UnixStream;
    use std::path::PathBuf;
    use std::time::Duration;

    fn make_socket_path(name: &str) -> PathBuf {
        let mut path = temp_dir();
        path.push(name);
        path
    }

    #[test]
    fn accept_with_client_succeeds() {
        let running = Arc::new(AtomicBool::new(true));
        set_source(SOURCE);
        let socket_path = make_socket_path("accept_success.sock");
        let _ = fs::remove_file(&socket_path);

        // bind the listener
        let listener = UnixListener::bind(&socket_path).expect("could not bind listener");

        sleep(Duration::from_millis(50));
        let _ = UnixStream::connect(&socket_path).expect("client connect should succeed");

        let stream = accept_with_timeout(&running, &listener, Duration::from_secs(1))
            .expect("should accept within timeout");
        assert!(stream.peer_addr().is_ok());
        let _ = fs::remove_file(&socket_path);
    }

    #[test]
    fn accept_with_timeout_errors_if_no_client() {
        let running = Arc::new(AtomicBool::new(true));
        set_source(SOURCE);
        let socket_path = make_socket_path("accept_timeout.sock");
        let _ = fs::remove_file(&socket_path);

        let listener = UnixListener::bind(&socket_path).expect("could not bind listener");

        let err = accept_with_timeout(&running, &listener, Duration::from_millis(100))
            .expect_err("expected connection timeout");
        assert_eq!(err.kind(), ErrorKind::TimedOut);
        let _ = fs::remove_file(&socket_path);
    }
}
