use clap::Parser;
use image::EncodableLayout;
use std::{
    io::{self, Write},
    process::exit,
    time::Duration,
};
use tracing_subscriber::prelude::*;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use pdi_scanner::{
    client::Client,
    connect,
    protocol::{
        image::{RawImageData, Sheet},
        packets::Incoming,
        types::{
            DoubleFeedDetectionCalibrationType, DoubleFeedDetectionMode, EjectMotion, ScanSideMode,
            Status,
        },
    },
    scanner::Scanner,
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
#[serde(tag = "type")]
#[serde(rename_all = "camelCase")]
enum Command {
    #[serde(rename = "exit")]
    Exit,

    #[serde(rename = "connect")]
    Connect,

    #[serde(rename = "disconnect")]
    Disconnect,

    #[serde(rename = "get_scanner_status")]
    GetScannerStatus,

    #[serde(rename = "enable_scanning")]
    EnableScanning,

    #[serde(rename = "eject")]
    #[serde(rename_all = "camelCase")]
    EjectDocument { eject_motion: EjectMotion },

    #[serde(rename = "enable_msd")]
    EnableMsd { enable: bool },

    #[serde(rename = "calibrate_msd")]
    #[serde(rename_all = "camelCase")]
    CalibrateMsd {
        calibration_type: DoubleFeedDetectionCalibrationType,
    },

    #[serde(rename = "get_msd_calibration_config")]
    GetMsdCalibrationConfig,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "type")]
enum Response {
    #[serde(rename = "ok")]
    Ok,

    #[serde(rename = "error")]
    Err { message: String },

    #[serde(rename = "scan_complete")]
    #[serde(rename_all = "camelCase")]
    ScanComplete { image_data: (String, String) },

    #[serde(rename = "msd_calibration_config")]
    #[serde(rename_all = "camelCase")]
    MsdCalibrationConfig {
        led_intensity: u16,
        single_sheet_calibration_value: u16,
        double_sheet_calibration_value: u16,
        threshold_value: u16,
    },

    #[serde(rename = "scanner_status")]
    #[serde(rename_all = "camelCase")]
    ScannerStatus { status: Status },
}

fn send_response(response: &Response) -> color_eyre::Result<()> {
    serde_json::to_writer(io::stdout(), response)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(b"\n")?;
    Ok(())
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

    let mut scanner_and_client: Option<(Scanner, Client)> = None;
    let mut raw_image_data = RawImageData::new();

    // Main loop:
    // - Process any commands received on stdin
    // - Process any events or image data received from the scanner
    loop {
        match stdin_rx.try_recv() {
            Ok(command) => match (&mut scanner_and_client, command) {
                (_, Command::Exit) => {
                    serde_json::to_writer(io::stdout(), &Response::Ok)?;
                    exit(0)
                }
                (Some(_), Command::Connect) => {
                    send_response(&Response::Err {
                        message: "already connected".to_string(),
                    })?;
                }
                (None, Command::Connect) => match connect() {
                    Ok((scanner, mut client)) => {
                        match client.send_connect() {
                            Ok(()) => {
                                send_response(&Response::Ok)?;
                            }
                            Err(e) => {
                                send_response(&Response::Err {
                                    message: e.to_string(),
                                })?;
                            }
                        }
                        scanner_and_client = Some((scanner, client));
                    }
                    Err(e) => {
                        send_response(&Response::Err {
                            message: e.to_string(),
                        })?;
                    }
                },
                (Some((scanner, _)), Command::Disconnect) => {
                    scanner.stop();
                    scanner_and_client = None;
                    send_response(&Response::Ok)?;
                }
                (Some((_, client)), Command::GetScannerStatus) => {
                    match client.get_scanner_status(Duration::from_secs(1)) {
                        Ok(status) => {
                            send_response(&Response::ScannerStatus { status })?;
                        }
                        Err(e) => {
                            send_response(&Response::Err {
                                message: e.to_string(),
                            })?;
                        }
                    }
                }
                (Some((_, client)), Command::EnableScanning) => {
                    match client.send_enable_scan_commands() {
                        Ok(()) => {
                            send_response(&Response::Ok)?;
                        }
                        Err(e) => {
                            send_response(&Response::Err {
                                message: e.to_string(),
                            })?;
                        }
                    }
                }
                (Some((_, client)), Command::EjectDocument { eject_motion }) => {
                    match client.eject_document(eject_motion) {
                        Ok(()) => {
                            send_response(&Response::Ok)?;
                        }
                        Err(e) => {
                            send_response(&Response::Err {
                                message: e.to_string(),
                            })?;
                        }
                    }
                }
                (Some((_, client)), Command::EnableMsd { enable }) => {
                    match client.set_double_feed_detection_mode(if enable {
                        DoubleFeedDetectionMode::RejectDoubleFeeds
                    } else {
                        DoubleFeedDetectionMode::Disabled
                    }) {
                        Ok(()) => {
                            send_response(&Response::Ok)?;
                        }
                        Err(e) => {
                            send_response(&Response::Err {
                                message: e.to_string(),
                            })?;
                        }
                    }
                }
                (Some((_, client)), Command::CalibrateMsd { calibration_type }) => {
                    match client.calibrate_double_feed_detection(calibration_type) {
                        Ok(()) => {
                            send_response(&Response::Ok)?;
                        }
                        Err(e) => {
                            send_response(&Response::Err {
                                message: e.to_string(),
                            })?;
                        }
                    }
                }
                (Some((_, client)), Command::GetMsdCalibrationConfig) => {
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
                        Err(e) => {
                            send_response(&Response::Err {
                                message: e.to_string(),
                            })?;
                        }
                    }
                }
                (None, _) => {
                    send_response(&Response::Err {
                        message: "scanner not connected".to_string(),
                    })?;
                }
            },
            Err(std::sync::mpsc::TryRecvError::Empty) => {}
            Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                tracing::error!("stdin channel disconnected");
                exit(-1);
            }
        }

        if let Some((_, client)) = &mut scanner_and_client {
            if let Ok(event) = client.try_recv_matching(Incoming::is_event) {
                eprintln!("event: {:?}", event);
                // TODO: pass the event as JSON via stdout
                match event {
                    Incoming::BeginScanEvent => {
                        raw_image_data = RawImageData::new();
                    }
                    Incoming::EndScanEvent => {
                        match raw_image_data.try_decode_scan(1728, ScanSideMode::Duplex) {
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
                                        eprintln!("failed to decode bottom image");
                                    }
                                    (None, Some(_)) => {
                                        eprintln!("failed to decode top image");
                                    }
                                    (None, None) => {
                                        eprintln!("failed to decode top & bottom images");
                                    }
                                }
                            }
                            Ok(_) => unreachable!(
                                "try_decode_scan called with {:?} returned non-duplex sheet",
                                ScanSideMode::Duplex
                            ),
                            Err(e) => {
                                send_response(&Response::Err {
                                    message: format!(
                                        "failed to decode the scanned image data: {e}"
                                    ),
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
