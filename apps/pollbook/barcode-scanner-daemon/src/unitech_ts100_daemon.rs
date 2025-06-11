use color_eyre::eyre::Context;
use parse_aamva::AamvaDocument;
use std::fs;
use std::io::{self, Error, ErrorKind};
use std::os::unix::fs::PermissionsExt;
use std::str::from_utf8;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};
use tokio_serial::{DataBits, FlowControl, Parity, SerialPortBuilderExt, SerialStream, StopBits};
use vx_logging::{log, set_source, Disposition, EventId, EventType, Source};

use crate::parse_aamva::{AamvaParseError, ELEMENT_ID_SIZE};

mod aamva_jurisdictions;
mod parse_aamva;

/*
 * Logging config
 */
const SOURCE: Source = Source::VxPollbookBarcodeScannerDaemon;
/// How often the daemon logs its heartbeat.
const HEARTBEAT_LOG_INTERVAL: Duration = Duration::from_secs(60);

/*
 * Unix domain socket config
 */
/// Path of the Unix domain socket used to communicate data between daemon and app backend.
const UDS_PATH: &str = "/tmp/barcodescannerd.sock";

/*
 * Barcode scanner config
 */
/// Vendor ID for TS100 barcode scanner manufacturer
const UNITECH_VENDOR_ID: u16 = 0x2745;
/// Product ID for TS100 barcode scanner
const TS100_PRODUCT_ID: u16 = 0x300a;
/// Path to serialport device as set by udev rule
const TS100_PORT_NAME: &str = "/dev/barcode_scanner";
/// Default baud rate, used for connecting to serialport device
const TS100_BAUD_RATE: u32 = 115_200;
/// Character at the end of each data chunk sent by the TS100
const TS100_DATA_TERMINATOR: u8 = b'\r';

/// The string denoting the start of an AAMVA-encoded document.
/// 3 ASCII chars '@', 'line feed', 'record separator' expected per "D.12.3 Header" AAMVA 2020 p.50
const COMPLIANCE_INDICATOR: &[u8] = b"@\n\x1E";

/// Calculation of maximum data size of a valid AAMVA document. This helps with avoiding parsing of
/// data that is obviously not AAMVA-formatted.
/// Jurisdiction-specific subdocuments are not supported by this calculation, but could be added later.
const MAX_AAMVA_DOCUMENT_SIZE: usize = {
    /// The number of non-data bytes in a data element ID.
    /// Calculated as (`elementID.len()` + `data_separator.len()`) = (3 + 1)
    /// eg. "DBA" + "\n"
    const NON_DATA_BYTES: usize = ELEMENT_ID_SIZE + 1;
    /// Maximum possible number of data elements encoded on an AAMVA document.
    /// This is an overestimate because not all fields are available on all document types.
    /// Includes both required and optional elements.
    const MAX_NUM_ELEMENTS: usize = 50;
    /// Sum of all maximum sizes of data for all elements, excluding element ID; different for each element so this is just hard coded.
    /// eg. document expiry = `DBAMMDDCCYY`
    ///     address state   = `DAJNH`
    /// So we manually sum `"MMDDCCYY".len()` + `"NH".len()` + ... for all fields
    const SUM_ALL_ELEMENTS_SIZE: usize = 535;
    (NON_DATA_BYTES + 1) * MAX_NUM_ELEMENTS + SUM_ALL_ELEMENTS_SIZE
};

// Resets the TS100 barcode scanner
async fn reset_scanner() -> Result<(), nusb::Error> {
    match nusb::list_devices()?
        .find(|dev| dev.vendor_id() == UNITECH_VENDOR_ID && dev.product_id() == TS100_PRODUCT_ID)
    {
        Some(device) => {
            device.open()?.reset()?;
            sleep(std::time::Duration::from_millis(500)).await;
            Ok(())
        }
        None => Err(Error::new(
            ErrorKind::NotConnected,
            format!("No USB device found at {UNITECH_VENDOR_ID:#X}:{TS100_PRODUCT_ID:#X}"),
        )),
    }
}

