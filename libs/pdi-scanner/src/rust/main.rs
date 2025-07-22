use clap::Parser;
use color_eyre::eyre::bail;
use image::EncodableLayout;
use std::{
    cell::Cell,
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

use base64::{engine::general_purpose::STANDARD, Engine as _};
use pdi_scanner::{
    client::{Client, DoubleFeedDetectionCalibrationConfig, ImageCalibrationTables},
    connect,
    protocol::{
        image::{RawImageData, Sheet, DEFAULT_IMAGE_WIDTH},
        packets::{Incoming, IncomingType},
        types::{
            ClampedPercentage, DoubleFeedDetectionCalibrationType, DoubleFeedDetectionMode,
            EjectMotion, FeederMode, ScanSideMode, Status,
        },
    },
    scanner::Scanner,
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

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::builder()
                .with_default_directive(
                    format!(
                        "{}={}",
                        env!("CARGO_BIN_NAME").replace('-', "_"),
                        config.log_level
                    )
                    .parse()?,
                )
                .from_env_lossy(),
        )
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

    ScanComplete(ScanComplete),

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

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanComplete {
    image_data: (String, String),
}

impl Debug for ScanComplete {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ScanComplete")
            .field(
                "top",
                &format_args!("{}…", self.image_data.0.get(..20).unwrap_or("utf-8 error")),
            )
            .field(
                "bottom",
                &format_args!("{}…", self.image_data.1.get(..20).unwrap_or("utf-8 error")),
            )
            .finish()
    }
}

#[derive(Debug, serde::Serialize)]
#[serde(untagged)]
enum Message {
    Event(Event),
    Response(Response),
}

fn send_to_stdout(message: Message) -> color_eyre::Result<()> {
    serde_json::to_writer(io::stdout(), &message)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(b"\n")?;
    Ok(())
}

fn error_to_code_and_message(error: &Error) -> (ErrorCode, Option<String>) {
    match error {
        Error::Usb(UsbError::DeviceNotFound)
        | Error::Usb(UsbError::NusbTransfer(nusb::transfer::TransferError::Disconnected))
        | Error::Usb(UsbError::NusbTransfer(nusb::transfer::TransferError::Fault))
        | Error::Usb(UsbError::NusbTransfer(nusb::transfer::TransferError::Cancelled))
        | Error::Usb(UsbError::NusbTransfer(nusb::transfer::TransferError::Stall)) => {
            (ErrorCode::Disconnected, None)
        }

        _ => (ErrorCode::Other, Some(error.to_string())),
    }
}

