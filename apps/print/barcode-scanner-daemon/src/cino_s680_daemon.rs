use color_eyre::eyre::Context;
use nusb::DeviceInfo;
use serde::{Deserialize, Serialize};
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

mod fsc_protocol;

/*
 * Logging config
 */
const SOURCE: Source = Source::VxPrintBarcodeScannerDaemon;
/// How often the daemon logs its heartbeat.
const HEARTBEAT_LOG_INTERVAL: Duration = Duration::from_secs(60);
/// Interval for general polling
const POLLING_INTERVAL: Duration = Duration::from_millis(1000);

/*
 * Unix domain socket config
 */
/// Path of the Unix domain socket used to communicate data between daemon and app backend.
const UDS_PATH: &str = "/tmp/barcodescannerd.sock";

/*
 * Barcode scanner config
 */
/// Vendor ID for Fuzzyscan S680 barcode scanner manufacturer
const CINO_VENDOR_ID: u16 = 0x1fbb;
/// Product ID for Fuzzyscan S680 barcode scanner
const FUZZYSCAN_S680_PRODUCT_ID: u16 = 0x3850;
/// Path to serialport device as set by udev rule
const S680_PORT_NAME: &str = "/dev/barcode_scanner";
/// Default baud rate, used for connecting to serialport device
const S680_BAUD_RATE: u32 = 115_200;
/// Character at the end of each data chunk sent by the S680
const S680_DATA_TERMINATOR: u8 = b'\r';

#[derive(Serialize, Deserialize)]
struct BallotStyleQrCode {
    #[serde(rename = "ballotStyleId")]
    ballot_style_id: String,
}

// Resets the S680 barcode scanner
async fn reset_scanner(device: DeviceInfo) -> Result<(), nusb::Error> {
    device.open()?.reset()?;
    sleep(std::time::Duration::from_millis(500)).await;
    Ok(())
}

