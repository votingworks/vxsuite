use clap::Parser;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
use tracing_subscriber::prelude::*;

use pdi_scanner::{
    connect,
    protocol::{
        image::{RawImageData, Sheet, DEFAULT_IMAGE_WIDTH},
        packets::Incoming,
        types::{DoubleFeedDetectionMode, EjectMotion, FeederMode, ScanSideMode},
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

fn main() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    let mut client = connect()?;

    let mut raw_image_data = RawImageData::new();
    let mut scan_index = 0;

    client.send_initial_commands_after_connect(Duration::from_secs(3))?;
    client.send_enable_scan_commands(DoubleFeedDetectionMode::RejectDoubleFeeds, 11.0)?;
    println!("waiting for sheet…");

    let running = Arc::new(AtomicBool::new(true));

    ctrlc::set_handler({
        let running = running.clone();
        move || {
            eprintln!("received SIGINT");
            running.store(false, Ordering::SeqCst);
        }
    })?;

    loop {
        if !running.load(Ordering::SeqCst) {
            eprintln!("exiting");
            break;
        }

        if let Ok(event) = client.try_recv_matching(Incoming::is_event) {
            println!("event: {event:?}");
            match event {
                Incoming::BeginScanEvent => {
                    raw_image_data = RawImageData::new();
                }
                Incoming::EndScanEvent => {
                    match raw_image_data.try_decode_scan(DEFAULT_IMAGE_WIDTH, ScanSideMode::Duplex)
                    {
                        Ok(Sheet::Duplex(top, bottom)) => {
                            match (top.to_image(), bottom.to_image()) {
                                (Some(top_image), Some(bottom_image)) => {
                                    let top_path =
                                        PathBuf::from(format!("scan-{scan_index:04}-top.png"));
                                    let bottom_path =
                                        PathBuf::from(format!("scan-{scan_index:04}-bottom.png"));
                                    top_image.save(&top_path)?;
                                    bottom_image.save(&bottom_path)?;
                                    println!(
                                        "Saved images from scan:\n- Top: {top_path}\n- Bottom: {bottom_path}",
                                        top_path = top_path.display(),
                                        bottom_path = bottom_path.display(),
                                    );
                                    scan_index += 1;

                                    if let Ok(status) =
                                        client.get_scanner_status(Duration::from_secs(1))
                                    {
                                        if status.rear_sensors_covered() {
                                            client.eject_document(EjectMotion::ToFront)?;
                                            // ejecting the document will disable the feeder,
                                            // so we need to re-enable it
                                            client.set_feeder_mode(FeederMode::AutoScanSheets)?;
                                        }
                                    }
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

                    println!("waiting for sheet…");
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

    client.set_feeder_mode(FeederMode::Disabled)?;

    Ok(())
}
