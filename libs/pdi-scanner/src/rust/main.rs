use clap::Parser;
use color_eyre::eyre::bail;
use image::{EncodableLayout, GrayImage};
use std::{
    fmt::Debug,
    future::pending,
    io::{self, Write},
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    time::timeout,
};
use tracing_subscriber::prelude::*;

use pdi_scanner::{
    client::{Client, DoubleFeedDetectionCalibrationConfig, ImageCalibrationTables},
    protocol::{
        image::{RawImageData, Sheet, DEFAULT_IMAGE_WIDTH},
        packets::{Incoming, IncomingType},
        types::{
            BootEjectMotion, ClampedPercentage, DoubleFeedDetectionCalibrationType,
            DoubleFeedDetectionMode, EjectMotion, FeederMode, ScanSideMode, Status,
        },
    },
    Error, UsbError,
};

#[derive(Debug, Parser)]
struct Config {
    #[clap(long, env = "LOG_LEVEL", default_value = "warn")]
    log_level: tracing::Level,
}

fn setup(config: &Config) -> color_eyre::Result<()> {
    color_eyre::install()?;
    setup_logging(config)?;
    Ok(())
}

fn setup_logging(config: &Config) -> color_eyre::Result<()> {
    let stderr_log = tracing_subscriber::fmt::layer()
        .with_writer(std::io::stderr)
        .pretty();

    let mut env_filter = tracing_subscriber::EnvFilter::builder()
        .with_default_directive(format!("pdi_scanner={}", config.log_level).parse()?)
        .from_env_lossy();
    env_filter = env_filter.add_directive(format!("pdictl={}", config.log_level).parse()?);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(stderr_log)
        .init();

    Ok(())
}

