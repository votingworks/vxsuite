use clap::Parser;
use image::EncodableLayout;
use std::{
    io::{self, Write},
    process::exit,
    sync::mpsc::{self, Receiver, Sender, TryRecvError},
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

#[derive(Debug, serde::Serialize)]
#[serde(tag = "outgoingType")]
enum Outgoing {
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

fn wrap_outgoing(outgoing: &Outgoing) -> color_eyre::Result<()> {
    serde_json::to_writer(io::stdout(), outgoing)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(b"\n")?;
    Ok(())
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

    // let Ok(mut client) = PdiClient::open() else {
    //     tracing::error!("failed to open device");
    //     exit(-1);
    // };

    // println!("send_connect result: {:?}", client.send_connect());
    // println!(
    //     "send_enable_scan_commands result: {:?}",
    //     client.send_enable_scan_commands()
    // );

    let (stdin_tx, stdin_rx) = std::sync::mpsc::channel();

    std::thread::spawn(move || {
        loop {
            let mut buffer = String::new();
            match io::stdin().read_line(&mut buffer) {
                Ok(_) => {
                    let command = serde_json::from_str::<Command>(&buffer).unwrap();
                    stdin_tx.send(command).unwrap();
                    // println!("received message: {command:?}");
                }

                Err(e) => {
                    tracing::error!("failed to read from stdin: {e:?}");
                }
            }
        }
    });

    let mut scanner_and_client: Option<(Scanner, Client)> = None;
    let mut raw_image_data = RawImageData::new();
    // client.reset()?;

    // println!("send_connect result: {:?}", client.send_connect());
    // println!(
    //     "send_enable_scan_commands result: {:?}",
    //     client.send_enable_scan_commands()
    // );

    loop {
        match stdin_rx.try_recv() {
            Ok(command) => {
                // println!("received message: {command:?}");

                match (&mut scanner_and_client, command) {
                    (_, Command::Exit) => {
                        serde_json::to_writer(io::stdout(), &Outgoing::Ok)?;
                        exit(0)
                    }
                    (Some(_), Command::Connect) => {
                        wrap_outgoing(&Outgoing::Err {
                            message: "already connected".to_string(),
                        })?;
                    }
                    (None, Command::Connect) => match create_client() {
                        Ok((scanner, mut client)) => {
                            match client.send_connect() {
                                Ok(()) => {
                                    wrap_outgoing(&Outgoing::Ok)?;
                                }
                                Err(e) => {
                                    wrap_outgoing(&Outgoing::Err {
                                        message: e.to_string(),
                                    })?;
                                }
                            }
                            scanner_and_client = Some((scanner, client));
                            wrap_outgoing(&Outgoing::Ok)?;
                        }
                        Err(e) => {
                            wrap_outgoing(&Outgoing::Err {
                                message: e.to_string(),
                            })?;
                        }
                    },
                    (Some((_, client)), Command::EnableScanning) => {
                        match client.send_enable_scan_commands() {
                            Ok(()) => {
                                wrap_outgoing(&Outgoing::Ok)?;
                            }
                            Err(e) => {
                                wrap_outgoing(&Outgoing::Err {
                                    message: e.to_string(),
                                })?;
                            }
                        }
                    }
                    (Some((_, client)), Command::EnableMsd { enable }) => {
                        match client.set_double_feed_detection_enabled(enable) {
                            Ok(()) => {
                                wrap_outgoing(&Outgoing::Ok)?;
                            }
                            Err(e) => {
                                wrap_outgoing(&Outgoing::Err {
                                    message: e.to_string(),
                                })?;
                            }
                        }
                    }
                    (Some((_, client)), Command::CalibrateMsd { calibration_type }) => {
                        match client.calibrate_double_feed_detection(calibration_type) {
                            Ok(()) => {
                                wrap_outgoing(&Outgoing::Ok)?;
                            }
                            Err(e) => {
                                wrap_outgoing(&Outgoing::Err {
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
                                wrap_outgoing(&Outgoing::MsdCalibrationConfig {
                                    led_intensity: 0,
                                    single_sheet_calibration_value,
                                    double_sheet_calibration_value: 0,
                                    threshold_value: 0,
                                })?;
                            }
                            Err(e) => {
                                wrap_outgoing(&Outgoing::Err {
                                    message: e.to_string(),
                                })?;
                            }
                        }
                    }
                    (Some((_, client)), Command::GetScannerStatus) => {
                        match client.get_scanner_status(Duration::from_secs(1)) {
                            Ok(status) => {
                                wrap_outgoing(&Outgoing::ScannerStatus { status })?;
                            }
                            Err(e) => {
                                wrap_outgoing(&Outgoing::Err {
                                    message: e.to_string(),
                                })?;
                            }
                        }
                    }
                    (None, _) => {
                        wrap_outgoing(&Outgoing::Err {
                            message: "scanner not connected".to_string(),
                        })?;
                    }
                }
            }
            Err(std::sync::mpsc::TryRecvError::Empty) => {}
            Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                tracing::error!("stdin channel disconnected");
                exit(-1);
            }
        }

        if let Some((_, client)) = &mut scanner_and_client {
            // match client.await_event(Instant::now() + Duration::from_millis(10)) {
            //     Ok(()) | Err(pdiscan::client::Error::RecvTimeout(_)) => {}
            //     Err(e) => {
            //         tracing::error!("error: {e:?}");
            //         exit(-1);
            //     }
            // }

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
                                        top_image.save("top.png")?;
                                        bottom_image.save("bottom.png")?;
                                        wrap_outgoing(&Outgoing::ScanComplete {
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
                                wrap_outgoing(&Outgoing::Err {
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

            // if let Ok((top_page, bottom_page)) = client.end_scan_rx.try_recv() {
            //     let top_image = top_page.to_image().unwrap();
            //     let bottom_image = bottom_page.to_image().unwrap();

            //     top_image.save("top.png")?;
            //     bottom_image.save("bottom.png")?;

            //     wrap_outgoing(&Outgoing::ScanComplete {
            //         image_data: (
            //             STANDARD.encode(top_page.to_image().unwrap().as_bytes()),
            //             STANDARD.encode(bottom_page.to_image().unwrap().as_bytes()),
            //         ),
            //     })?;
            // }
        }
    }

    // loop {
    //     println!("waiting for begin scan…");
    //     loop {
    //         match client.await_event(Instant::now() + Duration::from_millis(10)) {
    //             Err(pdiscan::client::Error::RecvTimeout(_)) => {}
    //             Err(e) => return Err(e.into()),
    //             Ok(()) => {}
    //         }

    //         if client.begin_scan_rx.try_recv().is_ok() {
    //             break;
    //         }
    //     }

    //     println!("waiting for end scan…");
    //     loop {
    //         match client.await_event(Instant::now() + Duration::from_millis(10)) {
    //             Err(pdiscan::client::Error::RecvTimeout(_)) => {}
    //             Err(e) => return Err(e.into()),
    //             Ok(()) => {}
    //         }

    //         if client.end_scan_rx.try_recv().is_ok() {
    //             break;
    //         }
    //     }

    //     // std::thread::sleep(Duration::from_millis(10));
    //     println!("accepting document…");
    //     client.eject_document(pdiscan::protocol::types::EjectMotion::ToRear)?;
    //     // client.get_test_string(Duration::from_millis(200))?;
    // }
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
