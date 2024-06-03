use clap::Parser;
use image::EncodableLayout;
use std::{
    cell::Cell,
    io::{self, Write},
    sync::mpsc,
    time::Duration,
};
use tracing_subscriber::prelude::*;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use pdi_scanner::{
    client::{Client, DoubleFeedDetectionCalibrationConfig},
    connect,
    protocol::{
        image::{RawImageData, Sheet, DEFAULT_IMAGE_WIDTH},
        packets::Incoming,
        types::{
            DoubleFeedDetectionCalibrationType, DoubleFeedDetectionMode, EjectMotion, FeederMode,
            ScanSideMode, Status,
        },
    },
    rusb_async,
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

    ScanComplete {
        image_data: (String, String),
    },

    CoverOpen,
    CoverClosed,

    EjectPaused,
    EjectResumed,

    DoubleFeedCalibrationComplete,
    DoubleFeedCalibrationTimedOut,
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
        Error::Usb(UsbError::Rusb(rusb::Error::NotFound))
        | Error::Usb(UsbError::Rusb(rusb::Error::Io))
        | Error::Usb(UsbError::RusbAsync(rusb_async::Error::Stall)) => {
            (ErrorCode::Disconnected, None)
        }

        _ => (ErrorCode::Other, Some(error.to_string())),
    }
}