// Connects to S680 barcode scanner
async fn init_port(port_name: &str, baud_rate: u32) -> color_eyre::Result<SerialStream> {
    match nusb::list_devices()?.find(|dev| {
        dev.vendor_id() == CINO_VENDOR_ID && dev.product_id() == FUZZYSCAN_S680_PRODUCT_ID
    }) {
        Some(device) => {
            // We have experienced difficulty reconnecting the scanner when the daemon
            // is stopped and started multiple times. Resetting the scanner solves the issue.
            // Configuration such as USB COM Port Emulation persists between resets.
            // Wait because attempting reset immediately after connection can fail.
            sleep(std::time::Duration::from_millis(1000)).await;
            match reset_scanner(device).await {
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
        None => Err(Error::new(ErrorKind::NotFound, "No device found").into()),
    }
}

#[derive(Serialize)]
struct ErrorMessage {
    error: String,
}

async fn write_json<T: Serialize>(stream: &mut UnixStream, value: &T) -> io::Result<()> {
    let mut buf = Vec::new();
    serde_json::to_writer(&mut buf, value)?;
    buf.push(b'\n');

    stream.write_all(&buf).await?;
    stream.flush().await?;
    Ok(())
}

/// Writes data to every client in the mutex. Drops any connections that error.
async fn broadcast_to_clients<T: Serialize>(
    clients: &Arc<Mutex<Vec<UnixStream>>>,
    message: &T,
) -> io::Result<()> {
    let mut guard = clients.lock().await;

    let streams = std::mem::take(&mut *guard);
    drop(guard);

    let mut alive = Vec::with_capacity(streams.len());
    for mut stream in streams {
        match write_json(&mut stream, message).await {
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

/// Reads from any `BufRead`, parses QR code JSON, and writes JSON+"\n" to any Write.
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
    let mut buf = Vec::new();
    let mut reader = BufReader::new(raw_port);

    tokio::spawn(async move {
        loop {
            sleep(HEARTBEAT_LOG_INTERVAL).await;
            log!(EventId::Heartbeat; EventType::SystemStatus);
        }
    });

    loop {
        buf.clear();

        match reader.read_until(S680_DATA_TERMINATOR, &mut buf).await {
            Ok(0) => {
                // EOF; it's possible connection to scanner was lost
                return Err(Error::new(ErrorKind::BrokenPipe, "Scanner disconnected"));
            }
            Ok(_) => {
                buf.pop();

                if buf.is_empty() {
                    continue;
                }

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

                // Skip data with no '{' — can't be JSON. This silently discards
                // scanner ACK packets sent in response to configuration commands
                // (e.g. set_symbology_qr_code_only) that arrive in the read buffer
                // before the first real scan.
                let Some(json_start) = str.find('{') else {
                    continue;
                };
                let json_str = &str[json_start..];

                // Use Deserializer rather than from_str so trailing bytes after the
                // first JSON object (e.g. the scanner's double-payload framing) are
                // ignored instead of causing a parse error.
                let mut de = serde_json::Deserializer::from_str(json_str);
                match BallotStyleQrCode::deserialize(&mut de) {
                    Ok(info) => {
                        log!(
                            event_id: EventId::BarcodeScanned,
                            message: "QR code with BallotStyleQrCode successfully scanned"
                                .to_owned(),
                            event_type: EventType::SystemAction,
                            disposition: Disposition::Success
                        );
                        if let Err(err) = broadcast_to_clients(&clients, &info).await {
                            log!(
                                EventId::SocketServerError,
                                "Failed to write scan to clients: {err}"
                            );
                        }
                    }
                    Err(err) => {
                        log!(
                            event_id: EventId::ParseError,
                            message: format!(
                                "Failed to parse scanned data as BallotStyleQrCode: {err}"
                            ),
                            event_type: EventType::SystemAction,
                            disposition: Disposition::Failure
                        );
                        let error = ErrorMessage {
                            error: "unknown_document_type".to_owned(),
                        };
                        if let Err(err) = broadcast_to_clients(&clients, &error).await {
                            log!(
                                EventId::SocketServerError,
                                "Failed to write parse error to clients: {err}"
                            );
                        }
                    }
                }
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

    let signal = tokio::signal::ctrl_c();
    tokio::pin!(signal);

    // Connect to barcode scanner device
    loop {
        // Race opening the port against user hitting ctrl+c
        let maybe_port = tokio::select! {
            port_result = init_port(S680_PORT_NAME, S680_BAUD_RATE) => {
                Some(port_result)
            }
            _ = &mut signal => None,
        };

        let mut port = match maybe_port {
            // If ctrl+c, exit
            None => break,
            // If couldn't get device, retry
            Some(Err(e)) => {
                log!(
                    event_id: EventId::DeviceAttached,
                    message: format!("Failed to connect to USB barcode scanner: {e}"),
                    event_type: EventType::SystemStatus,
                    disposition: Disposition::Failure
                );
                sleep(POLLING_INTERVAL).await;
                continue;
            }
            // Successfully got device
            Some(Ok(p)) => p,
        };

        log!(
            event_id: EventId::DeviceAttached,
            message: format!("Connected to S680 barcode scanner at {S680_PORT_NAME}..."),
            event_type: EventType::SystemStatus,
            disposition: Disposition::Success
        );

        // Configure scanner. These configurations are nice-to-have so failures
        // are logged but don't stop execution
        let mut scanner = fsc_protocol::Scanner::new(&mut port);

        if let Err(e) = scanner.set_buzzer_volume_low().await {
            log!(
                event_id: EventId::Info,
                message: format!("Failed to set buzzer volume: {e}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );
        }

        if let Err(e) = scanner.set_symbology_qr_code_only().await {
            log!(
                event_id: EventId::Info,
                message: format!("Failed to set symbology to QR code: {e}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );
        }

        // Race infinite read/write loop against ctrl+c
        let read_result = tokio::select! {
            result = run_read_write_loop(port, clients.clone()) => Some(result),
            _ = &mut signal => None,
        };

        match read_result {
            Some(Ok(())) => log!(EventId::Info, "Read/write loop ended without error"),
            Some(Err(err)) => {
                // Wait if we error due to scanner disconnection, giving the OS time to clean up the device node.
                // Reconnecting too quickly may result in attempting to open the stale serial port path of the device
                // we just disconnected.
                sleep(POLLING_INTERVAL).await;
                log!(EventId::UnknownError, "Error in read/write loop: {err}");
            }
            None => break,
        }
    }

    let _ = fs::remove_file(UDS_PATH);

    log!(
        EventId::ProcessTerminated;
        EventType::SystemAction
    );

    Ok(())
}
