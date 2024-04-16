use clap::Parser;
use image::EncodableLayout;
use std::{
    io::{self, Write},
    time::Duration,
};
use tracing_subscriber::prelude::*;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use pdi_scanner::{
    client::Client,
    connect,
    protocol::{
        image::{RawImageData, Sheet, DEFAULT_IMAGE_WIDTH},
        packets::Incoming,
        types::{
            DoubleFeedDetectionCalibrationType, DoubleFeedDetectionMode, EjectMotion, FeederMode,
            ScanSideMode, Status,
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
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum Command {
    Exit,

    Connect,

    Disconnect,

    GetScannerStatus,

    EnableScanning,

    DisableScanning,

    EjectDocument {
        eject_motion: EjectMotion,
    },

    EnableMsd {
        enable: bool,
    },

    CalibrateMsd {
        calibration_type: DoubleFeedDetectionCalibrationType,
    },

    GetMsdCalibrationConfig,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase")]
enum ErrorCode {
    Disconnected,
    AlreadyConnected,
    ScanFailed,
    Other,
}

#[derive(Debug, serde::Serialize)]
#[serde(
    tag = "type",
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

    ScanStart,

    ScanComplete {
        image_data: (String, String),
    },

    MsdCalibrationConfig {
        led_intensity: u16,
        single_sheet_calibration_value: u16,
        double_sheet_calibration_value: u16,
        threshold_value: u16,
    },
}

fn send_response(response: &Response) -> color_eyre::Result<()> {
    serde_json::to_writer(io::stdout(), response)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(b"\n")?;
    Ok(())
}

fn send_error(error: &Error) -> color_eyre::Result<()> {
    let coded_error = match error {
        Error::Usb(UsbError::Rusb(rusb::Error::NotFound))
        | Error::Usb(UsbError::Rusb(rusb::Error::Io)) => Response::Error {
            code: ErrorCode::Disconnected,
            message: None,
        },

        _ => Response::Error {
            code: ErrorCode::Other,
            message: Some(error.to_string()),
        },
    };
    send_response(&coded_error)
}

fn main() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    // Listen for commands from stdin in a child thread
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

    // Main loop:
    // - Process any commands received on stdin
    // - Process any events or image data received from the scanner
    loop {
        match stdin_rx.try_recv() {
            Ok(command) => match (&mut client, command) {
                (_, Command::Exit) => {
                    serde_json::to_writer(io::stdout(), &Response::Ok)?;
                    return color_eyre::Result::Ok(());
                }
                (Some(_), Command::Connect) => {
                    send_response(&Response::Error {
                        code: ErrorCode::AlreadyConnected,
                        message: None,
                    })?;
                }
                (None, Command::Connect) => match connect() {
                    Ok(mut c) => {
                        match c.send_initial_commands_after_connect(Duration::from_millis(500)) {
                            Ok(()) => {
                                send_response(&Response::Ok)?;
                            }
                            // Sometimes, after closing the previous scanner
                            // connection, a new connection will time out during
                            // these first commands. Until we get to the bottom
                            // of why that's happening, we just retry once,
                            // which seems to resolve it.
                            Err(_) => match c
                                .send_initial_commands_after_connect(Duration::from_secs(3))
                            {
                                Ok(()) => send_response(&Response::Ok)?,
                                Err(e) => send_error(&e)?,
                            },
                        }
                        client = Some(c);
                    }
                    Err(e) => send_error(&e)?,
                },
                (Some(_), Command::Disconnect) => {
                    client = None;
                    send_response(&Response::Ok)?;
                }
                (Some(client), Command::GetScannerStatus) => {
                    match client.get_scanner_status(Duration::from_secs(1)) {
                        Ok(status) => send_response(&Response::ScannerStatus { status })?,
                        Err(e) => send_error(&e)?,
                    }
                }
                (Some(client), Command::EnableScanning) => {
                    match client.send_enable_scan_commands() {
                        Ok(()) => send_response(&Response::Ok)?,
                        Err(e) => send_error(&e)?,
                    }
                }
                (Some(client), Command::DisableScanning) => {
                    match client.set_feeder_mode(FeederMode::Disabled) {
                        Ok(()) => send_response(&Response::Ok)?,
                        Err(e) => send_error(&e)?,
                    }
                }
                (Some(client), Command::EjectDocument { eject_motion }) => {
                    match client.eject_document(eject_motion) {
                        Ok(()) => send_response(&Response::Ok)?,
                        Err(e) => send_error(&e)?,
                    }
                }
                (Some(client), Command::EnableMsd { enable }) => {
                    match client.set_double_feed_detection_mode(if enable {
                        DoubleFeedDetectionMode::RejectDoubleFeeds
                    } else {
                        DoubleFeedDetectionMode::Disabled
                    }) {
                        Ok(()) => send_response(&Response::Ok)?,
                        Err(e) => send_error(&e)?,
                    }
                }
                (Some(client), Command::CalibrateMsd { calibration_type }) => {
                    match client.calibrate_double_feed_detection(calibration_type) {
                        Ok(()) => send_response(&Response::Ok)?,
                        Err(e) => send_error(&e)?,
                    }
                }
                (Some(client), Command::GetMsdCalibrationConfig) => {
                    match client.get_double_feed_detection_single_sheet_calibration_value(
                        Duration::from_secs(1),
                    ) {
                        Ok(single_sheet_calibration_value) => {
                            send_response(&Response::MsdCalibrationConfig {
                                led_intensity: 0,
                                single_sheet_calibration_value,
                                double_sheet_calibration_value: 0,
                                threshold_value: 0,
                            })?;
                        }
                        Err(e) => send_error(&e)?,
                    }
                }
                (None, _) => {
                    send_response(&Response::Error {
                        code: ErrorCode::Disconnected,
                        message: None,
                    })?;
                }
            },
            Err(std::sync::mpsc::TryRecvError::Empty) => {}
            Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                tracing::error!("stdin channel disconnected");
                return color_eyre::Result::Err(color_eyre::Report::msg(
                    "stdin channel disconnected",
                ));
            }
        }

        if let Some(client) = &mut client {
            if let Ok(event) = client.try_recv_matching(Incoming::is_event) {
                eprintln!("event: {:?}", event);
                match event {
                    Incoming::BeginScanEvent => {
                        raw_image_data = RawImageData::new();
                        send_response(&Response::ScanStart)?;
                    }
                    Incoming::EndScanEvent => {
                        match raw_image_data
                            .try_decode_scan(DEFAULT_IMAGE_WIDTH, ScanSideMode::Duplex)
                        {
                            Ok(Sheet::Duplex(top, bottom)) => {
                                match (top.to_image(), bottom.to_image()) {
                                    (Some(top_image), Some(bottom_image)) => {
                                        send_response(&Response::ScanComplete {
                                            image_data: (
                                                STANDARD.encode(top_image.as_bytes()),
                                                STANDARD.encode(bottom_image.as_bytes()),
                                            ),
                                        })?;
                                    }
                                    (Some(_), None) => {
                                        send_response(&Response::Error {
                                            code: ErrorCode::ScanFailed,
                                            message: Some(
                                                "failed to decode bottom image".to_owned(),
                                            ),
                                        })?;
                                    }
                                    (None, Some(_)) => {
                                        send_response(&Response::Error {
                                            code: ErrorCode::ScanFailed,
                                            message: Some("failed to decode top image".to_owned()),
                                        })?;
                                    }
                                    (None, None) => {
                                        send_response(&Response::Error {
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
                                send_response(&Response::Error {
                                    code: ErrorCode::ScanFailed,
                                    message: Some(format!(
                                        "failed to decode the scanned image data: {e}"
                                    )),
                                })?;
                            }
                        }
                    }
                    _ => {}
                }
            }

            if let Ok(Incoming::ImageData(image_data)) =
                client.try_recv_matching(|incoming| matches!(incoming, Incoming::ImageData(_)))
            {
                raw_image_data.extend_from_slice(&image_data);
            }
        }
    }
}
