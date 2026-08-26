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
    Error, UsbError,
    client::{Client, DoubleFeedDetectionCalibrationConfig, ImageCalibrationTables},
    protocol::{
        image::{DEFAULT_IMAGE_WIDTH, RawImageData, Sheet},
        packets::{Incoming, IncomingType},
        types::{
            BootEjectMotion, ClampedPercentage, DoubleFeedDetectionCalibrationType,
            DoubleFeedDetectionMode, EjectMotion, FeederMode, ScanSideMode, Status,
        },
    },
};

#[cfg(feature = "recording")]
use pdi_scanner::recording;

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
///
/// Frames are written by a dedicated thread so that a slow reader (e.g. Node
/// busy interpreting the previous sheet) never stalls the command/event loop,
/// which must keep servicing scanner packets and commands.
struct Output {
    frames_tx: Option<std::sync::mpsc::Sender<Vec<u8>>>,
    writer_thread: Option<std::thread::JoinHandle<()>>,
    // We reject sending a command while a scan is in progress because it will
    // interrupt the scan. The flag is set by the scan start event and cleared
    // by every other scanner event (any event during a scan — completion,
    // scan failure, double feed, cover open — means the scan is over or
    // aborted) and by scanner disconnection. Responses must NOT clear it: the
    // only response possible while scanning is the ScanInProgress rejection
    // itself.
    scan_in_progress: bool,
}

