use clap::{Parser, Subcommand};
use std::{str::FromStr, time::Duration};
use tokio::time::{sleep, timeout, Instant};
use tracing_subscriber::prelude::*;

use pdi_scanner::{
    client::Client,
    protocol::{
        packets::Incoming,
        types::{BootEjectMotion, ClampedPercentage, DoubleFeedDetectionMode, FeederMode},
    },
};

const REBOOT_TIMEOUT: Duration = Duration::from_secs(10);
const RECONNECT_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug, Parser)]
struct Config {
    #[clap(long, env = "LOG_LEVEL", default_value = "warn")]
    log_level: tracing::Level,

    #[clap(subcommand)]
    command: SubCommand,
}

#[derive(Debug, Subcommand)]
enum SubCommand {
    /// Set the eject-at-boot motion, reboot, and verify the setting persisted
    Set {
        boot_eject_motion: BootEjectMotionWrapper,

        #[clap(long, default_value_t = false)]
        dry_run: bool,
    },

    /// Test the eject-at-boot behavior by scanning a sheet, holding it, and rebooting
    Test,
}

#[derive(Debug, Clone)]
struct BootEjectMotionWrapper(BootEjectMotion);

impl FromStr for BootEjectMotionWrapper {
    type Err = ConfigError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Ok(match s {
            "rear" | "ToRear" => Self(BootEjectMotion::ToRear),
            "front" | "ToFront" => Self(BootEjectMotion::ToFront),
            "none" | "None" => Self(BootEjectMotion::None),
            value => return Err(ConfigError::InvalidBootEjectMotion(value.to_owned())),
        })
    }
}

#[derive(Debug, thiserror::Error)]
enum ConfigError {
    #[error("Invalid boot eject motion: {0}")]
    InvalidBootEjectMotion(String),
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
                .with_default_directive(format!("pdi_scanner={}", config.log_level).parse()?)
                .from_env_lossy(),
        )
        .with(stderr_log)
        .init();

    Ok(())
}

/// Sends a reboot command, drops the old connection, and tries to reconnect
/// until the scanner comes back or the timeout expires.
async fn reboot_and_reconnect(
    mut client: Client,
    request_timeout: Duration,
) -> color_eyre::Result<Client> {
    client.reboot().await?;
    // Give the scanner a moment to begin shutting down before we drop the
    // connection, ensuring the reboot command is fully transmitted.
    sleep(Duration::from_secs(1)).await;
    drop(client);

    println!("Waiting for scanner to reboot…");
    let deadline = Instant::now() + REBOOT_TIMEOUT;
    loop {
        if Instant::now() >= deadline {
            return Err(color_eyre::eyre::eyre!(
                "Timed out waiting for scanner to reconnect after reboot"
            ));
        }
        match Client::connect() {
            Ok(mut candidate) => {
                match timeout(request_timeout, candidate.wait_until_ready()).await {
                    Ok(()) => return Ok(candidate),
                    Err(error) => {
                        tracing::debug!(
                            "scanner reconnected over USB but was not ready yet: {error}"
                        );
                        sleep(RECONNECT_INTERVAL).await;
                    }
                }
            }
            Err(_) => sleep(RECONNECT_INTERVAL).await,
        }
    }
}

#[tokio::main]
async fn main() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    match config.command {
        SubCommand::Set {
            boot_eject_motion,
            dry_run,
        } => {
            let onesec = Duration::from_secs(1);
            let mut client = Client::connect()?;
            timeout(onesec, client.wait_until_ready()).await?;

            let current = timeout(onesec, client.get_boot_eject_motion()).await??;

            println!("Current eject at boot motion: {current:?}");
            println!("Setting eject at boot motion: {:?}", boot_eject_motion.0);

            if dry_run {
                println!("(skipping set due to --dry-run)");
            } else {
                timeout(onesec, client.set_boot_eject_motion(boot_eject_motion.0)).await??;

                println!("Rebooting to verify setting persisted…");
                let mut client = reboot_and_reconnect(client, onesec).await?;
                let after_reboot = timeout(onesec, client.get_boot_eject_motion()).await??;
                println!("Eject at boot motion after reboot: {after_reboot:?}");
                if after_reboot == boot_eject_motion.0 {
                    println!("Verified: setting persisted across reboot.");
                } else {
                    return Err(color_eyre::eyre::eyre!(
                        "Setting did not persist! Expected {:?}, got {:?}",
                        boot_eject_motion.0,
                        after_reboot
                    ));
                }
            }

            println!("Success!");
        }

        SubCommand::Test => {
            let mut client = Client::connect()?;

            let onesec = Duration::from_secs(1);
            timeout(onesec, client.wait_until_ready()).await?;
            let current = timeout(onesec, client.get_boot_eject_motion()).await??;
            println!("Current eject at boot motion: {current:?}");

            // Set up scanning. This configures HoldPaperInEscrow so the paper
            // stays in the scanner after the scan completes.
            if timeout(Duration::from_millis(500), client.initialize_scanning(None))
                .await
                .is_err()
            {
                timeout(Duration::from_secs(3), client.initialize_scanning(None)).await??;
            }

            client
                .send_enable_scan_commands(
                    ClampedPercentage::new_unchecked(75),
                    DoubleFeedDetectionMode::Disabled,
                    11.0,
                )
                .await?;

            client.set_feeder_mode(FeederMode::AutoScanSheets).await?;
            println!("Insert a sheet to test eject-at-boot behavior…");

            loop {
                tokio::select! {
                    _ = tokio::signal::ctrl_c() => {
                        eprintln!("exiting");
                        client.set_feeder_mode(FeederMode::Disabled).await?;
                        return Ok(());
                    }

                    Ok(incoming) = client.recv() => {
                        match incoming {
                            Incoming::EndScanEvent => {
                                println!("Sheet scanned and held in escrow.");
                                println!("Rebooting scanner…");
                                let mut client = reboot_and_reconnect(client, onesec).await?;
                                let after_reboot =
                                    timeout(onesec, client.get_boot_eject_motion()).await??;
                                println!("Scanner reconnected. Eject at boot motion: {after_reboot:?}");
                                println!("Done! Check whether the paper was ejected as expected.");
                                return Ok(());
                            }
                            Incoming::BeginScanEvent => {
                                println!("Scanning…");
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    Ok(())
}
