use clap::Parser;
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
use tokio::time::timeout;
use tracing_subscriber::prelude::*;

use pdi_scanner::{
    connect,
    protocol::{
        image::{RawImageData, Sheet, DEFAULT_IMAGE_WIDTH},
        packets::{ImageData, Incoming},
        types::{
            ClampedPercentage, DoubleFeedDetectionMode, EjectMotion, FeederMode, ScanSideMode,
        },
    },
};

#[derive(Debug, Parser)]
struct Config {
    #[clap(long, env = "LOG_LEVEL", default_value = "warn")]
    log_level: tracing::Level,

    /// Threshold value for determining whether a pixel is black or white.
    /// See Section 2.1.43 of the PageScan software spec where it specifies this
    /// value as the default.
    #[clap(long, env = "BITONAL_THRESHOLD", default_value = "75%")]
    bitonal_threshold: ClampedPercentage,
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

#[tokio::main]
async fn main() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    let mut client = connect()?;

    let mut raw_image_data = RawImageData::new();
    let mut scan_index = 0;

    // Sometimes, after closing the previous scanner connection, a new connection will
    // time out during these first commands. Until we get to the bottom of why that's
    // happening, we just retry once, which seems to resolve it.
    if timeout(
        Duration::from_millis(500),
        client.send_initial_commands_after_connect(),
    )
    .await
    .is_err()
    {
        timeout(
            Duration::from_secs(3),
            client.send_initial_commands_after_connect(),
        )
        .await??;
    }
    let image_calibration_tables = timeout(
        Duration::from_secs(3),
        client.get_image_calibration_tables(),
    )
    .await??;

    client
        .send_enable_scan_commands(
            config.bitonal_threshold,
            DoubleFeedDetectionMode::RejectDoubleFeeds,
            11.0,
        )
        .await?;
    println!("waiting for sheet…");

    let mut start: Option<Instant> = None;

    loop {
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                eprintln!("exiting");
                break;
            }

            Ok(incoming) = client.recv() => {
                println!("incoming: {incoming:?}");
                match incoming {
                    Incoming::BeginScanEvent => {
                        start = Some(Instant::now());
                        raw_image_data = RawImageData::new();
                    }
                    Incoming::ImageData(ImageData(image_data)) => {
                        raw_image_data.extend_from_slice(&image_data);
                    }
                    Incoming::EndScanEvent => {
                        match raw_image_data.try_decode_scan(
                            DEFAULT_IMAGE_WIDTH,
                            ScanSideMode::Duplex,
                            &image_calibration_tables,
                        ) {
                            Ok(Sheet::Duplex(top_image, bottom_image)) => {
                                println!(
                                    "scanned duplex sheet in {:?}",
                                    start.unwrap_or_else(Instant::now).elapsed()
                                );
                                let top_path = PathBuf::from(format!("scan-{scan_index:04}-top.png"));
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
                                    timeout(Duration::from_secs(1), client.get_scanner_status()).await?
                                {
                                    if status.rear_sensors_covered() {
                                        client.eject_document(EjectMotion::ToFront).await?;
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

                        client.set_feeder_mode(FeederMode::AutoScanSheets).await?;
                        println!("waiting for sheet…");
                    }
                    packet => eprintln!("unexpected packet: {packet:?}")
                }
            }
        }
    }

    client.set_feeder_mode(FeederMode::Disabled).await?;

    Ok(())
}