impl Output {
    fn new<W: Write + Send + 'static>(mut stdout: W) -> Self {
        let (frames_tx, frames_rx) = std::sync::mpsc::channel::<Vec<u8>>();
        let writer_thread = std::thread::spawn(move || {
            for frame in frames_rx {
                // Stdout is line-buffered and frames don't end in newlines,
                // so flush explicitly or the frame may sit in the buffer
                // indefinitely.
                if let Err(error) = stdout.write_all(&frame).and_then(|()| stdout.flush()) {
                    tracing::error!("failed to write frame to stdout: {error}");
                    // Dropping the receiver makes subsequent write_frame
                    // calls fail, which shuts down the main loop.
                    break;
                }
            }
        });
        Self {
            frames_tx: Some(frames_tx),
            writer_thread: Some(writer_thread),
            scan_in_progress: false,
        }
    }

    fn write_frame(&mut self, frame_type: u8, payload_parts: &[&[u8]]) -> color_eyre::Result<()> {
        let payload_length: usize = payload_parts.iter().map(|part| part.len()).sum();
        let mut frame = Vec::with_capacity(FRAME_HEADER_LENGTH + payload_length);
        frame.push(frame_type);
        frame.extend_from_slice(&u32::try_from(payload_length)?.to_le_bytes());
        for part in payload_parts {
            frame.extend_from_slice(part);
        }
        #[cfg(feature = "recording")]
        if recording::is_enabled() {
            recording::record(&recording::Entry::stdout_frame(
                frame_type,
                &frame[FRAME_HEADER_LENGTH..],
            ));
        }
        let Some(frames_tx) = self.frames_tx.as_ref() else {
            bail!("stdout writer thread is not running");
        };
        if frames_tx.send(frame).is_err() {
            bail!("stdout writer thread stopped");
        }
        Ok(())
    }

    fn send_to_stdout(&mut self, message: &Message) -> color_eyre::Result<()> {
        let payload = serde_json::to_vec(message)?;
        self.write_frame(FRAME_TYPE_JSON, &[&payload])
    }

    fn send_response(&mut self, response: Response) -> color_eyre::Result<()> {
        tracing::debug!("sending response: {response:?}");
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

impl Drop for Output {
    fn drop(&mut self) {
        // Close the queue so the writer thread drains what remains and exits,
        // then wait for it: nothing already queued is lost on shutdown.
        drop(self.frames_tx.take());
        if let Some(writer_thread) = self.writer_thread.take()
            && writer_thread.join().is_err()
        {
            tracing::error!("stdout writer thread panicked");
        }
    }
}

/// Runs the main command/event loop. Reads newline-delimited JSON commands
/// from `stdin`, writes TLV-framed responses and events to `stdout` (see
/// [`Output`]), and uses `connect` to create new scanner connections.
#[allow(clippy::too_many_lines)]
async fn handle_commands_and_events<
    R: tokio::io::AsyncBufRead + Unpin,
    W: Write + Send + 'static,
>(
    stdin: R,
    stdout: W,
    mut connect: impl FnMut() -> pdi_scanner::Result<Client>,
) -> color_eyre::Result<()> {
    let mut stdin_lines = stdin.lines();
    let mut output = Output::new(stdout);

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
                #[cfg(feature = "recording")]
                if recording::is_enabled() {
                    recording::record(&recording::Entry::StdinCommand { line: line.clone() });
                }

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
                                // Discard any leftover image data from an
                                // aborted scan before a new scan session.
                                raw_image_data.clear();
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
                    Err(Error::TryRecvError(tokio::sync::mpsc::error::TryRecvError::Disconnected)) => {
                        tracing::debug!("scanner channel disconnected");
                        client = None;
                        // No event is emitted on this path, so clear the scan
                        // flag directly: a disconnected scanner is not
                        // scanning, and a stuck flag would reject every
                        // command forever.
                        output.scan_in_progress = false;
                        continue;
                    }
                    Err(e) => {
                        tracing::error!("PACKET ERROR: {e:?}");
                        output.send_error_event(&e)?;
                        continue;
                    },
                };

                match packet {
                    // Note: the accumulator is deliberately NOT reset here.
                    // The USB task polls the image data endpoint ahead of the
                    // primary endpoint, so the first image chunks of a scan
                    // can be forwarded before the begin event that the
                    // scanner physically emitted first; resetting here would
                    // drop them. The accumulator is cleared after each scan
                    // is decoded and when scanning is enabled.
                    Incoming::BeginScanEvent => {
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
                        if let Some(c) = client.as_mut()
                            && let Err(e) = c.set_feeder_mode(FeederMode::Disabled).await {
                                tracing::warn!("failed to disable feeder after scan: {e:?}");
                            }

                        match raw_image_data.try_decode_scan(
                            DEFAULT_IMAGE_WIDTH,
                            ScanSideMode::Duplex,
                            image_calibration_tables
                                .as_ref()
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
                        raw_image_data.clear();
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

    use std::path::PathBuf;

    use pdi_scanner::{
        client::Client,
        protocol::{
            image::DEFAULT_IMAGE_WIDTH,
            packets::{ImageData, Incoming, IncomingType, Outgoing},
            parsers,
            types::{Register, RegisterIndex, Resolution},
        },
        recording::{self, Endpoint, Entry, FramePayload, Record},
        scanner::Scanner,
    };
    use serde_json::{Value, json};
    use tokio::{
        io::{AsyncWriteExt, BufReader},
        sync::mpsc,
        time::timeout,
    };

    use super::{FRAME_HEADER_LENGTH, FRAME_TYPE_LENGTH, handle_commands_and_events};

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

    /// Extracts each complete TLV frame from `buf` and passes its type and
    /// payload to `handle`.
    fn drain_frames(buf: &mut Vec<u8>, mut handle: impl FnMut(u8, &[u8])) {
        loop {
            if buf.len() < FRAME_HEADER_LENGTH {
                break;
            }
            let payload_length = read_u32_le(buf, FRAME_TYPE_LENGTH);
            if buf.len() < FRAME_HEADER_LENGTH + payload_length {
                break;
            }
            let frame: Vec<u8> = buf.drain(..FRAME_HEADER_LENGTH + payload_length).collect();
            handle(frame[0], &frame[FRAME_HEADER_LENGTH..]);
        }
    }

    impl io::Write for ChannelWriter {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.buf.extend_from_slice(data);
            let tx = &self.tx;
            drain_frames(&mut self.buf, |frame_type, payload| {
                let value: Value = match frame_type {
                    super::FRAME_TYPE_JSON => serde_json::from_slice(payload).unwrap(),
                    super::FRAME_TYPE_SCAN_COMPLETE => decode_scan_complete_payload(payload),
                    _ => panic!("unknown frame type: {frame_type}"),
                };
                let _ = tx.send(value);
            });
            Ok(data.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    /// Like [`ChannelWriter`], but sends each frame's raw type and payload,
    /// for comparison against recordings.
    struct RawFrameChannelWriter {
        tx: mpsc::UnboundedSender<(u8, Vec<u8>)>,
        buf: Vec<u8>,
    }

    impl RawFrameChannelWriter {
        fn new() -> (Self, mpsc::UnboundedReceiver<(u8, Vec<u8>)>) {
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

    impl io::Write for RawFrameChannelWriter {
        fn write(&mut self, data: &[u8]) -> io::Result<usize> {
            self.buf.extend_from_slice(data);
            let tx = &self.tx;
            drain_frames(&mut self.buf, |frame_type, payload| {
                let _ = tx.send((frame_type, payload.to_vec()));
            });
            Ok(data.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    struct ConnectedTestHarness {
        /// Packets successfully "written" to the scanner, in order (writes are
        /// acknowledged automatically).
        outgoing_rx: mpsc::UnboundedReceiver<Outgoing>,
        /// Kept alive so the responses channel stays open, as it would with a
        /// live USB task.
        _responses_tx: mpsc::UnboundedSender<Incoming>,
        events_tx: mpsc::UnboundedSender<pdi_scanner::Result<Incoming>>,
    }

    fn setup_connected_client() -> (Client, ConnectedTestHarness) {
        setup_connected_client_with_calibration(&[], &[])
    }

    fn setup_connected_client_with_calibration(
        white_calibration_table: &[u8],
        black_calibration_table: &[u8],
    ) -> (Client, ConnectedTestHarness) {
        let (host_to_scanner_tx, mut host_to_scanner_rx) =
            mpsc::unbounded_channel::<pdi_scanner::scanner::OutgoingCommand>();
        let (responses_tx, responses_rx) = mpsc::unbounded_channel();
        let (events_tx, events_rx) = mpsc::unbounded_channel();
        let (outgoing_tx, outgoing_rx) = mpsc::unbounded_channel();

        // Mini mock scanner: acks every write, forwards the written packets
        // for assertions, and answers the requests that expect responses —
        // enough for initialize_connected_scanner. Register 9 reads back
        // 0x200 = BootEjectMotion::None, so no register write follows.
        // Responses must be sent reactively: a response sitting in the
        // channel before its command is sent would be discarded as stale.
        let white_calibration_table = white_calibration_table.to_vec();
        let black_calibration_table = black_calibration_table.to_vec();
        let mock_responses_tx = responses_tx.clone();
        tokio::spawn(async move {
            while let Some((packet, ack)) = host_to_scanner_rx.recv().await {
                let _ = ack.send(());
                let responses = match &packet {
                    Outgoing::GetTestStringRequest => {
                        vec![Incoming::GetTestStringResponse("test".into())]
                    }
                    Outgoing::ReadRegisterDataRequest(index) => {
                        vec![Incoming::ReadRegisterDataResponse(Register::new(
                            *index, 0x200,
                        ))]
                    }
                    Outgoing::GetCalibrationInformationRequest { .. } => {
                        let cal = || Incoming::GetCalibrationInformationResponse {
                            white_calibration_table: white_calibration_table.clone(),
                            black_calibration_table: black_calibration_table.clone(),
                        };
                        // One request, two responses (front and back sensors)
                        vec![cal(), cal()]
                    }
                    _ => vec![],
                };
                for response in responses {
                    let _ = mock_responses_tx.send(response);
                }
                let _ = outgoing_tx.send(packet);
            }
        });

        let client =
            Client::from_scanner(Scanner::mock(host_to_scanner_tx, responses_rx, events_rx));

        (
            client,
            ConnectedTestHarness {
                outgoing_rx,
                _responses_tx: responses_tx,
                events_tx,
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
                json!({"response": "error", "code": "other", "message": "JSON error: expected ident at line 1 column 2"})
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
                        .events_tx
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
                        .events_tx
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

                    // The rejection must not disarm the guard: a second
                    // command during the same scan is also rejected.
                    let msg = send_command(
                        &mut stdin_write,
                        &mut output_rx,
                        r#"{"command":"getScannerStatus"}"#,
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
                    while harness.outgoing_rx.try_recv().is_ok() {}

                    harness.events_tx.send(Ok(Incoming::EndScanEvent)).unwrap();
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
        let packet = timeout(TEST_TIMEOUT, harness.outgoing_rx.recv())
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
                        .events_tx
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
                        .events_tx
                        .send(Err(pdi_scanner::Error::RecvTimeout))
                        .unwrap();
                    drop(harness.events_tx);
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
    async fn disconnect_during_scan_clears_scan_in_progress() {
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

                    // Start a scan, then disconnect the scanner mid-scan (no
                    // event is emitted on this path).
                    harness
                        .events_tx
                        .send(Ok(Incoming::BeginScanEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg, json!({"event": "scanStart"}));
                    drop(harness.events_tx);

                    // Commands must report the disconnection, not get stuck
                    // behind a scan that will never finish. The event loop
                    // may serve a command before it observes the closed
                    // channel, in which case the scan guard still rejects it;
                    // it must never wedge on scanInProgress forever.
                    let mut attempts = 0;
                    loop {
                        let msg = send_command(
                            &mut stdin_write,
                            &mut output_rx,
                            r#"{"command":"getScannerStatus"}"#,
                        )
                        .await;
                        if msg
                            == json!({"response": "error", "code": "disconnected", "message": null})
                        {
                            break;
                        }
                        assert_eq!(
                            msg,
                            json!({"response": "error", "code": "scanInProgress", "message": null})
                        );
                        attempts += 1;
                        assert!(attempts < 10, "never observed the disconnection");
                    }

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
        // Keep the command receiver alive but never ack any writes, so init
        // times out.
        let (host_to_scanner_tx, _host_to_scanner_rx) = mpsc::unbounded_channel();
        let (_responses_tx, responses_rx) = mpsc::unbounded_channel();
        let (_events_tx, events_rx) = mpsc::unbounded_channel();

        let client =
            Client::from_scanner(Scanner::mock(host_to_scanner_tx, responses_rx, events_rx));
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
                    while harness.outgoing_rx.try_recv().is_ok() {}

                    harness
                        .events_tx
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
                        .events_tx
                        .send(Ok(Incoming::ImageData(ImageData(data))))
                        .unwrap();

                    harness.events_tx.send(Ok(Incoming::EndScanEvent)).unwrap();
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

    const REPLAY_STEP_TIMEOUT: Duration = Duration::from_secs(10);
    const REPLAY_TOTAL_TIMEOUT: Duration = Duration::from_secs(60);

    /// Replays a recorded pdictl session (see the `recording` module) in
    /// lockstep against the command loop: inputs (stdin commands, scanner
    /// packets) are fed back in recorded order, and outputs (outgoing packets,
    /// stdout frames) are awaited and asserted to match the recording.
    #[allow(clippy::too_many_lines)]
    async fn replay_recording(entries: &[Entry]) {
        let (host_to_scanner_tx, host_to_scanner_rx) = mpsc::unbounded_channel();
        let (responses_tx, responses_rx) = mpsc::unbounded_channel();
        let (events_tx, events_rx) = mpsc::unbounded_channel();
        let client =
            Client::from_scanner(Scanner::mock(host_to_scanner_tx, responses_rx, events_rx));
        let mut client_slot = Some(client);
        // Held as Options so a ScannerTaskEnded entry can drop them all,
        // mimicking the real USB task shutting down.
        let mut host_to_scanner_rx = Some(host_to_scanner_rx);
        let mut responses_tx = Some(responses_tx);
        let mut events_tx = Some(events_tx);

        let (stdin_read, mut stdin_write) = tokio::io::duplex(1 << 16);
        let (frame_writer, mut frame_rx) = RawFrameChannelWriter::new();

        let (result, ()) = timeout(REPLAY_TOTAL_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), frame_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    for (index, entry) in entries.iter().enumerate() {
                        match entry {
                            Entry::Meta { version } => {
                                assert_eq!(
                                    *version,
                                    recording::FORMAT_VERSION,
                                    "unsupported recording version"
                                );
                            }
                            Entry::StdinCommand { line } => {
                                stdin_write.write_all(line.as_bytes()).await.unwrap();
                                stdin_write.write_all(b"\n").await.unwrap();
                            }
                            Entry::ScannerToHost {
                                endpoint,
                                data_base64,
                            } => {
                                let data = recording::decode_base64(data_base64).unwrap();
                                let packet = match endpoint {
                                    Endpoint::ImageData => Incoming::ImageData(ImageData(data)),
                                    Endpoint::Primary => {
                                        let (remaining, packet) = parsers::any_incoming(&data)
                                            .unwrap_or_else(|e| {
                                                panic!(
                                                    "entry {index}: failed to parse primary packet: {e}"
                                                )
                                            });
                                        assert!(
                                            remaining.is_empty(),
                                            "entry {index}: trailing bytes after primary packet"
                                        );
                                        packet
                                    }
                                };
                                // Route by classification, mirroring the USB
                                // task.
                                if matches!(packet.message_type(), IncomingType::Response) {
                                    responses_tx
                                        .as_ref()
                                        .expect("scanner task already ended")
                                        .send(packet)
                                        .unwrap();
                                } else {
                                    events_tx
                                        .as_ref()
                                        .expect("scanner task already ended")
                                        .send(Ok(packet))
                                        .unwrap();
                                }
                            }
                            Entry::ScannerToHostError { disconnected, .. } => {
                                // The exact recorded error isn't reconstructible;
                                // use representative errors that map to the same
                                // stdout error code (the message is compared
                                // leniently below).
                                let error = if *disconnected {
                                    pdi_scanner::Error::Usb {
                                        source: pdi_scanner::UsbError::NusbTransfer(
                                            nusb::transfer::TransferError::Disconnected,
                                        ),
                                        trace: std::backtrace::Backtrace::capture(),
                                    }
                                } else {
                                    pdi_scanner::Error::RecvTimeout
                                };
                                events_tx
                                    .as_ref()
                                    .expect("scanner task already ended")
                                    .send(Err(error))
                                    .unwrap();
                            }
                            Entry::ScannerTaskEnded => {
                                events_tx.take();
                                responses_tx.take();
                                host_to_scanner_rx.take();
                            }
                            Entry::HostToScanner { data_base64 } => {
                                let expected = recording::decode_base64(data_base64).unwrap();
                                let (packet, ack) = timeout(
                                    REPLAY_STEP_TIMEOUT,
                                    host_to_scanner_rx
                                        .as_mut()
                                        .expect("scanner task already ended")
                                        .recv(),
                                )
                                .await
                                .unwrap_or_else(|_| {
                                    panic!("entry {index}: timed out waiting for outgoing packet")
                                })
                                .expect("outgoing packet channel closed");
                                assert_eq!(
                                    packet.to_bytes(),
                                    expected,
                                    "entry {index}: outgoing packet mismatch: {packet:?}"
                                );
                                let _ = ack.send(());
                            }
                            Entry::StdoutFrame {
                                frame_type,
                                payload,
                            } => {
                                let (actual_type, actual_payload) =
                                    timeout(REPLAY_STEP_TIMEOUT, frame_rx.recv())
                                        .await
                                        .unwrap_or_else(|_| {
                                            panic!(
                                                "entry {index}: timed out waiting for stdout frame"
                                            )
                                        })
                                        .expect("stdout frame channel closed");
                                assert_eq!(
                                    actual_type, *frame_type,
                                    "entry {index}: stdout frame type mismatch"
                                );
                                assert_frame_payload_matches(payload, &actual_payload, index);
                            }
                        }
                    }
                    // Close stdin in case the recorded session ended by EOF
                    // rather than an exit command.
                    drop(stdin_write);
                }
            )
        })
        .await
        .expect("replay timed out");
        result.unwrap();
        assert!(
            frame_rx.try_recv().is_err(),
            "unexpected extra stdout frames after replay"
        );
    }

    fn assert_frame_payload_matches(expected: &FramePayload, actual: &[u8], index: usize) {
        if expected.matches(actual) {
            return;
        }
        // Errors reconstructed during replay can differ from the recorded
        // originals in message text only, so accept error frames that differ
        // only in their "message" field.
        if let FramePayload::Full { payload_base64 } = expected {
            let expected_bytes = recording::decode_base64(payload_base64).unwrap();
            let parsed = (
                serde_json::from_slice::<Value>(&expected_bytes),
                serde_json::from_slice::<Value>(actual),
            );
            if let (Ok(Value::Object(mut expected_json)), Ok(Value::Object(mut actual_json))) =
                parsed
                && expected_json.contains_key("code")
            {
                expected_json.remove("message");
                actual_json.remove("message");
                if expected_json == actual_json {
                    return;
                }
            }
            panic!(
                "entry {index}: stdout frame payload mismatch:\n  expected: {}\n  actual: {}",
                String::from_utf8_lossy(&expected_bytes),
                String::from_utf8_lossy(actual),
            );
        }
        panic!(
            "entry {index}: stdout frame payload mismatch: expected {expected:?}, actual {} bytes",
            actual.len()
        );
    }

    /// Deterministic low-entropy filler for synthetic image data: alternating
    /// light/dark bytes (so the duplex de-interleave produces distinct top and
    /// bottom images) with a value that drifts every image row (so row order
    /// matters), compressing to almost nothing. `offset` is the byte's
    /// position in the session's concatenated image stream.
    fn synthetic_image_byte(offset: u64) -> u8 {
        const DUPLEX_ROW_BYTES: u64 = 2 * DEFAULT_IMAGE_WIDTH as u64;
        let row = offset / DUPLEX_ROW_BYTES;
        let base = if offset.is_multiple_of(2) { 0x30 } else { 0xA0 };
        base + u8::try_from(row % 48).unwrap()
    }

    /// Rewrites a recording so it can be committed at negligible compressed
    /// size: image data chunk contents are replaced with [`synthetic_image_byte`]
    /// filler (chunk lengths preserved exactly), and the recording's expected
    /// outputs are regenerated by running the rewritten inputs through the
    /// command loop. Everything except pixel content — commands, packet bytes,
    /// chunk boundaries, event order, timestamps — is preserved verbatim, and
    /// JSON outputs are asserted to be unaffected by the substitution.
    #[allow(clippy::too_many_lines)]
    async fn synthesize_recording(records: &[Record]) -> Vec<Record> {
        let (host_to_scanner_tx, host_to_scanner_rx) = mpsc::unbounded_channel();
        let (responses_tx, responses_rx) = mpsc::unbounded_channel();
        let (events_tx, events_rx) = mpsc::unbounded_channel();
        let client =
            Client::from_scanner(Scanner::mock(host_to_scanner_tx, responses_rx, events_rx));
        let mut client_slot = Some(client);
        let mut host_to_scanner_rx = Some(host_to_scanner_rx);
        let mut responses_tx = Some(responses_tx);
        let mut events_tx = Some(events_tx);

        let (stdin_read, mut stdin_write) = tokio::io::duplex(1 << 16);
        let (frame_writer, mut frame_rx) = RawFrameChannelWriter::new();

        let mut out = Vec::with_capacity(records.len());
        let mut image_stream_offset = 0u64;

        let (result, ()) = timeout(REPLAY_TOTAL_TIMEOUT, async {
            tokio::join!(
                handle_commands_and_events(BufReader::new(stdin_read), frame_writer, || {
                    Ok(client_slot.take().expect("connect called more than once"))
                }),
                async {
                    for (index, record) in records.iter().enumerate() {
                        let timestamp_ms = record.timestamp_ms;
                        match &record.entry {
                            Entry::Meta { version } => {
                                assert_eq!(
                                    *version,
                                    recording::FORMAT_VERSION,
                                    "unsupported recording version"
                                );
                                out.push(record.clone());
                            }
                            Entry::StdinCommand { line } => {
                                stdin_write.write_all(line.as_bytes()).await.unwrap();
                                stdin_write.write_all(b"\n").await.unwrap();
                                out.push(record.clone());
                            }
                            Entry::ScannerToHost {
                                endpoint: Endpoint::ImageData,
                                data_base64,
                            } => {
                                let original = recording::decode_base64(data_base64).unwrap();
                                let synthetic: Vec<u8> = (0..original.len() as u64)
                                    .map(|i| synthetic_image_byte(image_stream_offset + i))
                                    .collect();
                                image_stream_offset += original.len() as u64;
                                events_tx
                                    .as_ref()
                                    .expect("scanner task already ended")
                                    .send(Ok(Incoming::ImageData(ImageData(synthetic.clone()))))
                                    .unwrap();
                                out.push(Record {
                                    timestamp_ms,
                                    entry: Entry::scanner_to_host(Endpoint::ImageData, &synthetic),
                                });
                            }
                            Entry::ScannerToHost {
                                endpoint: Endpoint::Primary,
                                data_base64,
                            } => {
                                let data = recording::decode_base64(data_base64).unwrap();
                                let (remaining, packet) = parsers::any_incoming(&data)
                                    .unwrap_or_else(|e| {
                                        panic!("entry {index}: failed to parse primary packet: {e}")
                                    });
                                assert!(
                                    remaining.is_empty(),
                                    "entry {index}: trailing bytes after primary packet"
                                );
                                if matches!(packet.message_type(), IncomingType::Response) {
                                    responses_tx
                                        .as_ref()
                                        .expect("scanner task already ended")
                                        .send(packet)
                                        .unwrap();
                                } else {
                                    events_tx
                                        .as_ref()
                                        .expect("scanner task already ended")
                                        .send(Ok(packet))
                                        .unwrap();
                                }
                                out.push(record.clone());
                            }
                            Entry::ScannerToHostError { disconnected, .. } => {
                                let error = if *disconnected {
                                    pdi_scanner::Error::Usb {
                                        source: pdi_scanner::UsbError::NusbTransfer(
                                            nusb::transfer::TransferError::Disconnected,
                                        ),
                                        trace: std::backtrace::Backtrace::capture(),
                                    }
                                } else {
                                    pdi_scanner::Error::RecvTimeout
                                };
                                events_tx
                                    .as_ref()
                                    .expect("scanner task already ended")
                                    .send(Err(error))
                                    .unwrap();
                                out.push(record.clone());
                            }
                            Entry::ScannerTaskEnded => {
                                events_tx.take();
                                responses_tx.take();
                                host_to_scanner_rx.take();
                                out.push(record.clone());
                            }
                            Entry::HostToScanner { data_base64 } => {
                                let expected = recording::decode_base64(data_base64).unwrap();
                                let (packet, ack) = timeout(
                                    REPLAY_STEP_TIMEOUT,
                                    host_to_scanner_rx
                                        .as_mut()
                                        .expect("scanner task already ended")
                                        .recv(),
                                )
                                .await
                                .unwrap_or_else(|_| {
                                    panic!("entry {index}: timed out waiting for outgoing packet")
                                })
                                .expect("outgoing packet channel closed");
                                // Outgoing traffic must not depend on pixel
                                // content, so the packet must match the
                                // original byte for byte.
                                assert_eq!(
                                    packet.to_bytes(),
                                    expected,
                                    "entry {index}: outgoing packet mismatch: {packet:?}"
                                );
                                let _ = ack.send(());
                                out.push(record.clone());
                            }
                            Entry::StdoutFrame {
                                frame_type,
                                payload,
                            } => {
                                let (actual_type, actual_payload) =
                                    timeout(REPLAY_STEP_TIMEOUT, frame_rx.recv())
                                        .await
                                        .unwrap_or_else(|_| {
                                            panic!(
                                                "entry {index}: timed out waiting for stdout frame"
                                            )
                                        })
                                        .expect("stdout frame channel closed");
                                assert_eq!(
                                    actual_type, *frame_type,
                                    "entry {index}: stdout frame type mismatch"
                                );
                                // Only scan frames may change (their payload
                                // is decoded pixels); JSON frames must match
                                // the original, modulo reconstructed error
                                // messages.
                                if actual_type == super::FRAME_TYPE_JSON {
                                    assert_frame_payload_matches(payload, &actual_payload, index);
                                }
                                out.push(Record {
                                    timestamp_ms,
                                    entry: Entry::stdout_frame(actual_type, &actual_payload),
                                });
                            }
                        }
                    }
                    drop(stdin_write);
                }
            )
        })
        .await
        .expect("synthesis timed out");
        result.unwrap();
        assert!(
            frame_rx.try_recv().is_err(),
            "unexpected extra stdout frames after synthesis"
        );
        out
    }

    /// Rewrites every full-fidelity `.jsonl` recording in the fixtures
    /// directory as a committable `.synth.jsonl.gz` fixture (see
    /// [`synthesize_recording`]). Run explicitly after recording new sessions:
    ///
    /// ```sh
    /// cargo test regenerate_synthetic_fixtures -- --ignored
    /// ```
    #[ignore = "regenerates synthetic fixtures from local full-fidelity recordings"]
    #[tokio::test]
    async fn regenerate_synthetic_fixtures() {
        for path in recorded_fixture_paths() {
            if path.extension().is_some_and(|extension| extension == "gz") {
                continue;
            }
            let output = path.with_extension("synth.jsonl.gz");
            let records = recording::read_records(&path).unwrap();
            let synthesized = synthesize_recording(&records).await;
            recording::write_records(&output, &synthesized).unwrap();
            eprintln!("synthesized {} -> {}", path.display(), output.display());
        }
    }

    /// Paths of the recordings to replay: `.jsonl` files (full-fidelity local
    /// recordings) and `.jsonl.gz` files (committed synthetic fixtures) in the
    /// fixtures directory, or in `PDICTL_RECORDINGS_DIR` when set.
    // Recording paths are produced by our own tooling, so a case-sensitive
    // suffix check is correct.
    #[allow(clippy::case_sensitive_file_extension_comparisons)]
    fn recorded_fixture_paths() -> Vec<PathBuf> {
        let dir = std::env::var_os("PDICTL_RECORDINGS_DIR")
            .map_or_else(|| PathBuf::from("fixtures/recordings"), PathBuf::from);
        let Ok(dir_entries) = std::fs::read_dir(&dir) else {
            return Vec::new();
        };
        let mut paths: Vec<_> = dir_entries
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name.ends_with(".jsonl") || name.ends_with(".jsonl.gz"))
            })
            .collect();
        paths.sort();
        paths
    }

    /// Replays recordings captured from a real scanner and committed synthetic
    /// fixtures (see `fixtures/recordings/README.md`). Passes trivially when
    /// no recordings are present.
    #[tokio::test]
    async fn replay_recorded_fixtures() {
        for path in recorded_fixture_paths() {
            eprintln!("replaying {}", path.display());
            let entries = recording::read(&path).unwrap();
            replay_recording(&entries).await;
        }
    }

    #[tokio::test]
    async fn replay_synthetic_disconnected_session() {
        replay_recording(&[
            Entry::Meta {
                version: recording::FORMAT_VERSION,
            },
            Entry::StdinCommand {
                line: r#"{"command":"getScannerStatus"}"#.to_owned(),
            },
            Entry::stdout_frame(
                super::FRAME_TYPE_JSON,
                br#"{"response":"error","code":"disconnected","message":null}"#,
            ),
            Entry::StdinCommand {
                line: r#"{"command":"exit"}"#.to_owned(),
            },
        ])
        .await;
    }

    /// Builds a `ScannerToHost` primary-endpoint entry from raw packet bytes,
    /// verifying that they parse to the expected packet so a mistake in the
    /// crafted bytes fails here rather than confusing the replay.
    fn primary_packet(bytes: &[u8], expected: &Incoming) -> Entry {
        let (remaining, parsed) = parsers::any_incoming(bytes)
            .unwrap_or_else(|e| panic!("crafted packet failed to parse: {e} ({bytes:?})"));
        assert!(remaining.is_empty(), "crafted packet has trailing bytes");
        assert_eq!(&parsed, expected, "crafted packet parsed unexpectedly");
        Entry::scanner_to_host(Endpoint::Primary, bytes)
    }

    /// Builds raw bytes for a `GetCalibrationInformationResponse`.
    fn calibration_response(side: u8, white: &[u8], black: &[u8]) -> Vec<u8> {
        assert_eq!(white.len(), black.len());
        let mut bytes = vec![0x02, b'W'];
        bytes.extend_from_slice(&u16::try_from(white.len()).unwrap().to_le_bytes());
        // High nibble: side (0 = top, 1 = bottom); low nibble: bits per pixel.
        bytes.push((side << 4) | 0x08);
        bytes.extend_from_slice(white);
        bytes.extend_from_slice(&[0, 0]); // white table checksum (ignored)
        bytes.extend_from_slice(black);
        bytes.extend_from_slice(&[0, 0]); // black table checksum (ignored)
        bytes.push(0x03);
        bytes
    }

    #[tokio::test]
    async fn replay_synthetic_connected_scan_session() {
        const WIDTH: usize = DEFAULT_IMAGE_WIDTH as usize;
        const HEIGHT: usize = 4;
        const TOP_PIXEL: u8 = 7;
        const BOTTOM_PIXEL: u8 = 9;

        // White = 255 and black = 0 make image calibration the identity
        // function.
        let white = vec![u8::MAX; WIDTH];
        let black = vec![0u8; WIDTH];
        let register_9 = RegisterIndex::new(9).unwrap();

        let mut interleaved = Vec::with_capacity(2 * WIDTH * HEIGHT);
        for _ in 0..(WIDTH * HEIGHT) {
            interleaved.push(TOP_PIXEL);
            interleaved.push(BOTTOM_PIXEL);
        }

        let mut scan_complete_payload = Vec::new();
        for pixel in [TOP_PIXEL, BOTTOM_PIXEL] {
            scan_complete_payload.extend_from_slice(&u32::try_from(WIDTH).unwrap().to_le_bytes());
            scan_complete_payload.extend_from_slice(&u32::try_from(HEIGHT).unwrap().to_le_bytes());
            scan_complete_payload.extend_from_slice(&vec![pixel; WIDTH * HEIGHT]);
        }

        let outgoing = |packet: &Outgoing| Entry::host_to_scanner(&packet.to_bytes());
        let calibration_incoming = || Incoming::GetCalibrationInformationResponse {
            white_calibration_table: white.clone(),
            black_calibration_table: black.clone(),
        };

        let entries = vec![
            Entry::Meta {
                version: recording::FORMAT_VERSION,
            },
            Entry::StdinCommand {
                line: r#"{"command":"connect"}"#.to_owned(),
            },
            // wait_until_ready: enable CRC checking, then a test command
            outgoing(&Outgoing::EnableCrcCheckingRequest),
            outgoing(&Outgoing::GetTestStringRequest),
            primary_packet(
                b"\x02D\x03",
                &Incoming::GetTestStringResponse(String::new()),
            ),
            // initialize_scanning: disable feeder, read the boot eject
            // register (0x200 = no eject, so no write follows), then fetch
            // the image calibration tables (one request, two responses)
            outgoing(&Outgoing::DisableFeederRequest),
            outgoing(&Outgoing::ReadRegisterDataRequest(register_9)),
            primary_packet(
                b"\x02<00900000200\x03",
                &Incoming::ReadRegisterDataResponse(Register::new(register_9, 0x200)),
            ),
            // The resolution must match client::DEFAULT_RESOLUTION.
            outgoing(&Outgoing::GetCalibrationInformationRequest {
                resolution: Some(Resolution::Half),
            }),
            primary_packet(
                &calibration_response(0, &white, &black),
                &calibration_incoming(),
            ),
            primary_packet(
                &calibration_response(1, &white, &black),
                &calibration_incoming(),
            ),
            Entry::stdout_frame(super::FRAME_TYPE_JSON, br#"{"response":"ok"}"#),
            // A scan: begin event, image data, end event (which triggers a
            // feeder disable before the decoded images are emitted)
            primary_packet(b"\x02#30\x03", &Incoming::BeginScanEvent),
            Entry::stdout_frame(super::FRAME_TYPE_JSON, br#"{"event":"scanStart"}"#),
            Entry::scanner_to_host(Endpoint::ImageData, &interleaved),
            primary_packet(b"\x02#31\x03", &Incoming::EndScanEvent),
            outgoing(&Outgoing::DisableFeederRequest),
            Entry::stdout_frame(super::FRAME_TYPE_SCAN_COMPLETE, &scan_complete_payload),
            Entry::StdinCommand {
                line: r#"{"command":"exit"}"#.to_owned(),
            },
        ];

        replay_recording(&entries).await;
    }

    /// The USB task polls the image data endpoint ahead of the primary
    /// endpoint, so image chunks can be forwarded before the begin scan event
    /// that physically preceded them. They must still end up in the decoded
    /// scan.
    #[tokio::test]
    async fn image_data_arriving_before_begin_scan_event_is_not_dropped() {
        use pdi_scanner::protocol::image::DEFAULT_IMAGE_WIDTH;

        const WIDTH: usize = DEFAULT_IMAGE_WIDTH as usize;
        const HEIGHT: usize = 4;

        let (client, harness) =
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

                    let mut data = Vec::with_capacity(2 * WIDTH * HEIGHT);
                    for _ in 0..(WIDTH * HEIGHT) {
                        data.push(7);
                        data.push(9);
                    }
                    let (first_chunk, rest) = data.split_at(2 * WIDTH);

                    // The first chunk beats the begin scan event
                    harness
                        .events_tx
                        .send(Ok(Incoming::ImageData(ImageData(first_chunk.to_vec()))))
                        .unwrap();
                    harness
                        .events_tx
                        .send(Ok(Incoming::BeginScanEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg, json!({"event": "scanStart"}));

                    harness
                        .events_tx
                        .send(Ok(Incoming::ImageData(ImageData(rest.to_vec()))))
                        .unwrap();
                    harness.events_tx.send(Ok(Incoming::EndScanEvent)).unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg["event"], "scanComplete");
                    assert_eq!(msg["images"][0]["height"], HEIGHT);
                    assert_eq!(msg["images"][1]["height"], HEIGHT);

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
                    while harness.outgoing_rx.try_recv().is_ok() {}

                    // Start a scan
                    harness
                        .events_tx
                        .send(Ok(Incoming::BeginScanEvent))
                        .unwrap();
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg, json!({"event": "scanStart"}));

                    // End the scan
                    harness.events_tx.send(Ok(Incoming::EndScanEvent)).unwrap();
                    // Wait for scanFailed event (image decode fails on empty data)
                    let msg = recv_output(&mut output_rx).await;
                    assert_eq!(msg["event"], "error");
                    assert_eq!(msg["code"], "scanFailed");

                    // Now a command should succeed (not get scanInProgress)
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
