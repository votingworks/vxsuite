use color_eyre::eyre::Context;
use nusb::Error;
use parse_aamva::AamvaDocument;
use serialport::{DataBits, FlowControl, Parity, StopBits};
use std::fs;
use std::io::{self, BufRead, BufReader, ErrorKind};
use std::os::unix::fs::PermissionsExt;
use std::str::{from_utf8, FromStr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::sleep;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::Mutex;
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

/*
 * Barcode scanner config
 */
const UNITECH_VENDOR_ID: u16 = 0x2745;
const TS100_PRODUCT_ID: u16 = 0x300a;
const TS100_PORT_NAME: &str = "/dev/barcode_scanner";
const TS100_BAUD_RATE: u32 = 115_200;
const TS100_DATA_TERMINATOR: u8 = b'\r';

// The string denoting the start of an AAMVA-encoded document.
// 3 ASCII chars '@', 'line feed', 'record separator' expected per "D.12.3 Header" AAMVA 2020 p.50
const COMPLIANCE_INDICATOR: &[u8] = b"@\n\x1E";

/*
 * Calculation of maximum data size of a valid AAMVA document to protect against absurdly large data resulting
 * from scanning.
 */
// The number of non-data bytes in a data element ID.
// Calculated as (elementID.len() + data separator.len()) = (3 + 1)
// eg. "DBA" + "\n"
const NON_DATA_BYTES: usize = 4;
// Maximum possible number of data elements encoded on an AAMVA document.
// This is an overestimate because not all fields are available on all document types.
// Includes both required and optional elements.
const MAX_NUM_ELEMENTS: usize = 50;
// Sum of all maximum sizes of data for all elements, excluding element ID; different for each element so this is just hard coded.
// eg. document expiry = `DBAMMDDCCYY`
//     address state   = `DAJNH`
// So we sum "MMDDCCYY".len() + "NH".len() + ... for all fields
const SUM_ALL_ELEMENTS_SIZE: usize = 535;
// Jurisdiction-specific fields are not supported by this calculation, but could be with real-world examples.
const MAX_AAMVA_DOCUMENT_SIZE: usize =
    (NON_DATA_BYTES + 1) * MAX_NUM_ELEMENTS + SUM_ALL_ELEMENTS_SIZE;

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
        Err(err) => {
            log!(
                event_id: EventId::UsbDeviceReconnectAttempted,
                message: format!("Barcode scanner reset failed: {err}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );
            return Err(err.into());
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

async fn write_doc(stream: &mut tokio::net::UnixStream, doc: &AamvaDocument) -> io::Result<()> {
    let mut buf = Vec::new();
    serde_json::to_writer(&mut buf, doc)?;
    buf.push(b'\n');

    stream.write_all(&buf).await?;
    stream.flush().await?;
    Ok(())
}

/// Writes data to every client in the mutex. Drops any connections that error.
async fn broadcast_to_clients(
    clients: &Arc<Mutex<Vec<UnixStream>>>,
    doc: &AamvaDocument,
) -> io::Result<()> {
    let mut guard = clients.lock().await;

    let streams = std::mem::take(&mut *guard);
    drop(guard);

    let mut alive = Vec::with_capacity(streams.len());
    for mut stream in streams {
        match write_doc(&mut stream, doc).await {
            Ok(()) => alive.push(stream),
            Err(err) => log!(
                EventId::SocketClientDisconnected,
                "Dropping unreachable UDS client due to error: {err}",
            ),
        }
    }

    let mut guard = clients.lock().await;
    *guard = alive;
    Ok(())
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
pub async fn run_read_write_loop(
    running: &Arc<AtomicBool>,
    reader: &mut dyn BufRead,
    clients: Arc<Mutex<Vec<UnixStream>>>,
) {
    let mut buf = Vec::with_capacity(MAX_AAMVA_DOCUMENT_SIZE);
    let mut start = Instant::now();

    while running.load(Ordering::SeqCst) {
        if start.elapsed() > HEARTBEAT_LOG_INTERVAL {
            start = Instant::now();
            log!(EventId::Heartbeat; EventType::SystemStatus);
        }

        buf.clear();
        match reader.read_until(TS100_DATA_TERMINATOR, &mut buf) {
            Ok(_) => {
                if buf.len() > MAX_AAMVA_DOCUMENT_SIZE {
                    log!(
                        EventId::ParseError,
                        "Scan data size of {} exceeded limit of {}",
                        buf.len(),
                        MAX_AAMVA_DOCUMENT_SIZE
                    );
                    continue;
                }

                if buf.ends_with(&[TS100_DATA_TERMINATOR]) {
                    buf.pop();
                }
                if buf.is_empty() {
                    continue;
                }
                // We expect the input sequence to start with the compliance indicator
                // on its own line so we just ignore it and skip to the next line.
                // Existence of the compliance indicator is not enforced.
                if buf.as_slice() == COMPLIANCE_INDICATOR {
                    continue;
                }

                // Parse and emit JSON
                match from_utf8(&buf) {
                    Ok(s) => match AamvaDocument::from_str(s) {
                        Ok(doc) => {
                            if let Err(err) = broadcast_to_clients(&clients, &doc).await {
                                log!(
                                    EventId::SocketServerError,
                                    "Failed to write scan to clients: {err}"
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

#[tokio::main]
async fn main() -> color_eyre::Result<()> {
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

    // Open Unix domain socket and get back a handle to the socket
    let listener = open_socket()?;
    // A thread‐safe list of all currently‐connected clients
    let clients = Arc::new(Mutex::new(Vec::<UnixStream>::new()));

    // Spawn thread to accept clients
    {
        tokio::spawn({
            let clients = clients.clone();
            async move {
                loop {
                    if let Ok((stream, _addr)) = listener.accept().await {
                        let mut guard = clients.lock().await;
                        log!(EventId::SocketClientConnected);
                        guard.push(stream);
                    }
                }
            }
        });
    }

    // Connect to barcode scanner device
    match init_port(TS100_PORT_NAME, TS100_BAUD_RATE) {
        Ok(port) => {
            log!(
                event_id: EventId::DeviceAttached,
                message: format!("Connected to TS100 barcode scanner at {TS100_PORT_NAME}..."),
                event_type: EventType::SystemStatus,
                disposition: Disposition::Success
            );

            // Reader to read from the barcode scanner
            let mut scanner_reader = BufReader::new(port);

            run_read_write_loop(&running, &mut scanner_reader, clients).await;

            // Close port and unlink socket
            let mut port = scanner_reader.into_inner();
            let _ = port.write_data_terminal_ready(false);
            drop(port);
        }
        Err(e) => {
            log!(
                event_id: EventId::DeviceAttached,
                message: format!("Failed to connect to USB barcode scanner: {e}"),
                event_type: EventType::SystemStatus,
                disposition: Disposition::Failure
            );
        }
    }

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
    use serde_json::json;
    use std::os::unix::fs::FileTypeExt;
    use std::sync::Arc;
    use tokio::{
        io::{AsyncBufReadExt, BufReader},
        net::UnixStream,
        sync::Mutex,
    };

    #[tokio::test]
    async fn broadcast_to_clients_sends_valid_json() {
        let doc = AamvaDocument {
            issuing_jurisdiction: "NH".into(),
            first_name: "FIRST".into(),
            middle_name: "MIDDLE".into(),
            last_name: "LAST".into(),
            name_suffix: "JR".into(),
        };

        // Create an in-memory pair of UnixStreams to simulate both "ends" of the pipe
        // mock_daemon_stream is the end we write into from the daemon
        // mock_node_server_stream simulates the end we read from in the app's backend
        let (mock_daemon_stream, mock_backend_stream) =
            UnixStream::pair().expect("Couldn't open UnixStream pair");
        let clients = Arc::new(Mutex::new(vec![mock_daemon_stream]));

        broadcast_to_clients(&clients, &doc)
            .await
            .expect("failed to write to clients");

        // Simulate app backend reading from socket
        let mut buf = Vec::new();
        let mut client_reader = BufReader::new(mock_backend_stream);
        client_reader.read_until(b'\n', &mut buf).await.unwrap();
        let s = String::from_utf8(buf).unwrap();

        // Validate data read from socket
        let v: serde_json::Value = serde_json::from_str(s.as_str()).unwrap();
        let expect = json!({
          "issuingJurisdiction": "NH",
          "firstName": "FIRST",
          "middleName": "MIDDLE",
          "lastName": "LAST",
          "nameSuffix": "JR"
        });
        assert_eq!(v, expect);
    }

    #[test]
    fn reset_scanner_no_device_returns_not_connected_error() {
        let err = reset_scanner().expect_err("Expected Err when no device found. Are you running this test with the device attached?");

        assert_eq!(
            err.kind(),
            ErrorKind::NotConnected,
            "Expected NotConnected error kind, got {:?}",
            err.kind()
        );

        let expected =
            format!("No USB device found at {UNITECH_VENDOR_ID:#X}:{TS100_PRODUCT_ID:#X}");
        assert_eq!(err.to_string(), expected);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn open_socket_rebinds_existing_file() {
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
