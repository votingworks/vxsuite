//! This example demonstrates how to get a test string from the scanner. This is one of the most basic
//! operations you can perform with the scanner. It is useful for testing the connection to the scanner
//! and for verifying that the scanner is functioning properly.

use clap::Parser;
use std::time::Duration;
use tracing_subscriber::prelude::*;

use pdi_scanner::connect;

#[derive(Debug, Parser)]
struct Config {
    #[clap(long, env = "LOG_LEVEL", default_value = "warn")]
    log_level: tracing::Level,

    #[clap(long, default_value = "1")]
    times: u32,
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
    setup(&config).unwrap();

    let mut client = connect()?;

    for n in 1..=config.times {
        println!(
            "{n:02}: get_test_string result: {:?}",
            client.get_test_string(Duration::from_secs(1))
        );
    }

    Ok(())
}
