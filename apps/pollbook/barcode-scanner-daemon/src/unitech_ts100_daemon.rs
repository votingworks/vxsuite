use color_eyre::eyre::Context;
use parse_aamva::AamvaDocument;
use serde_json;
use serialport::{DataBits, FlowControl, Parity, StopBits};
use std::io::Write;
use std::io::{BufRead, BufReader, ErrorKind};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::net::{UnixListener, UnixStream};
use std::process::exit;
use std::str::from_utf8;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::{Duration, Instant};
use std::{fs, thread};

use vx_logging::{log, set_source, Disposition, EventId, EventType, Source};

const UDS_PATH: &str = "/tmp/barcodescannerd.sock";

const SOURCE: Source = Source::VxMarkScanControllerDaemon;

// The string denoting the start of an AAMVA-encoded document.
// 3 ASCII chars '@', 'line feed', 'record separator' expected per "D.12.3 Header" AAMVA 2020 p.50
const COMPLIANCE_INDICATOR: &[u8] = b"@\n\x1E";

const HEARTBEAT_LOG_INTERVAL: Duration = Duration::from_secs(60);
const PORT_NAME: &str = "/dev/ttyACM0";
const BAUD_RATE: u32 = 115200;

use rusb::{DeviceHandle, UsbContext};

mod aamva_jurisdictions;
mod parse_aamva;

fn reset_scanner() -> rusb::Result<()> {
    let ctx = rusb::Context::new()?;
    for device in ctx.devices()?.iter() {
        let desc = device.device_descriptor()?;
        if desc.vendor_id() == 0x2745 && desc.product_id() == 0x300a {
            let mut handle: DeviceHandle<_> = device.open()?;
            handle.reset()?;
            sleep(std::time::Duration::from_millis(500));
            break;
        }
    }
    Ok(())
}

fn init_port(
    port_name: &str,
    baud_rate: u32,
) -> color_eyre::Result<Box<dyn serialport::SerialPort>> {
    // We have experienced difficulty reconnecting the scanner when the daemon
    // is stopped and started multiple times. Resetting the scanner solves the issue.
    match reset_scanner() {
        Ok(_) => {
            log!(
                event_id: EventId::UsbDeviceReconnectAttempted,
                message: "Barcode scanner reset succeeded".to_string(),
                event_type: EventType::SystemAction,
                disposition: Disposition::Success
            )
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

    // Open barcode scanner device
    let port = serialport::new(port_name, baud_rate)
        .data_bits(DataBits::Eight)
        .parity(Parity::None)
        .stop_bits(StopBits::One)
        .flow_control(FlowControl::None)
        .timeout(Duration::from_millis(500))
        .open()
        .with_context(|| format!("Failed to open serial port {}", port_name))?;

    Ok(port)
}

fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;

    set_source(SOURCE);
    log!(
        EventId::ProcessStarted;
        EventType::SystemAction
    );

    let _ = fs::remove_file(UDS_PATH);
    let listener = UnixListener::bind(UDS_PATH)?;

    // TODO(Kevin) run server and daemon as same user so we can avoid lax permissions
    fs::set_permissions(UDS_PATH, fs::Permissions::from_mode(0o666))?;

    // A thread‐safe list of all currently‐connected clients
    let clients = Arc::new(Mutex::new(Vec::<UnixStream>::new()));

    // Spawn thread to accept clients
    {
        let clients = clients.clone();
        thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(sock) => {
                        clients.lock().unwrap().push(sock);
                    }
                    Err(e) => {
                        log!(event_id: EventId::SocketConnection, message: format!("UDS client manager encountered error with client: {}", e), event_type: EventType::SystemStatus, disposition: Disposition::Failure)
                    }
                }
            }
        });
    }

    let port = match init_port(PORT_NAME, BAUD_RATE) {
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
        message: format!("Listening for barcode scan data on {}...", PORT_NAME),
        event_type: EventType::SystemStatus,
        disposition: Disposition::Success
    );

    let mut reader = BufReader::new(port);
    let running = Arc::new(AtomicBool::new(true));

    if let Err(e) = ctrlc::set_handler({
        let running = running.clone();
        move || {
            running.store(false, Ordering::SeqCst);
        }
    }) {
        log!(
            event_id: EventId::ErrorSettingSigintHandler,
            message: e.to_string(),
            event_type: EventType::SystemStatus,
            disposition: Disposition::Failure
        );
    }

    let mut buf = Vec::new();
    let mut start = Instant::now();

    // Poll for barcode scan data
    loop {
        if !running.load(Ordering::SeqCst) {
            break;
        }

        if start.elapsed() > HEARTBEAT_LOG_INTERVAL {
            start = Instant::now();
            log!(
                EventId::Heartbeat;
                EventType::SystemStatus
            );
        }

        buf.clear();

        match reader.read_until(b'\r', &mut buf) {
            Ok(_) => {
                // Scanner is configured by default to terminate data with '\r'
                if buf.ends_with(&[b'\r']) {
                    buf.pop();
                }

                if buf.len() == 0 {
                    continue;
                }

                // We expect the input sequence to start with the compliance indicator
                // so we just ignore it and continue to read the next line
                if buf.as_slice() == COMPLIANCE_INDICATOR {
                    continue;
                }

                match from_utf8(&buf) {
                    Ok(s) => {
                        match AamvaDocument::try_from(s) {
                            Ok(document) => {
                                let serialized = serde_json::to_string_pretty(&document)
                                    .context("Failed to serialize AAMVA document to JSON")?;
                                let mut guard = clients.lock().unwrap();

                                // Write the serialized scan JSON to every connected client
                                guard.retain_mut(|client| {
                                    // send, and drop this client from the list if it errors (disconnected)
                                    if let Err(_) = client
                                        .write_all(serialized.as_bytes())
                                        .and_then(|_| client.write_all(b"\n"))
                                    {
                                        false
                                    } else {
                                        true
                                    }
                                });
                            }
                            Err(e) => {
                                log!(
                                    event_id: EventId::ParseError,
                                    message: format!("Scanned data was not in AAMVA format: {e}"),
                                    event_type: EventType::SystemAction,
                                    disposition: Disposition::Failure
                                );
                            }
                        }
                    }
                    Err(e) => {
                        log!(
                            event_id: EventId::ParseError,
                            message: format!("Error parsing scanned bytes as UTF-8: {e}")
                        )
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

    let mut port = reader.into_inner();
    let _ = port.write_data_terminal_ready(false);
    drop(port);

    log!(
        EventId::ProcessTerminated;
        EventType::SystemAction
    );

    Ok(())
}
