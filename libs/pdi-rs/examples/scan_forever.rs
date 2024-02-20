use clap::Parser;
use image::EncodableLayout;
use std::{
    io::{self, Write},
    process::exit,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Receiver, Sender, TryRecvError},
        Arc,
    },
    thread,
    time::Duration,
};
use tracing_subscriber::prelude::*;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use pdi_rs::{
    client::{Client, Error, Scanner},
    protocol::{
        image::{RawImageData, Sheet},
        packets::{self, Incoming},
        types::{DoubleFeedDetectionCalibrationType, EjectMotion, ScanSideMode, Status},
    },
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
#[serde(tag = "commandType")]
#[serde(rename_all = "camelCase")]
enum Command {
    #[serde(rename = "exit")]
    Exit,

    #[serde(rename = "connect")]
    Connect,

    #[serde(rename = "enable_scanning")]
    EnableScanning,

    #[serde(rename = "enable_msd")]
    EnableMsd { enable: bool },

    #[serde(rename = "calibrate_msd")]
    #[serde(rename_all = "camelCase")]
    CalibrateMsd {
        calibration_type: DoubleFeedDetectionCalibrationType,
    },

    #[serde(rename = "get_msd_calibration_config")]
    GetMsdCalibrationConfig,

    #[serde(rename = "get_scanner_status")]
    GetScannerStatus,
}

fn create_client() -> color_eyre::Result<(Scanner, Client)> {
    let mut scanner = Scanner::open()?;
    let (tx, rx) = scanner.start();
    let client = Client::new(tx, rx);
    Ok((scanner, client))
}

fn main_scan_loop() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    let (mut scanner, mut client) = create_client()?;

    let mut raw_image_data = RawImageData::new();
    let mut scan_index = 0;

    client.send_connect()?;
    client.send_enable_scan_commands()?;

    let running = Arc::new(AtomicBool::new(true));

    loop {
        if running.load(Ordering::Relaxed) {
            break;
        }

        if let Ok(event) = client.try_recv_matching(Incoming::is_event) {
            println!("event: {event:?}");
            match event {
                Incoming::BeginScanEvent => {
                    raw_image_data = RawImageData::new();
                }
                Incoming::EndScanEvent => {
                    match raw_image_data.try_decode_scan(1728, ScanSideMode::Duplex) {
                        Ok(Sheet::Duplex(top, bottom)) => {
                            match (top.to_image(), bottom.to_image()) {
                                (Some(top_image), Some(bottom_image)) => {
                                    top_image.save(format!("top-{scan_index:04}.png"))?;
                                    bottom_image.save(format!("bottom-{scan_index:04}.png"))?;
                                    scan_index += 1;
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
                            eprintln!("failed to decode the scanned image data: {e}");
                        }
                    }
                }
                _ => {}
            }

            if let Ok(Incoming::ImageData(image_data)) =
                client.try_recv_matching(|incoming| matches!(incoming, Incoming::ImageData(_)))
            {
                raw_image_data.extend_from_slice(&image_data);
            }
        }
    }

    scanner.stop();

    Ok(())
}

fn main_test_string() -> color_eyre::Result<()> {
    struct TestScanner {}

    impl TestScanner {
        pub fn start() -> (Sender<packets::Outgoing>, Receiver<packets::Incoming>) {
            let (host_to_scanner_tx, host_to_scanner_rx) = mpsc::channel();
            let (scanner_to_host_tx, scanner_to_host_rx) = mpsc::channel();

            thread::spawn({
                let scanner_to_host_tx = scanner_to_host_tx.clone();
                move || loop {
                    match host_to_scanner_rx.recv() {
                        Ok(packets::Outgoing::GetTestStringRequest) => {
                            thread::sleep(Duration::from_millis(400));
                            scanner_to_host_tx
                                .send(packets::Incoming::GetTestStringResponse(
                                    "hello".to_string(),
                                ))
                                .unwrap();
                        }
                        _ => {}
                    }
                }
            });

            thread::spawn({
                let scanner_to_host_tx = scanner_to_host_tx.clone();
                move || loop {
                    thread::sleep(Duration::from_millis(1));
                    scanner_to_host_tx
                        .send(packets::Incoming::MsdNeedsCalibrationEvent)
                        .unwrap();
                }
            });

            (host_to_scanner_tx, scanner_to_host_rx)
        }
    }

    let config = Config::parse();
    setup(&config).unwrap();

    let mut scanner = Scanner::open().unwrap();
    let (host_to_scanner_tx, scanner_to_host_rx) = scanner.start();

    let mut client = Client::new(host_to_scanner_tx, scanner_to_host_rx);
    // client.send_connect().unwrap();

    for _ in 0..10 {
        eprintln!(
            "get_test_string result: {:?}",
            client.get_test_string(Duration::from_millis(800))
        );
    }

    scanner.stop();

    Ok(())
}

fn main_client2_scan_test() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config).unwrap();

    let mut scanner = Scanner::open().unwrap();
    let (host_to_scanner_tx, scanner_to_host_rx) = scanner.start();

    let mut client = Client::new(host_to_scanner_tx, scanner_to_host_rx);
    client.send_connect().unwrap();
    client.send_enable_scan_commands().unwrap();

    let mut raw_image_data = RawImageData::new();

    loop {
        match client.try_recv_matching(Incoming::is_event) {
            Ok(event @ Incoming::BeginScanEvent) => {
                tracing::debug!("{event:?}: clearing raw image data");
                raw_image_data.clear();
            }
            Ok(event @ Incoming::EndScanEvent) => {
                match raw_image_data.try_decode_scan(1728, ScanSideMode::Duplex) {
                    Ok(Sheet::Duplex(top, bottom)) => match (top.to_image(), bottom.to_image()) {
                        (Some(top_image), Some(bottom_image)) => {
                            top_image.save("top.png")?;
                            bottom_image.save("bottom.png")?;
                        }
                        (Some(_), None) => {
                            tracing::error!("{event:?}: failed to decode bottom image");
                        }
                        (None, Some(_)) => {
                            tracing::error!("{event:?}: failed to decode top image");
                        }
                        (None, None) => {
                            tracing::error!("{event:?}: failed to decode top & bottom images");
                        }
                    },
                    Ok(_) => unreachable!(
                        "{event:?}: try_decode_scan called with {:?} returned non-duplex sheet",
                        ScanSideMode::Duplex
                    ),
                    Err(e) => {
                        tracing::error!("{event:?}: failed to decode the scanned image data: {e}");
                    }
                }
                raw_image_data.clear();

                match client.get_scanner_status(Duration::from_millis(10)) {
                    Ok(status) => {
                        if status.rear_sensors_covered() {
                            client.eject_document(EjectMotion::ToFront)?;
                        }
                    }
                    Err(e) => {
                        tracing::error!("{event:?}: failed to get scanner status: {e}");
                    }
                }
            }
            Ok(event) => {
                tracing::warn!("Unhandled event: {event:?}");
            }
            Err(Error::TryRecvError(TryRecvError::Empty)) => {}
            Err(e) => {
                eprintln!("error: {:?}", e);
                break;
            }
        }

        match client.try_recv_matching(|incoming| matches!(incoming, Incoming::ImageData(_))) {
            Ok(Incoming::ImageData(image_data)) => {
                tracing::debug!("received image data: {} byte(s)", image_data.len());
                raw_image_data.extend_from_slice(&image_data);
                tracing::debug!(
                    "total collected image data: {} byte(s)",
                    raw_image_data.len()
                );
            }
            Ok(_) | Err(Error::TryRecvError(TryRecvError::Empty)) => {}
            Err(e) => {
                tracing::error!("error: {:?}", e);
                break;
            }
        }
    }

    scanner.stop();

    Ok(())
}

pub fn main() -> color_eyre::Result<()> {
    // main_threaded()
    // main_request_response()
    // main_watch_status()
    // main_scan_loop()
    // main_test_string()
    // main_test_string()
    main_client2_scan_test()
}
