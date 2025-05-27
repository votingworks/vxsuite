use color_eyre::eyre::Context;
use nusb::Error;
use parse_aamva::AamvaDocument;
use serialport::{DataBits, FlowControl, Parity, StopBits};
use std::fs;
use std::io::{self, BufRead, BufReader, BufWriter, ErrorKind, Write};
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
            format!("No USB device found at {UNITECH_VENDOR_ID:#X}:{TS100_PRODUCT_ID:#X}"),
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

/// Reads from any `BufRead`, parses AAMVA documents, and writes JSON+"\n" to any Write.
pub fn run_read_write_loop(
    running: &Arc<AtomicBool>,
    reader: &mut dyn BufRead,
    writer: &mut dyn Write,
) {
    let mut buf = Vec::new();
    let mut start = Instant::now();

    while running.load(Ordering::SeqCst) {
        if start.elapsed() > HEARTBEAT_LOG_INTERVAL {
            start = Instant::now();
            log!(EventId::Heartbeat; EventType::SystemStatus);
        }

        buf.clear();
        match reader.read_until(TS100_DATA_TERMINATOR, &mut buf) {
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
                // Parse and emit JSON
                match from_utf8(&buf) {
                    Ok(s) => match AamvaDocument::from_str(s) {
                        Ok(doc) => {
                            if let Err(err) = serde_json::to_writer(&mut *writer, &doc)
                                .and_then(|()| {
                                    writer.write_all(b"\n").map_err(serde_json::Error::io)
                                })
                                .and_then(|()| writer.flush().map_err(serde_json::Error::io))
                            {
                                log!(
                                    EventId::SocketServerError,
                                    "Failed to write scan to socket: {err}"
                                );
                            }
                        }
                        Err(e) => {
                            log!(event_id: EventId::ParseError, message: format!("Read data was not in AAMVA format: {e}"), event_type: EventType::SystemAction, disposition: Disposition::Failure);
                        }
                    },
                    Err(e) => {
                        log!(event_id: EventId::ParseError, message: format!("Error parsing read bytes as UTF-8: {e}"));
                    }
                }
            }
            // no data in this interval; no-op
            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => {
                log!(event_id: EventId::UnknownError, message: format!("Error reading from USB device: {e}"));
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
    let mut uds_client = BufWriter::new(accept_with_timeout(
        &running,
        &listener,
        UDS_CLIENT_CONNECTION_TIMEOUT,
    )?);

    run_read_write_loop(&running, &mut scanner_reader, &mut uds_client);

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
    use serde_json::{self, json};
    use std::env::temp_dir;
    use std::io::ErrorKind;
    use std::io::{BufReader, Cursor, Write};
    use std::os::unix::fs::FileTypeExt;
    use std::os::unix::net::UnixStream;
    use std::path::PathBuf;
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    };
    use std::time::Duration;

    fn make_socket_path(name: &str) -> PathBuf {
        let mut path = temp_dir();
        path.push(name);
        path
    }

    /// A small writer that captures exactly one write, then flips `running` false
    /// so the loop will exit immediately.
    struct TestWriter {
        buf: Vec<u8>,
        running: Arc<AtomicBool>,
    }

    impl Write for TestWriter {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            let n = self.buf.write(bytes)?;
            self.running.store(false, Ordering::SeqCst);
            Ok(n)
        }
        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn run_read_write_loop_emits_expected_json() {
        let running = Arc::new(AtomicBool::new(true));
        set_source(SOURCE);
        let sample_aamva: &str = "@\n\x1E\rANSI 636039090001DL00310485DLDAQNHL12345678
DACFIRST
DADMIDDLE
DCSLAST
DCUJR\r";
        let mut raw_bytes = sample_aamva.as_bytes().to_vec();
        raw_bytes.push(TS100_DATA_TERMINATOR);

        let mut reader = BufReader::new(Cursor::new(raw_bytes));

        let mut test_writer = TestWriter {
            buf: Vec::new(),
            running: running.clone(),
        };

        run_read_write_loop(&running, &mut reader, &mut test_writer);

        let json_str = String::from_utf8(test_writer.buf.clone())
            .expect("valid UTF-8")
            .trim_end()
            .to_string();

        let parsed: serde_json::Value =
            serde_json::from_str(&json_str).expect("should parse JSON output");

        let expected = json!({
            "issuingJurisdiction": "NH",
            "firstName": "FIRST",
            "middleName": "MIDDLE",
            "lastName": "LAST",
            "nameSuffix": "JR"
        });

        assert_eq!(parsed, expected);
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

        let err = accept_with_timeout(&running, &listener, Duration::from_millis(10))
            .expect_err("expected connection timeout");
        assert_eq!(err.kind(), ErrorKind::TimedOut);
        let _ = fs::remove_file(&socket_path);
    }

    // #[test]
    // fn reset_scanner_no_device_returns_not_connected_error() {
    //     println!("reset scanner");
    //     let err = reset_scanner().expect_err("should get Err when no device found");

    //     println!("checking error");
    //     assert_eq!(
    //         err.kind(),
    //         ErrorKind::NotConnected,
    //         "Expected NotConnected error kind, got {:?}",
    //         err.kind()
    //     );

    //     let expected = format!("No USB device found at {UNITECH_VENDOR_ID}:{TS100_PRODUCT_ID}");
    //     println!("checking error 2");
    //     assert!(err.to_string().contains(&expected));
    // }

    // #[test]
    // fn open_socket_creates_uds() {
    //     // Ensure no pre-existing socket file
    //     let _ = fs::remove_file(UDS_PATH);
    //     let listener = open_socket().expect("open_socket should succeed");
    //     let meta = fs::metadata(UDS_PATH).expect("socket file should exist");
    //     assert!(meta.file_type().is_socket(), "Expected a socket file");
    //     drop(listener);
    //     let _ = fs::remove_file(UDS_PATH);
    // }

    #[test]
    fn open_socket_rebinds_existing_file() {
        set_source(SOURCE);
        // Create a pre-existing dummy file at UDS_PATH
        let _ = fs::remove_file(UDS_PATH);
        fs::write(UDS_PATH, b"dummy").expect("failed to create dummy file");
        let meta = fs::metadata(UDS_PATH).expect("socket file must exist after bind");
        assert!(
            meta.file_type().is_socket() == false,
            "Expected rebound socket file"
        );

        // open_socket should remove and rebind the socket path
        let listener = open_socket().expect("open_socket should succeed and rebind");

        let meta = fs::metadata(UDS_PATH).expect("socket file must exist after bind");
        assert!(meta.file_type().is_socket(), "Expected rebound socket file");
        drop(listener);
        let _ = fs::remove_file(UDS_PATH);
    }
}