#[derive(Debug, serde::Deserialize)]
#[serde(
    tag = "command",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Command {
    Exit,

    Connect,

    Disconnect,

    GetScannerStatus,

    EnableScanning {
        bitonal_threshold: ClampedPercentage,
        double_feed_detection_enabled: bool,
        paper_length_inches: f32,
    },

    DisableScanning,

    EjectDocument {
        eject_motion: EjectMotion,
    },

    CalibrateDoubleFeedDetection {
        calibration_type: DoubleFeedDetectionCalibrationType,
    },

    GetDoubleFeedDetectionCalibrationConfig,

    CalibrateImageSensors,

    Reboot,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase")]
enum ErrorCode {
    Disconnected,
    AlreadyConnected,
    ScanInProgress,
    ScanFailed,
    DoubleFeedDetected,
    Other,
}

#[derive(Debug, serde::Serialize)]
#[serde(
    tag = "response",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Response {
    Ok,

    Error {
        code: ErrorCode,
        message: Option<String>,
    },

    ScannerStatus {
        status: Status,
    },

    DoubleFeedDetectionCalibrationConfig {
        config: DoubleFeedDetectionCalibrationConfig,
    },
}

#[derive(Debug, serde::Serialize)]
#[serde(
    tag = "event",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Event {
    Error {
        code: ErrorCode,
        message: Option<String>,
    },

    ScanStart,

    CoverOpen,
    CoverClosed,

    EjectPaused,
    EjectResumed,

    DoubleFeedCalibrationComplete,
    DoubleFeedCalibrationTimedOut,

    ImageSensorCalibrationComplete,
    ImageSensorCalibrationFailed {
        error: Incoming,
    },
}

#[derive(Debug, serde::Serialize)]
#[serde(untagged)]
enum Message {
    Event(Event),
    Response(Response),
}

fn error_to_code_and_message(error: &Error) -> (ErrorCode, Option<String>) {
    match error {
        Error::Usb {
            source:
                UsbError::DeviceNotFound
                | UsbError::NusbTransfer(
                    nusb::transfer::TransferError::Disconnected
                    | nusb::transfer::TransferError::Fault
                    | nusb::transfer::TransferError::Cancelled
                    | nusb::transfer::TransferError::Stall,
                ),
            ..
        } => (ErrorCode::Disconnected, None),

        _ => (ErrorCode::Other, Some(error.to_string())),
    }
}

async fn initialize_connected_scanner(
    mut client: Client,
) -> pdi_scanner::Result<(Client, ImageCalibrationTables)> {
    if timeout(Duration::from_secs(3), client.wait_until_ready())
        .await
        .is_err()
    {
        return Err(Error::RecvTimeout);
    }

    // Configure scanner so that on the next boot/reboot it does not eject any
    // ballots held at startup.
    let calibration_tables = match timeout(
        Duration::from_secs(3),
        client.initialize_scanning(Some(BootEjectMotion::None)),
    )
    .await
    {
        Ok(Ok(calibration_tables)) => calibration_tables,
        Ok(Err(error)) => return Err(error),
        Err(_) => return Err(Error::RecvTimeout),
    };

    Ok((client, calibration_tables))
}

/// TLV frame type for a JSON-encoded [`Message`] (all responses and events
/// except scan results). Must stay in sync with `scanner_client.ts`.
const FRAME_TYPE_JSON: u8 = 1;

/// TLV frame type for a completed scan. The payload contains, for each side
/// (top then bottom): a 4-byte little-endian width, a 4-byte little-endian
/// height, and `width * height` grayscale pixel bytes. Must stay in sync with
/// `scanner_client.ts`.
const FRAME_TYPE_SCAN_COMPLETE: u8 = 2;

/// Byte length of the frame type field in a TLV frame header.
const FRAME_TYPE_LENGTH: usize = 1;

/// Byte length of a TLV frame header: the frame type followed by a
/// little-endian `u32` payload length.
const FRAME_HEADER_LENGTH: usize = FRAME_TYPE_LENGTH + size_of::<u32>();

/// Writes TLV frames to stdout: a 1-byte frame type, a 4-byte little-endian
/// payload length, and the payload. Sending image data as raw bytes rather
/// than JSON avoids base64-encoding multi-megabyte scans and parsing them
/// back out of a giant JSON document on the Node side.
struct Output<W: Write> {
    stdout: W,
    // We reject sending a command while a scan is in progress because it will
    // interrupt the scan. To ensure this flag gets reset whenever a scan stops
    // (whether successfully or with an error or disconnection), we manage this
    // flag in the send_response/send_event methods, since they are called in
    // basically every case when the scanner state changes.
    scan_in_progress: bool,
}

impl<W: Write> Output<W> {
    fn write_frame(&mut self, frame_type: u8, payload_parts: &[&[u8]]) -> color_eyre::Result<()> {
        let payload_length: usize = payload_parts.iter().map(|part| part.len()).sum();
        let mut header = [0u8; FRAME_HEADER_LENGTH];
        header[0] = frame_type;
        header[FRAME_TYPE_LENGTH..].copy_from_slice(&u32::try_from(payload_length)?.to_le_bytes());
        self.stdout.write_all(&header)?;
        for part in payload_parts {
            self.stdout.write_all(part)?;
        }
        // Stdout is line-buffered and frames don't end in newlines, so flush
        // explicitly or the frame may sit in the buffer indefinitely.
        self.stdout.flush()?;
        Ok(())
    }

    fn send_to_stdout(&mut self, message: &Message) -> color_eyre::Result<()> {
        let payload = serde_json::to_vec(message)?;
        self.write_frame(FRAME_TYPE_JSON, &[&payload])
    }

    fn send_response(&mut self, response: Response) -> color_eyre::Result<()> {
        tracing::debug!("sending response: {response:?}");
        self.scan_in_progress = false;
        self.send_to_stdout(&Message::Response(response))
    }

    fn send_event(&mut self, event: Event) -> color_eyre::Result<()> {
        tracing::debug!("sending event: {event:?}");
        self.scan_in_progress = matches!(event, Event::ScanStart);
        self.send_to_stdout(&Message::Event(event))
    }

    fn send_scan_complete(
        &mut self,
        top: &GrayImage,
        bottom: &GrayImage,
    ) -> color_eyre::Result<()> {
        tracing::debug!(
            "sending scanComplete: top {}x{}, bottom {}x{}",
            top.width(),
            top.height(),
            bottom.width(),
            bottom.height()
        );
        // A completed scan ends the scan in progress, just like the events
        // handled in send_event.
        self.scan_in_progress = false;
        let (top_width, top_height) = (top.width().to_le_bytes(), top.height().to_le_bytes());
        let (bottom_width, bottom_height) =
            (bottom.width().to_le_bytes(), bottom.height().to_le_bytes());
        self.write_frame(
            FRAME_TYPE_SCAN_COMPLETE,
            &[
                &top_width,
                &top_height,
                top.as_bytes(),
                &bottom_width,
                &bottom_height,
                bottom.as_bytes(),
            ],
        )
    }

    fn send_error_response(&mut self, error: &Error) -> color_eyre::Result<()> {
        tracing::error!("sending error: {error:?}");
        let (code, message) = error_to_code_and_message(error);
        self.send_response(Response::Error { code, message })
    }

    fn send_error_event(&mut self, error: &Error) -> color_eyre::Result<()> {
        tracing::error!("sending error event: {error:?}");
        let (code, message) = error_to_code_and_message(error);
        self.send_event(Event::Error { code, message })
    }
}

/// Runs the main command/event loop. Reads newline-delimited JSON commands
/// from `stdin`, writes TLV-framed responses and events to `stdout` (see
/// [`Output`]), and uses `connect` to create new scanner connections.
#[allow(clippy::too_many_lines)]
async fn handle_commands_and_events<R: tokio::io::AsyncBufRead + Unpin, W: Write>(
    stdin: R,
    stdout: W,
    mut connect: impl FnMut() -> pdi_scanner::Result<Client>,
) -> color_eyre::Result<()> {
    let mut stdin_lines = stdin.lines();
    let mut output = Output {
        stdout,
        scan_in_progress: false,
    };

    let mut client: Option<Client> = None;
    let mut image_calibration_tables: Option<ImageCalibrationTables> = None;
    let mut raw_image_data = RawImageData::new();

    // Main loop selects whichever of the following is ready first:
    // - Commands received on stdin. Because this loop must complete before
    // more commands can be processed, we are guaranteed to only process one command
    // at a time. Additional commands will be held by `stdin_lines`.
    // - Events or image data received from the scanner. These could
    // be sent by the scanner at any time.
    loop {
        tokio::select! {
            received = stdin_lines.next_line() => {
                let line = match received {
                    Ok(Some(line)) => line,
                    Ok(None) => {
                        tracing::debug!("reached the end of stdin");
                        break;
                    },
                    Err(e) => {
                        bail!("failed to read line from stdin: {e}");
                    }
                };

                match serde_json::from_str::<Command>(&line) {
                    Err(e) => output.send_error_response(&e.into())?,
                    Ok(command) => {
                        tracing::debug!("incoming command: {command:?}");
                        if matches!(command, Command::Exit) {
                            break;
                        }
                        if output.scan_in_progress {
                            output.send_response(Response::Error {
                                code: ErrorCode::ScanInProgress,
                                message: None,
                            })?;
                            continue;
                        }
                        match (&mut client, command) {
                            (_, Command::Exit) => unreachable!(),
                            (Some(_), Command::Connect) => {
                                output.send_response(Response::Error {
                                    code: ErrorCode::AlreadyConnected,
                                    message: None,
                                })?;
                            }
                            (None, Command::Connect) => match connect() {
                                Ok(c) => {
                                    tracing::info!("connect() succeeded");
                                    match initialize_connected_scanner(c).await {
                                        Ok((c, calibration_tables)) => {
                                            image_calibration_tables = Some(calibration_tables);
                                            client = Some(c);
                                            output.send_response(Response::Ok)?;
                                        }
                                        Err(e) => {
                                            output.send_error_response(&e)?;
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::info!("connect() failed");
                                    output.send_error_response(&e)?;
                                }
                            },
                            (Some(_), Command::Disconnect) => {
                                // Take ownership so we can call the consuming
                                // disconnect(), which waits for the background
                                // task to stop and the USB handle to be released.
                                if let Some(client) = client.take() {
                                    client.disconnect().await;
                                }
                                output.send_response(Response::Ok)?;
                            }
                            (Some(client), Command::GetScannerStatus) => {
                                // We use a long-ish timeout here because the scanner
                                // may sometimes be delayed in sending a response (e.g.
                                // if its busy ejecting a long sheet of paper).
                                match timeout(Duration::from_secs(2), client.get_scanner_status()).await {
                                    Ok(Ok(status)) => output.send_response(Response::ScannerStatus { status })?,
                                    Ok(Err(e)) => output.send_error_response(&e)?,
                                    Err(_) => output.send_error_response(&Error::RecvTimeout)?,
                                }
                            }
                            (
                                Some(client),
                                Command::EnableScanning {
                                    bitonal_threshold,
                                    double_feed_detection_enabled,
                                    paper_length_inches,
                                },
                            ) => {
                                let double_feed_detection_mode = if double_feed_detection_enabled {
                                    DoubleFeedDetectionMode::RejectDoubleFeeds
                                } else {
                                    DoubleFeedDetectionMode::Disabled
                                };
                                match client
                                    .send_enable_scan_commands(
                                        bitonal_threshold,
                                        double_feed_detection_mode,
                                        paper_length_inches,
                                    )
                                    .await
                                {
                                    Ok(()) => output.send_response(Response::Ok)?,
                                    Err(e) => output.send_error_response(&e)?,
                                }
                            }
                            (Some(client), Command::DisableScanning) => {
                                match client.set_feeder_mode(FeederMode::Disabled).await {
                                    Ok(()) => output.send_response(Response::Ok)?,
                                    Err(e) => output.send_error_response(&e)?,
                                }
                            }
                            (Some(client), Command::EjectDocument { eject_motion }) => {
                                match client.eject_document(eject_motion).await {
                                    Ok(()) => output.send_response(Response::Ok)?,
                                    Err(e) => output.send_error_response(&e)?,
                                }
                            }
                            (Some(client), Command::CalibrateDoubleFeedDetection { calibration_type }) => {
                                match client
                                    .calibrate_double_feed_detection(calibration_type)
                                    .await
                                {
                                    Ok(()) => output.send_response(Response::Ok)?,
                                    Err(e) => output.send_error_response(&e)?,
                                }
                            }
                            (Some(client), Command::GetDoubleFeedDetectionCalibrationConfig) => {
                                match timeout(
                                    Duration::from_secs(1),
                                    client.get_double_feed_detection_calibration_config(),
                                )
                                .await
                                {
                                    Ok(Ok(config)) => {
                                        output.send_response(Response::DoubleFeedDetectionCalibrationConfig {
                                            config,
                                        })?;
                                    }
                                    Ok(Err(e)) => output.send_error_response(&e)?,
                                    Err(_) => output.send_error_response(&Error::RecvTimeout)?,
                                }
                            }
                            (Some(client), Command::CalibrateImageSensors) => {
                                match client.calibrate_image_sensors().await {
                                    Ok(()) => output.send_response(Response::Ok)?,
                                    Err(e) => output.send_error_response(&e)?,
                                }
                            }
                            (Some(client), Command::Reboot) => {
                                match client.reboot().await {
                                    Ok(()) => output.send_response(Response::Ok)?,
                                    Err(e) => output.send_error_response(&e)?,
                                }
                            }
                            (None, _) => {
                                output.send_response(Response::Error {
                                    code: ErrorCode::Disconnected,
                                    message: None,
                                })?;
                            }
                        }
                    }
                }
            }

            received = async {
                match &mut client {
                    Some(client) => client.recv().await,
                    None => pending().await, // never resolves
                }
            } => {
                let packet = match received {
                    Ok(packet) => {
                        tracing::debug!("PACKET: {packet:?}");
                        packet
                    },
                    Err(Error::TryRecvError(tokio::sync::mpsc::error::TryRecvError::Empty)) => {
                        tracing::debug!("scanner channel received empty packet");
                        continue;
                    },
                    Err(Error::TryRecvError(tokio::sync::mpsc::error::TryRecvError::Disconnected)) => {
                        tracing::debug!("scanner channel disconnected");
                        client = None;
                        continue;
                    }
                    Err(e) => {
                        tracing::error!("PACKET ERROR: {e:?}");
                        output.send_error_event(&e)?;
                        continue;
                    },
                };

                match packet {
                    Incoming::BeginScanEvent => {
                        raw_image_data = RawImageData::new();
                        output.send_event(Event::ScanStart)?;
                    }
                    Incoming::ImageData(image_data) => {
                        raw_image_data.extend_from_slice(&image_data.0);
                    }
                    Incoming::EndScanEvent => {
                        // Disable the feeder immediately after every scan completes
                        // to prevent the firmware from auto-starting another
                        // scan (e.g. if the first scan was just a paper tease).
                        // PickOnCommandMode::FeederMustBeReenabledBetweenScans
                        // is supposed to do this, but it only works when the
                        // paper reaches the rear sensors.
                        if let Some(c) = client.as_mut() {
                            if let Err(e) = c.set_feeder_mode(FeederMode::Disabled).await {
                                tracing::warn!("failed to disable feeder after scan: {e:?}");
                            }
                        }

                        match raw_image_data.try_decode_scan(
                            DEFAULT_IMAGE_WIDTH,
                            ScanSideMode::Duplex,
                            &image_calibration_tables
                                .clone()
                                .expect("image calibration tables not set"),
                        ) {
                            Ok(Sheet::Duplex(top, bottom)) => {
                                output.send_scan_complete(&top, &bottom)?;
                            }
                            Ok(_) => unreachable!(
                                "try_decode_scan called with {:?} returned non-duplex sheet",
                                ScanSideMode::Duplex
                            ),
                            Err(e) => {
                                output.send_event(Event::Error {
                                    code: ErrorCode::ScanFailed,
                                    message: Some(format!(
                                        "failed to decode the scanned image data: {e}"
                                    )),
                                })?;
                            }
                        }
                    }
                    Incoming::CoverOpenEvent => {
                        output.send_event(Event::CoverOpen)?;
                    }
                    Incoming::CoverClosedEvent => {
                        output.send_event(Event::CoverClosed)?;
                    }
                    Incoming::DoubleFeedEvent => {
                        output.send_event(Event::Error {
                            code: ErrorCode::DoubleFeedDetected,
                            message: None,
                        })?;
                    }
                    Incoming::EjectPauseEvent => {
                        output.send_event(Event::EjectPaused)?;
                    }
                    Incoming::EjectResumeEvent => {
                        output.send_event(Event::EjectResumed)?;
                    }
                    Incoming::DoubleFeedCalibrationCompleteEvent => {
                        output.send_event(Event::DoubleFeedCalibrationComplete)?;
                    }
                    Incoming::DoubleFeedCalibrationTimedOutEvent => {
                        output.send_event(Event::DoubleFeedCalibrationTimedOut)?;
                    }
                    Incoming::CalibrationOkEvent => {
                        output.send_event(Event::ImageSensorCalibrationComplete)?;
                    }
                    event if matches!(event.message_type(), IncomingType::CalibrationEvent) => {
                        output.send_event(Event::ImageSensorCalibrationFailed { error: event })?;
                    }
                    event => {
                        tracing::info!("unhandled event: {event:?}");
                    }
                }
            }
        }
    }

    Ok(())
}

#[tokio::main]
async fn main() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    let stdin = BufReader::new(tokio::io::stdin());
    handle_commands_and_events(stdin, io::stdout(), Client::connect).await
}

#[cfg(test)]
mod tests {
    use std::{io, time::Duration};

    use pdi_scanner::{
        client::Client,
        protocol::packets::{Incoming, Outgoing},
        scanner::Scanner,
    };
    use serde_json::{json, Value};
    use tokio::{
        io::{AsyncWriteExt, BufReader},
        sync::mpsc,
        time::timeout,
    };

    use super::{handle_commands_and_events, FRAME_HEADER_LENGTH, FRAME_TYPE_LENGTH};

    const TEST_TIMEOUT: Duration = Duration::from_secs(3);

    /// A Write impl that decodes each TLV frame and sends it to a channel as
    /// a JSON value, allowing the test to await individual messages. Scan
    /// complete frames are decoded into
    /// `{"event": "scanComplete", "images": [{"width", "height", "data"}, …]}`.
    struct ChannelWriter {
        tx: mpsc::UnboundedSender<Value>,
        buf: Vec<u8>,
    }

    impl ChannelWriter {
        fn new() -> (Self, mpsc::UnboundedReceiver<Value>) {
            let (tx, rx) = mpsc::unbounded_channel();
            (
                Self {
                    tx,
                    buf: Vec::new(),
                },
                rx,
            )
        }
    }

    const U32_LENGTH: usize = size_of::<u32>();
    const IMAGE_DIMENSIONS_LENGTH: usize = 2 * U32_LENGTH;

    fn read_u32_le(bytes: &[u8], offset: usize) -> usize {
        u32::from_le_bytes(bytes[offset..offset + U32_LENGTH].try_into().unwrap()) as usize
    }

    fn decode_scan_complete_payload(payload: &[u8]) -> Value {
        let mut images = Vec::new();
        let mut offset = 0;
        while offset < payload.len() {
            let width = read_u32_le(payload, offset);
            let height = read_u32_le(payload, offset + U32_LENGTH);
            let data_start = offset + IMAGE_DIMENSIONS_LENGTH;
            let data = &payload[data_start..data_start + width * height];
            images.push(json!({ "width": width, "height": height, "data": data }));
            offset = data_start + width * height;
        }
        json!({ "event": "scanComplete", "images": images })
    }

    impl io::Write for ChannelWriter {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.buf.extend_from_slice(data);
            loop {
                if self.buf.len() < FRAME_HEADER_LENGTH {
                    break;
                }
                let payload_length = read_u32_le(&self.buf, FRAME_TYPE_LENGTH);
                if self.buf.len() < FRAME_HEADER_LENGTH + payload_length {
                    break;
                }
                let frame: Vec<u8> = self
                    .buf
                    .drain(..FRAME_HEADER_LENGTH + payload_length)
                    .collect();
                let (frame_type, payload) = (frame[0], &frame[FRAME_HEADER_LENGTH..]);
                let value: Value = match frame_type {
                    super::FRAME_TYPE_JSON => serde_json::from_slice(payload).unwrap(),
                    super::FRAME_TYPE_SCAN_COMPLETE => decode_scan_complete_payload(payload),
                    _ => panic!("unknown frame type: {frame_type}"),
                };
                let _ = self.tx.send(value);
            }
            Ok(data.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    struct ConnectedTestHarness {
        host_to_scanner_rx: mpsc::UnboundedReceiver<(usize, Outgoing)>,
        host_to_scanner_ack_tx: mpsc::UnboundedSender<usize>,
        scanner_to_host_tx: mpsc::UnboundedSender<pdi_scanner::Result<Incoming>>,
    }

    fn setup_connected_client() -> (Client, ConnectedTestHarness) {
        setup_connected_client_with_calibration(&[], &[])
    }

    fn setup_connected_client_with_calibration(
        white_calibration_table: &[u8],
        black_calibration_table: &[u8],
    ) -> (Client, ConnectedTestHarness) {
        use pdi_scanner::protocol::types::Register;

        let (host_to_scanner_tx, host_to_scanner_rx) = mpsc::unbounded_channel();
        let (host_to_scanner_ack_tx, host_to_scanner_ack_rx) = mpsc::unbounded_channel();
        let (scanner_to_host_tx, scanner_to_host_rx) = mpsc::unbounded_channel();

        // Pre-load responses for initialize_connected_scanner:
        // wait_until_ready: EnableCrcChecking (ack 0) + GetTestString (ack 1 + response)
        // initialize_scanning:
        //   DisableFeeder (ack 2)
        //   set_boot_eject_motion reads register 9 (ack 3 + response)
        //     value 0x200 = BootEjectMotion::None already set, so no write needed
        //   GetCalibrationInfo (ack 4 + 2 responses)
        for i in 0..5 {
            host_to_scanner_ack_tx.send(i).unwrap();
        }
        let register_9 = pdi_scanner::protocol::types::RegisterIndex::new(9).unwrap();
        scanner_to_host_tx
            .send(Ok(Incoming::GetTestStringResponse("test".into())))
            .unwrap();
        scanner_to_host_tx
            .send(Ok(Incoming::ReadRegisterDataResponse(Register::new(
                register_9, 0x200, // BootEjectMotion::None (2) << 8
            ))))
            .unwrap();
        let cal = || Incoming::GetCalibrationInformationResponse {
            white_calibration_table: white_calibration_table.to_vec(),
            black_calibration_table: black_calibration_table.to_vec(),
        };
        scanner_to_host_tx.send(Ok(cal())).unwrap();
        scanner_to_host_tx.send(Ok(cal())).unwrap();

        let client = Client::from_scanner(Scanner::mock(
            host_to_scanner_tx,
            host_to_scanner_ack_rx,
            scanner_to_host_rx,
        ));

        (
            client,
            ConnectedTestHarness {
                host_to_scanner_rx,
                host_to_scanner_ack_tx,
                scanner_to_host_tx,
            },
        )
    }

    /// Sends a JSON command to stdin and waits for the next output message.
    async fn send_command(
        stdin: &mut tokio::io::DuplexStream,
        output_rx: &mut mpsc::UnboundedReceiver<Value>,
        cmd: &str,
    ) -> Value {
        stdin.write_all(cmd.as_bytes()).await.unwrap();
        stdin.write_all(b"\n").await.unwrap();
        timeout(TEST_TIMEOUT, output_rx.recv())
            .await
            .unwrap()
            .unwrap()
    }

    /// Sends a JSON command to stdin without waiting for output (for exit).
    async fn send_exit(stdin: &mut tokio::io::DuplexStream) {
        stdin.write_all(b"{\"command\":\"exit\"}\n").await.unwrap();
    }

    /// Waits for the next output message.
    async fn recv_output(output_rx: &mut mpsc::UnboundedReceiver<Value>) -> Value {
        timeout(TEST_TIMEOUT, output_rx.recv())
            .await
            .unwrap()
            .unwrap()
    }

    /// Collects all remaining messages from the output channel.
    fn drain_output(output_rx: &mut mpsc::UnboundedReceiver<Value>) -> Vec<Value> {
        let mut messages = Vec::new();
        while let Ok(msg) = output_rx.try_recv() {
            messages.push(msg);
        }
        messages
    }

    /// Runs the event loop with pre-written stdin, no connect needed.
    async fn run_disconnected(input: &[u8]) -> Vec<Value> {
        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        stdin_write.write_all(input).await.unwrap();
        drop(stdin_write);

        let (stdout_writer, mut output_rx) = ChannelWriter::new();
        timeout(
            TEST_TIMEOUT,
            handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                unreachable!("connect should not be called")
            }),
        )
        .await
        .unwrap()
        .unwrap();
        drain_output(&mut output_rx)
    }

    /// Runs the event loop with pre-written stdin, using a mock connected client.
    async fn run_connected(input: &[u8]) -> (Vec<Value>, ConnectedTestHarness) {
        let (client, harness) = setup_connected_client();
        let mut client_slot = Some(client);

        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        stdin_write.write_all(input).await.unwrap();
        drop(stdin_write);

        let (stdout_writer, mut output_rx) = ChannelWriter::new();
        timeout(
            TEST_TIMEOUT,
            handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                Ok(client_slot.take().expect("connect called more than once"))
            }),
        )
        .await
        .unwrap()
        .unwrap();
        (drain_output(&mut output_rx), harness)
    }

    #[tokio::test]
    async fn exit_command_terminates_loop() {
        let messages = run_disconnected(b"{\"command\":\"exit\"}\n").await;
        assert!(messages.is_empty());
    }

    #[tokio::test]
    async fn eof_terminates_loop() {
        let (stdin_read, stdin_write) = tokio::io::duplex(1024);
        drop(stdin_write);

        let (stdout_writer, mut output_rx) = ChannelWriter::new();
        timeout(
            TEST_TIMEOUT,
            handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                unreachable!("connect should not be called")
            }),
        )
        .await
        .unwrap()
        .unwrap();
        assert!(drain_output(&mut output_rx).is_empty());
    }

    #[tokio::test]
    async fn command_while_disconnected_returns_error() {
        let messages =
            run_disconnected(b"{\"command\":\"getScannerStatus\"}\n{\"command\":\"exit\"}\n").await;
        assert_eq!(
            messages,
            vec![json!({"response": "error", "code": "disconnected", "message": null})]
        );
    }

    #[tokio::test]
    async fn invalid_command_returns_error() {
        let messages = run_disconnected(b"not json\n{\"command\":\"exit\"}\n").await;
        assert_eq!(
            messages,
            vec![
                json!({"response": "error", "code": "other", "message": "failed to serialize JSON: expected ident at line 1 column 2"})
            ]
        );
    }

    #[tokio::test]
    async fn connect_success() {
        let (messages, _harness) =
            run_connected(b"{\"command\":\"connect\"}\n{\"command\":\"exit\"}\n").await;
        assert_eq!(messages, vec![json!({"response": "ok"})]);
    }

    #[tokio::test]
    async fn connect_failure() {
        let (stdin_read, mut stdin_write) = tokio::io::duplex(1024);
        stdin_write
            .write_all(b"{\"command\":\"connect\"}\n{\"command\":\"exit\"}\n")
            .await
            .unwrap();
        drop(stdin_write);

        let (stdout_writer, mut output_rx) = ChannelWriter::new();
        timeout(
            TEST_TIMEOUT,
            handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                Err(pdi_scanner::Error::Usb {
                    source: pdi_scanner::UsbError::DeviceNotFound,
                    trace: std::backtrace::Backtrace::capture(),
                })
            }),
        )
        .await
        .unwrap()
        .unwrap();

        let messages = drain_output(&mut output_rx);
        assert_eq!(
            messages,
            vec![json!({"response": "error", "code": "disconnected", "message": null})]
        );
    }

    #[tokio::test]
    async fn already_connected_returns_error() {
        let (messages, _harness) = run_connected(
            b"{\"command\":\"connect\"}\n\
              {\"command\":\"connect\"}\n\
              {\"command\":\"exit\"}\n",
        )
        .await;
        assert_eq!(
            messages,
            vec![
                json!({"response": "ok"}),
                json!({"response": "error", "code": "alreadyConnected", "message": null}),
            ]
        );
    }

    #[tokio::test]
    async fn disconnect_returns_ok() {
        let (messages, _harness) = run_connected(
            b"{\"command\":\"connect\"}\n\
              {\"command\":\"disconnect\"}\n\
              {\"command\":\"exit\"}\n",
        )
        .await;
        assert_eq!(
            messages,
            vec![json!({"response": "ok"}), json!({"response": "ok"})]
        );
    }

    #[tokio::test]
    async fn scanner_event_forwarded() {
        let (client, harness) = setup_connected_client();
        let mut client_slot = Some(client);
        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        let (stdout_writer, mut output_rx) = ChannelWriter::new();

        let (result, ()) = timeout(TEST_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    let msg =
                        send_command(&mut stdin_write, &mut output_rx, r#"{"command":"connect"}"#)
                            .await;
                    assert_eq!(msg, json!({"response": "ok"}));

                    harness
                        .scanner_to_host_tx
                        .send(Ok(Incoming::CoverOpenEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg, json!({"event": "coverOpen"}));

                    send_exit(&mut stdin_write).await;
                }
            )
        })
        .await
        .unwrap();
        result.unwrap();
    }

    #[tokio::test]
    async fn scan_in_progress_blocks_commands() {
        let (client, harness) = setup_connected_client();
        let mut client_slot = Some(client);
        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        let (stdout_writer, mut output_rx) = ChannelWriter::new();

        let (result, ()) = timeout(TEST_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    send_command(&mut stdin_write, &mut output_rx, r#"{"command":"connect"}"#)
                        .await;

                    harness
                        .scanner_to_host_tx
                        .send(Ok(Incoming::BeginScanEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg, json!({"event": "scanStart"}));

                    let msg = send_command(
                        &mut stdin_write,
                        &mut output_rx,
                        r#"{"command":"disableScanning"}"#,
                    )
                    .await;
                    assert_eq!(
                        msg,
                        json!({"response": "error", "code": "scanInProgress", "message": null})
                    );

                    send_exit(&mut stdin_write).await;
                }
            )
        })
        .await
        .unwrap();
        result.unwrap();
    }

    #[tokio::test]
    async fn end_scan_disables_feeder() {
        let (client, mut harness) = setup_connected_client();
        let mut client_slot = Some(client);
        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        let (stdout_writer, mut output_rx) = ChannelWriter::new();

        let (result, ()) = timeout(TEST_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    send_command(&mut stdin_write, &mut output_rx, r#"{"command":"connect"}"#)
                        .await;

                    // Drain the init commands
                    while harness.host_to_scanner_rx.try_recv().is_ok() {}

                    // EndScan needs an ack for the feeder disable command (ID 5, after
                    // the 5 init commands used IDs 0-4)
                    harness.host_to_scanner_ack_tx.send(5).unwrap();
                    harness
                        .scanner_to_host_tx
                        .send(Ok(Incoming::EndScanEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg["event"], "error");
                    assert_eq!(msg["code"], "scanFailed");

                    send_exit(&mut stdin_write).await;
                }
            )
        })
        .await
        .unwrap();
        result.unwrap();

        // Verify the feeder disable command was sent (after draining init commands)
        let (_, packet) = timeout(TEST_TIMEOUT, harness.host_to_scanner_rx.recv())
            .await
            .unwrap()
            .unwrap();
        assert_eq!(packet, Outgoing::DisableFeederRequest);
    }

    #[tokio::test]
    async fn scanner_error_forwarded_as_event() {
        let (client, harness) = setup_connected_client();
        let mut client_slot = Some(client);
        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        let (stdout_writer, mut output_rx) = ChannelWriter::new();

        let (result, ()) = timeout(TEST_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    send_command(&mut stdin_write, &mut output_rx, r#"{"command":"connect"}"#)
                        .await;

                    harness
                        .scanner_to_host_tx
                        .send(Err(pdi_scanner::Error::RecvTimeout))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg["event"], "error");
                    assert_eq!(msg["code"], "other");

                    send_exit(&mut stdin_write).await;
                }
            )
        })
        .await
        .unwrap();
        result.unwrap();
    }

    #[tokio::test]
    async fn scanner_task_exit_resets_to_disconnected() {
        let (client, harness) = setup_connected_client();
        let mut client_slot = Some(client);
        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        let (stdout_writer, mut output_rx) = ChannelWriter::new();

        let (result, ()) = timeout(TEST_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    send_command(&mut stdin_write, &mut output_rx, r#"{"command":"connect"}"#)
                        .await;

                    // Simulate a USB error that produces an error event,
                    // then drop the channel so the next recv gets Disconnected
                    // and clears the client.
                    harness
                        .scanner_to_host_tx
                        .send(Err(pdi_scanner::Error::RecvTimeout))
                        .unwrap();
                    drop(harness.scanner_to_host_tx);
                    // Wait for the error event — confirms the error was processed
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg["event"], "error");
                    // The channel close is processed on the next select iteration
                    // (no output). The following command confirms client = None.
                    let msg = send_command(
                        &mut stdin_write,
                        &mut output_rx,
                        r#"{"command":"disableScanning"}"#,
                    )
                    .await;
                    assert_eq!(
                        msg,
                        json!({"response": "error", "code": "disconnected", "message": null})
                    );

                    send_exit(&mut stdin_write).await;
                }
            )
        })
        .await
        .unwrap();
        result.unwrap();
    }

    #[tokio::test]
    async fn connect_initialization_failure() {
        let (host_to_scanner_tx, _host_to_scanner_rx) = mpsc::unbounded_channel();
        let (_host_to_scanner_ack_tx, host_to_scanner_ack_rx) = mpsc::unbounded_channel();
        let (_scanner_to_host_tx, scanner_to_host_rx) = mpsc::unbounded_channel();

        // Client connects but init times out (no acks pre-loaded)
        let client = Client::from_scanner(Scanner::mock(
            host_to_scanner_tx,
            host_to_scanner_ack_rx,
            scanner_to_host_rx,
        ));
        let mut client_slot = Some(client);

        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        stdin_write
            .write_all(b"{\"command\":\"connect\"}\n{\"command\":\"exit\"}\n")
            .await
            .unwrap();
        drop(stdin_write);

        let (stdout_writer, mut output_rx) = ChannelWriter::new();
        timeout(
            Duration::from_secs(10),
            handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                Ok(client_slot.take().expect("connect called more than once"))
            }),
        )
        .await
        .unwrap()
        .unwrap();

        let messages = drain_output(&mut output_rx);
        assert_eq!(
            messages,
            vec![
                json!({"response": "error", "code": "other", "message": "timed out receiving data"})
            ]
        );
    }

    #[tokio::test]
    async fn scan_complete_sends_image_frame() {
        use pdi_scanner::protocol::{image::DEFAULT_IMAGE_WIDTH, packets::ImageData};

        const WIDTH: usize = DEFAULT_IMAGE_WIDTH as usize;
        const HEIGHT: usize = 4;
        const TOP_PIXEL: u8 = 7;
        const BOTTOM_PIXEL: u8 = 9;

        // White = 255 and black = 0 make image calibration the identity
        // function, so decoded pixels equal the raw pixels.
        let (client, mut harness) =
            setup_connected_client_with_calibration(&[u8::MAX; WIDTH], &[0; WIDTH]);
        let mut client_slot = Some(client);
        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        let (stdout_writer, mut output_rx) = ChannelWriter::new();

        let (result, ()) = timeout(TEST_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    send_command(&mut stdin_write, &mut output_rx, r#"{"command":"connect"}"#)
                        .await;

                    // Drain init commands
                    while harness.host_to_scanner_rx.try_recv().is_ok() {}

                    harness
                        .scanner_to_host_tx
                        .send(Ok(Incoming::BeginScanEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg, json!({"event": "scanStart"}));

                    // Duplex image data alternates top and bottom pixels
                    let mut data = Vec::with_capacity(2 * WIDTH * HEIGHT);
                    for _ in 0..(WIDTH * HEIGHT) {
                        data.push(TOP_PIXEL);
                        data.push(BOTTOM_PIXEL);
                    }
                    harness
                        .scanner_to_host_tx
                        .send(Ok(Incoming::ImageData(ImageData(data))))
                        .unwrap();

                    // EndScan needs an ack for the feeder disable command
                    harness.host_to_scanner_ack_tx.send(5).unwrap();
                    harness
                        .scanner_to_host_tx
                        .send(Ok(Incoming::EndScanEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(
                        msg,
                        json!({
                            "event": "scanComplete",
                            "images": [
                                {
                                    "width": WIDTH,
                                    "height": HEIGHT,
                                    "data": vec![TOP_PIXEL; WIDTH * HEIGHT],
                                },
                                {
                                    "width": WIDTH,
                                    "height": HEIGHT,
                                    "data": vec![BOTTOM_PIXEL; WIDTH * HEIGHT],
                                },
                            ],
                        })
                    );

                    send_exit(&mut stdin_write).await;
                }
            )
        })
        .await
        .unwrap();
        result.unwrap();
    }

    #[tokio::test]
    async fn scan_in_progress_resets_after_end_scan() {
        let (client, mut harness) = setup_connected_client();
        let mut client_slot = Some(client);
        let (stdin_read, mut stdin_write) = tokio::io::duplex(4096);
        let (stdout_writer, mut output_rx) = ChannelWriter::new();

        let (result, ()) = timeout(TEST_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), stdout_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    send_command(&mut stdin_write, &mut output_rx, r#"{"command":"connect"}"#)
                        .await;

                    // Drain init commands
                    while harness.host_to_scanner_rx.try_recv().is_ok() {}

                    // Start a scan
                    harness
                        .scanner_to_host_tx
                        .send(Ok(Incoming::BeginScanEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg, json!({"event": "scanStart"}));

                    // End the scan (needs ack for feeder disable)
                    harness.host_to_scanner_ack_tx.send(5).unwrap();
                    harness
                        .scanner_to_host_tx
                        .send(Ok(Incoming::EndScanEvent))
                        .unwrap();
                    // Wait for scanFailed event (image decode fails on empty data)
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg["event"], "error");
                    assert_eq!(msg["code"], "scanFailed");

                    // Now a command should succeed (not get scanInProgress)
                    harness.host_to_scanner_ack_tx.send(6).unwrap();
                    let msg = send_command(
                        &mut stdin_write,
                        &mut output_rx,
                        r#"{"command":"disableScanning"}"#,
                    )
                    .await;
                    assert_eq!(msg, json!({"response": "ok"}));

                    send_exit(&mut stdin_write).await;
                }
            )
        })
        .await
        .unwrap();
        result.unwrap();
    }
}