#[tokio::main]
async fn main() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    let stdin = BufReader::new(tokio::io::stdin());
    let mut stdin_lines = stdin.lines();

    let mut client: Option<Client<Scanner>> = None;
    let mut image_calibration_tables: Option<ImageCalibrationTables> = None;
    let mut raw_image_data = RawImageData::new();

    // We reject sending a command while a scan is in progress because it will
    // interrupt the scan. To ensure this flag gets reset whenever a scan stops
    // (whether successfully or with an error or disconnection), we manage this
    // flag in the send_response/send_event functions, since they are called in
    // basically every case when the scanner state changes.
    let scan_in_progress = Cell::new(false);

    let send_response = |response: Response| -> color_eyre::Result<()> {
        tracing::debug!("sending response: {response:?}");
        scan_in_progress.replace(false);
        send_to_stdout(Message::Response(response))
    };

    let send_event = |event: Event| -> color_eyre::Result<()> {
        tracing::debug!("sending event: {event:?}");
        scan_in_progress.replace(matches!(event, Event::ScanStart));
        send_to_stdout(Message::Event(event))
    };

    let send_error_response = |error: &Error| -> color_eyre::Result<()> {
        tracing::error!("sending error: {error:?}");
        let (code, message) = error_to_code_and_message(error);
        send_response(Response::Error { code, message })
    };

    let send_error_event = |error: &Error| -> color_eyre::Result<()> {
        tracing::error!("sending error event: {error:?}");
        let (code, message) = error_to_code_and_message(error);
        send_event(Event::Error { code, message })
    };

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
                    Err(e) => send_error_response(&e.into())?,
                    Ok(command) => {
                        tracing::debug!("incoming command: {command:?}");
                        if matches!(command, Command::Exit) {
                            break;
                        }
                        if scan_in_progress.get() {
                            send_response(Response::Error {
                                code: ErrorCode::ScanInProgress,
                                message: None,
                            })?;
                            continue;
                        }
                        match (&mut client, command) {
                            (_, Command::Exit) => unreachable!(),
                            (Some(_), Command::Connect) => {
                                send_response(Response::Error {
                                    code: ErrorCode::AlreadyConnected,
                                    message: None,
                                })?;
                            }
                            (None, Command::Connect) => match connect() {
                                Ok(mut c) => {
                                    tracing::info!("connect() succeeded");
                                    match timeout(
                                        Duration::from_millis(500),
                                        c.send_initial_commands_after_connect(),
                                    )
                                    .await
                                    {
                                        Ok(Ok(calibration_tables)) => {
                                            image_calibration_tables = Some(calibration_tables);
                                            send_response(Response::Ok)?;
                                        }
                                        Ok(Err(e)) => send_error_response(&e)?,
                                        // Sometimes, after closing the previous scanner
                                        // connection, a new connection will time out during
                                        // these first commands. Until we get to the bottom
                                        // of why that's happening, we just retry once,
                                        // which seems to resolve it.
                                        Err(_) => match timeout(
                                            Duration::from_secs(3),
                                            c.send_initial_commands_after_connect(),
                                        )
                                        .await
                                        {
                                            Ok(Ok(calibration_tables)) => {
                                                image_calibration_tables = Some(calibration_tables);
                                                send_response(Response::Ok)?;
                                            }
                                            Ok(Err(e)) => send_error_response(&e)?,
                                            Err(_) => send_error_response(&Error::RecvTimeout)?,
                                        },
                                    }
                                    client = Some(c);
                                }
                                Err(e) => {
                                    tracing::info!("connect() failed");
                                    send_error_response(&e)?;
                                }
                            },
                            (Some(_), Command::Disconnect) => {
                                client = None;
                                send_response(Response::Ok)?;
                            }
                            (Some(client), Command::GetScannerStatus) => {
                                // We use a long-ish timeout here because the scanner
                                // may sometimes be delayed in sending a response (e.g.
                                // if its busy ejecting a long sheet of paper).
                                match timeout(Duration::from_secs(2), client.get_scanner_status()).await {
                                    Ok(Ok(status)) => send_response(Response::ScannerStatus { status })?,
                                    Ok(Err(e)) => send_error_response(&e)?,
                                    Err(_) => send_error_response(&Error::RecvTimeout)?,
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
                                    Ok(()) => send_response(Response::Ok)?,
                                    Err(e) => send_error_response(&e)?,
                                }
                            }
                            (Some(client), Command::DisableScanning) => {
                                match client.set_feeder_mode(FeederMode::Disabled).await {
                                    Ok(()) => send_response(Response::Ok)?,
                                    Err(e) => send_error_response(&e)?,
                                }
                            }
                            (Some(client), Command::EjectDocument { eject_motion }) => {
                                match client.eject_document(eject_motion).await {
                                    Ok(()) => send_response(Response::Ok)?,
                                    Err(e) => send_error_response(&e)?,
                                }
                            }
                            (Some(client), Command::CalibrateDoubleFeedDetection { calibration_type }) => {
                                match client
                                    .calibrate_double_feed_detection(calibration_type)
                                    .await
                                {
                                    Ok(()) => send_response(Response::Ok)?,
                                    Err(e) => send_error_response(&e)?,
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
                                        send_response(Response::DoubleFeedDetectionCalibrationConfig {
                                            config,
                                        })?
                                    }
                                    Ok(Err(e)) => send_error_response(&e)?,
                                    Err(_) => send_error_response(&Error::RecvTimeout)?,
                                }
                            }
                            (Some(client), Command::CalibrateImageSensors) => {
                                match client.calibrate_image_sensors().await {
                                    Ok(()) => send_response(Response::Ok)?,
                                    Err(e) => send_error_response(&e)?,
                                }
                            }
                            (None, _) => {
                                send_response(Response::Error {
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
                        send_error_event(&e)?;
                        continue;
                    },
                };

                match packet {
                    Incoming::BeginScanEvent => {
                        raw_image_data = RawImageData::new();
                        send_event(Event::ScanStart)?;
                    }
                    Incoming::ImageData(image_data) => {
                        raw_image_data.extend_from_slice(&image_data.0);
                    }
                    Incoming::EndScanEvent => {
                        match raw_image_data.try_decode_scan(
                            DEFAULT_IMAGE_WIDTH,
                            ScanSideMode::Duplex,
                            &image_calibration_tables
                                .clone()
                                .expect("image calibration tables not set"),
                        ) {
                            Ok(Sheet::Duplex(top, bottom)) => {
                                send_event(Event::ScanComplete(ScanComplete {
                                    image_data: (
                                        STANDARD.encode(top.as_bytes()),
                                        STANDARD.encode(bottom.as_bytes()),
                                    ),
                                }))?
                            }
                            Ok(_) => unreachable!(
                                "try_decode_scan called with {:?} returned non-duplex sheet",
                                ScanSideMode::Duplex
                            ),
                            Err(e) => {
                                send_event(Event::Error {
                                    code: ErrorCode::ScanFailed,
                                    message: Some(format!(
                                        "failed to decode the scanned image data: {e}"
                                    )),
                                })?;
                            }
                        }
                    }
                    Incoming::CoverOpenEvent => {
                        send_event(Event::CoverOpen)?;
                    }
                    Incoming::CoverClosedEvent => {
                        send_event(Event::CoverClosed)?;
                    }
                    Incoming::DoubleFeedEvent => {
                        send_event(Event::Error {
                            code: ErrorCode::DoubleFeedDetected,
                            message: None,
                        })?;
                    }
                    Incoming::EjectPauseEvent => {
                        send_event(Event::EjectPaused)?;
                    }
                    Incoming::EjectResumeEvent => {
                        send_event(Event::EjectResumed)?;
                    }
                    Incoming::DoubleFeedCalibrationCompleteEvent => {
                        send_event(Event::DoubleFeedCalibrationComplete)?;
                    }
                    Incoming::DoubleFeedCalibrationTimedOutEvent => {
                        send_event(Event::DoubleFeedCalibrationTimedOut)?;
                    }
                    Incoming::CalibrationOkEvent => {
                        send_event(Event::ImageSensorCalibrationComplete)?;
                    }
                    event if matches!(event.message_type(), IncomingType::CalibrationEvent) => {
                        send_event(Event::ImageSensorCalibrationFailed { error: event })?;
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