// Connects to TS100 barcode scanner
async fn init_port(port_name: &str, baud_rate: u32) -> color_eyre::Result<SerialStream> {
    // We have experienced difficulty reconnecting the scanner when the daemon
    // is stopped and started multiple times. Resetting the scanner solves the issue.
    // Configuration such as USB COM Port Emulation persists between resets.
    match reset_scanner().await {
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

    tokio_serial::new(port_name, baud_rate)
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(500))
        .open_native_async()
        .with_context(|| format!("Failed to open serial port {port_name}"))
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

fn open_socket() -> Result<UnixListener, Error> {
    // Unlink old socket if it exists
    let _ = fs::remove_file(UDS_PATH);
    // Assign address to socket
    let listener = UnixListener::bind(UDS_PATH)?;
    fs::set_permissions(UDS_PATH, fs::Permissions::from_mode(0o660))?;
    log!(
        event_id: EventId::SocketServerBind,
        message: format!("UDS bound on {UDS_PATH}"),
        disposition: Disposition::Success
    );

    Ok(listener)
}

/// Reads from any `BufRead`, parses AAMVA documents, and writes JSON+"\n" to any Write.
/// # Errors
///
/// Will return `Err` if an error occurs while reading from USB device.
pub async fn run_read_write_loop<R>(
    raw_port: R,
    clients: Arc<Mutex<Vec<UnixStream>>>,
) -> Result<(), Error>
where
    R: AsyncRead + Unpin + Send + 'static,
{
    let max_data_size = MAX_AAMVA_DOCUMENT_SIZE + 1; // + 1 for length of data terminator
    let mut buf = Vec::with_capacity(max_data_size);
    let mut reader = BufReader::new(raw_port);

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(HEARTBEAT_LOG_INTERVAL).await;
            log!(EventId::Heartbeat; EventType::SystemStatus);
        }
    });

    loop {
        buf.clear();

        match reader.read_until(TS100_DATA_TERMINATOR, &mut buf).await {
            Ok(n) => {
                buf.pop();

                if buf.is_empty() {
                    // Expected at the end of the document
                    log!(EventId::Info, "No data preceding terminator character");
                    continue;
                }

                if n > max_data_size + 1 {
                    log!(
                        EventId::ParseError,
                        "Scan data size of {n} exceeded limit of {max_data_size}",
                    );
                    continue;
                }

                // We expect the input sequence to start with the compliance indicator
                // on its own line so we just ignore it and skip to the next line.
                // Existence of the compliance indicator is not enforced.
                if buf == COMPLIANCE_INDICATOR {
                    log!(EventId::Info, "Skipping compliance indicator");
                    continue;
                }

                // Parse and emit JSON
                let str = match from_utf8(&buf) {
                    Ok(str) => str,
                    Err(e) => {
                        log!(
                            event_id: EventId::ParseError,
                            message: format!("Error parsing read bytes as UTF-8: {e}")
                        );
                        continue;
                    }
                };

                let doc: AamvaDocument = match str.parse() {
                    Ok(doc) => doc,
                    Err(err @ AamvaParseError::DataTooLong(_, _)) => {
                        // Exit if data is in AAMVA format but doesn't follow AAMVA spec
                        log!(
                            event_id: EventId::ParseError,
                            message: format!("Unexpected data in AAMVA format. Error was: {err}"),
                            event_type: EventType::SystemAction,
                            disposition: Disposition::Failure
                        );
                        continue;
                    }
                    Err(err) => {
                        // Don't exit if this could have been a scan of a non-AAMVA document
                        // or we tried to parse an unsupported subfile type (as is common on
                        // non-NH licenses)
                        log!(
                            event_id: EventId::ParseError,
                            message: format!("Read data that was not in the supported subset of AAMVA or was not AAMVA at all: {err}"),
                            event_type: EventType::SystemAction,
                            disposition: Disposition::Failure
                        );
                        continue;
                    }
                };

                if let Err(err) = broadcast_to_clients(&clients, &doc).await {
                    log!(
                        EventId::SocketServerError,
                        "Failed to write scan to clients: {err}"
                    );
                }

                log!(EventId::Info, "Successfully parsed and sent document data");
            }
            Err(e) => {
                return Err(std::io::Error::new(
                    e.kind(),
                    format!("Error reading from USB device: {e}"),
                ));
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

    // Open Unix domain socket and get back a handle to the socket
    let listener = open_socket()?;
    // A task-safe list of all currently-connected clients
    let clients = Arc::new(Mutex::new(Vec::<UnixStream>::new()));

    // Spawn task to accept clients
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

    // Connect to barcode scanner device
    match init_port(TS100_PORT_NAME, TS100_BAUD_RATE).await {
        Ok(port) => {
            log!(
                event_id: EventId::DeviceAttached,
                message: format!("Connected to TS100 barcode scanner at {TS100_PORT_NAME}..."),
                event_type: EventType::SystemStatus,
                disposition: Disposition::Success
            );

            let signal = tokio::signal::ctrl_c();
            let read_loop = run_read_write_loop(port, clients);

            tokio::pin!(signal);
            tokio::pin!(read_loop);

            tokio::select! {
                Err(err) = &mut read_loop => {
                    log!(EventId::UnknownError, "Error in read/write loop: {err}");
                }
                _ = &mut signal => {
                    log!(
                        EventId::ProcessTerminated;
                        EventType::SystemAction
                    );
                }
            }
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
    use crate::aamva_jurisdictions::AamvaIssuingJurisdiction;

    use super::*;
    use serde_json::json;
    use std::os::unix::fs::FileTypeExt;
    use std::sync::Arc;
    use tokio::{
        io::{AsyncBufReadExt, BufReader},
        net::UnixStream,
        sync::Mutex,
    };
    use tokio_test::io::Builder;

    #[tokio::test]
    async fn run_read_write_loop_skips_compliance_indicator() {
        set_source(SOURCE);

        let mut compliance_bytes = COMPLIANCE_INDICATOR.to_vec();
        compliance_bytes.push(TS100_DATA_TERMINATOR);

        let mock_reader = Builder::new()
            .read(&compliance_bytes)
            // This error triggers the loop to exit
            .read_error(io::Error::new(io::ErrorKind::Other, "Mock error"))
            .build();

        let reader = BufReader::new(mock_reader);

        let (daemon_end, _client_end) =
            UnixStream::pair().expect("failed to create UnixStream pair");
        let clients: Arc<Mutex<Vec<UnixStream>>> = Arc::new(Mutex::new(vec![daemon_end]));

        // If the loop exits with "Mock error" we know the first call to `read` (the one
        // that contains the data we want to test) was called
        run_read_write_loop(reader, clients)
            .await
            .expect_err("Error reading from USB device: Mock error");
    }

    #[tokio::test]
    async fn run_read_write_loop_skips_oversized_input() {
        set_source(SOURCE);

        let mut oversized_buf = vec![0u8; MAX_AAMVA_DOCUMENT_SIZE + 1];
        oversized_buf.push(TS100_DATA_TERMINATOR);

        let mock_reader = Builder::new()
            .read(&oversized_buf)
            // This error triggers the loop to exit
            .read_error(io::Error::new(io::ErrorKind::Other, "Mock error"))
            .build();

        let reader = BufReader::new(mock_reader);

        let (daemon_end, _client_end) =
            UnixStream::pair().expect("failed to create UnixStream pair");
        let clients: Arc<Mutex<Vec<UnixStream>>> = Arc::new(Mutex::new(vec![daemon_end]));

        // If the loop exits with "Mock error" we know the first call to `read` (the one
        // that contains the data we want to test) was called
        run_read_write_loop(reader, clients)
            .await
            .expect_err("Error reading from USB device: Mock error");
    }

    #[tokio::test]
    async fn run_read_write_loop_skips_empty_input() {
        set_source(SOURCE);

        let empty_buf = vec![TS100_DATA_TERMINATOR];

        let mock_reader = Builder::new()
            .read(&empty_buf)
            // This error triggers the loop to exit
            .read_error(io::Error::new(io::ErrorKind::Other, "Mock error"))
            .build();

        let reader = BufReader::new(mock_reader);

        let (daemon_end, _client_end) =
            UnixStream::pair().expect("failed to create UnixStream pair");
        let clients: Arc<Mutex<Vec<UnixStream>>> = Arc::new(Mutex::new(vec![daemon_end]));

        // If the loop exits with "Mock error" we know the first call to `read` (the one
        // that contains the data we want to test) was called
        run_read_write_loop(reader, clients)
            .await
            .expect_err("Error reading from USB device: Mock error");
    }

    #[tokio::test]
    async fn run_read_write_loop_parses_complete_document() {
        set_source(SOURCE);

        let mut compliance_bytes = COMPLIANCE_INDICATOR.to_vec();
        compliance_bytes.push(TS100_DATA_TERMINATOR);

        let mut valid_aamva = "\
ANSI 636039090001DL00310485DLDAQNHL12345678
DACFIRST
DADMIDDLE
DCSLAST
DCUJR
"
        .as_bytes()
        .to_vec();
        valid_aamva.push(TS100_DATA_TERMINATOR);

        let mock_reader = Builder::new()
            .read(&compliance_bytes)
            .read(&valid_aamva)
            // This error triggers the loop to exit
            .read_error(io::Error::new(io::ErrorKind::Other, "Mock error"))
            .build();

        let reader = BufReader::new(mock_reader);

        let (daemon_end, client_end) =
            UnixStream::pair().expect("failed to create UnixStream pair");
        let clients: Arc<Mutex<Vec<UnixStream>>> = Arc::new(Mutex::new(vec![daemon_end]));

        run_read_write_loop(reader, clients)
            .await
            .expect_err("Error reading from USB device: Mock error");

        let mut client_buf = Vec::new();
        let mut client_reader = BufReader::new(client_end);
        let _ = client_reader
            .read_until(b'\n', &mut client_buf)
            .await
            .expect("failed to read from client");
        let s = from_utf8(&client_buf).expect("non-UTF8 JSON from broadcast");
        let parsed: serde_json::Value =
            serde_json::from_str(s.trim_end()).expect("unparsable data from test reader");

        let expected = serde_json::json!({
            "issuingJurisdiction": "NH",
            "firstName": "FIRST",
            "middleName": "MIDDLE",
            "lastName": "LAST",
            "nameSuffix": "JR"
        });
        assert_eq!(
            parsed, expected,
            "JSON received by test did not match that expected from initial blob"
        );
    }

    #[tokio::test]
    async fn broadcast_to_clients_sends_valid_json() {
        let doc = AamvaDocument {
            issuing_jurisdiction: AamvaIssuingJurisdiction::NH,
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

    #[tokio::test]
    async fn reset_scanner_no_device_returns_not_connected_error() {
        let err = reset_scanner().await.expect_err("Expected Err when no device found. Are you running this test with the device attached?");

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

    #[tokio::test]
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