fn main() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    // Listen for commands from stdin in a child thread, since reading from
    // stdin is blocking.
    let (stdin_tx, stdin_rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || loop {
        let mut buffer = String::new();
        match io::stdin().read_line(&mut buffer) {
            Ok(_) => {
                let command = serde_json::from_str::<Command>(&buffer).unwrap();
                stdin_tx.send(command).unwrap();
            }

            Err(e) => {
                tracing::error!("failed to read from stdin: {e:?}");
            }
        }
    });

    let mut client: Option<Client<Scanner>> = None;
    let mut raw_image_data = RawImageData::new();

    // We reject sending a command while a scan is in progress because it will
    // interrupt the scan. To ensure this flag gets reset whenever a scan stops
    // (whether successfully or with an error or disconnection), we manage this
    // flag in the send_response/send_event functions, since they are called in
    // basically every case when the scanner state changes.
    let scan_in_progress = Cell::new(false);

    let send_response = |response: Response| -> color_eyre::Result<()> {
        scan_in_progress.replace(false);
        send_to_stdout(Message::Response(response))
    };

    let send_event = |event: Event| -> color_eyre::Result<()> {
        scan_in_progress.replace(matches!(event, Event::ScanStart));
        send_to_stdout(Message::Event(event))
    };

    let send_error_response = |error: &Error| -> color_eyre::Result<()> {
        let (code, message) = error_to_code_and_message(error);
        send_response(Response::Error { code, message })
    };

    let send_error_event = |error: &Error| -> color_eyre::Result<()> {
        let (code, message) = error_to_code_and_message(error);
        send_event(Event::Error { code, message })
    };

    // Main loop:
    // - Process any commands received on stdin. Note that our command
    // processing is blocking, so we are guaranteed to only process one command
    // at a time. Additional commands will be queued up in the channel.
    // - Process any events or image data received from the scanner. These could
    // be sent by the scanner at any time.
    loop {
        match stdin_rx.try_recv() {
            Ok(command) => {
                if matches!(command, Command::Exit) {
                    return color_eyre::Result::Ok(());
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
                            match c.send_initial_commands_after_connect(Duration::from_millis(500))
                            {
                                Ok(()) => {
                                    send_response(Response::Ok)?;
                                }
                                // Sometimes, after closing the previous scanner
                                // connection, a new connection will time out during
                                // these first commands. Until we get to the bottom
                                // of why that's happening, we just retry once,
                                // which seems to resolve it.
                                Err(_) => match c
                                    .send_initial_commands_after_connect(Duration::from_secs(3))
                                {
                                    Ok(()) => send_response(Response::Ok)?,
                                    Err(e) => send_error_response(&e)?,
                                },
                            }
                            client = Some(c);
                        }
                        Err(e) => send_error_response(&e)?,
                    },
                    (Some(_), Command::Disconnect) => {
                        client = None;
                        send_response(Response::Ok)?;
                    }
                    (Some(client), Command::GetScannerStatus) => {
                        // We use a long-ish timeout here because the scanner
                        // may sometimes be delayed in sending a response (e.g.
                        // if its busy ejecting a long sheet of paper).
                        match client.get_scanner_status(Duration::from_secs(2)) {
                            Ok(status) => send_response(Response::ScannerStatus { status })?,
                            Err(e) => send_error_response(&e)?,
                        }
                    }
                    (
                        Some(client),
                        Command::EnableScanning {
                            double_feed_detection_enabled,
                            paper_length_inches,
                        },
                    ) => {
                        let double_feed_detection_mode = if double_feed_detection_enabled {
                            DoubleFeedDetectionMode::RejectDoubleFeeds
                        } else {
                            DoubleFeedDetectionMode::Disabled
                        };
                        match client.send_enable_scan_commands(
                            double_feed_detection_mode,
                            paper_length_inches,
                        ) {
                            Ok(()) => send_response(Response::Ok)?,
                            Err(e) => send_error_response(&e)?,
                        }
                    }
                    (Some(client), Command::DisableScanning) => {
                        match client.set_feeder_mode(FeederMode::Disabled) {
                            Ok(()) => send_response(Response::Ok)?,
                            Err(e) => send_error_response(&e)?,
                        }
                    }
                    (Some(client), Command::EjectDocument { eject_motion }) => {
                        match client.eject_document(eject_motion) {
                            Ok(()) => send_response(Response::Ok)?,
                            Err(e) => send_error_response(&e)?,
                        }
                    }
                    (Some(client), Command::CalibrateDoubleFeedDetection { calibration_type }) => {
                        match client.calibrate_double_feed_detection(calibration_type) {
                            Ok(()) => send_response(Response::Ok)?,
                            Err(e) => send_error_response(&e)?,
                        }
                    }
                    (Some(client), Command::GetDoubleFeedDetectionCalibrationConfig) => {
                        match client
                            .get_double_feed_detection_calibration_config(Duration::from_secs(1))
                        {
                            Ok(config) => {
                                send_response(Response::DoubleFeedDetectionCalibrationConfig {
                                    config,
                                })?
                            }
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
            Err(std::sync::mpsc::TryRecvError::Empty) => {}
            Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                tracing::error!("stdin channel disconnected");
                return color_eyre::Result::Err(color_eyre::Report::msg(
                    "stdin channel disconnected",
                ));
            }
        }

        if let Some(c) = &mut client {
            match c.try_recv_matching(Incoming::is_event) {
                Ok(Incoming::BeginScanEvent) => {
                    raw_image_data = RawImageData::new();
                    send_event(Event::ScanStart)?;
                }
                Ok(Incoming::EndScanEvent) => {
                    match raw_image_data.try_decode_scan(DEFAULT_IMAGE_WIDTH, ScanSideMode::Duplex)
                    {
                        Ok(Sheet::Duplex(top, bottom)) => {
                            match (top.to_image(), bottom.to_image()) {
                                (Some(top_image), Some(bottom_image)) => {
                                    send_event(Event::ScanComplete {
                                        image_data: (
                                            STANDARD.encode(top_image.as_bytes()),
                                            STANDARD.encode(bottom_image.as_bytes()),
                                        ),
                                    })?;
                                }
                                (Some(_), None) => {
                                    send_event(Event::Error {
                                        code: ErrorCode::ScanFailed,
                                        message: Some("failed to decode bottom image".to_owned()),
                                    })?;
                                }
                                (None, Some(_)) => {
                                    send_event(Event::Error {
                                        code: ErrorCode::ScanFailed,
                                        message: Some("failed to decode top image".to_owned()),
                                    })?;
                                }
                                (None, None) => {
                                    send_event(Event::Error {
                                        code: ErrorCode::ScanFailed,
                                        message: Some(
                                            "failed to decode top and bottom images".to_owned(),
                                        ),
                                    })?;
                                }
                            }
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
                Ok(Incoming::CoverOpenEvent) => {
                    send_event(Event::CoverOpen)?;
                }
                Ok(Incoming::CoverClosedEvent) => {
                    send_event(Event::CoverClosed)?;
                }
                Ok(Incoming::DoubleFeedEvent) => {
                    send_event(Event::Error {
                        code: ErrorCode::DoubleFeedDetected,
                        message: None,
                    })?;
                }
                Ok(Incoming::EjectPauseEvent) => {
                    send_event(Event::EjectPaused)?;
                }
                Ok(Incoming::EjectResumeEvent) => {
                    send_event(Event::EjectResumed)?;
                }
                Ok(Incoming::DoubleFeedCalibrationCompleteEvent) => {
                    send_event(Event::DoubleFeedCalibrationComplete)?;
                }
                Ok(Incoming::DoubleFeedCalibrationTimedOutEvent) => {
                    send_event(Event::DoubleFeedCalibrationTimedOut)?;
                }
                Ok(event) => {
                    tracing::info!("unhandled event: {event:?}");
                }
                Err(Error::TryRecvError(mpsc::TryRecvError::Empty)) => {}
                Err(Error::TryRecvError(mpsc::TryRecvError::Disconnected)) => {
                    tracing::debug!("scanner channel disconnected");
                    client = None;
                }
                Err(e) => send_error_event(&e)?,
            }
        }

        if let Some(c) = &mut client {
            match c.try_recv_matching(|incoming| matches!(incoming, Incoming::ImageData(_))) {
                Ok(Incoming::ImageData(image_data)) => {
                    raw_image_data.extend_from_slice(&image_data);
                }
                Ok(_) => unreachable!(),
                Err(Error::TryRecvError(mpsc::TryRecvError::Empty)) => {}
                Err(Error::TryRecvError(mpsc::TryRecvError::Disconnected)) => {
                    tracing::debug!("scanner channel disconnected");
                    client = None;
                }
                Err(e) => send_error_event(&e)?,
            }
        }
    }
}
