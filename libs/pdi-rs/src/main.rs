use clap::Parser;
use std::{
    process::exit,
    time::{Duration, Instant},
};
use tracing_subscriber::prelude::*;

use pdi_rs::pdiscan::{self, client::PdiClient};

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

fn main_scan_loop() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    let Ok(mut client) = PdiClient::open() else {
        tracing::error!("failed to open device");
        exit(-1);
    };

    println!("send_connect result: {:?}", client.send_connect());
    println!(
        "send_enable_scan_commands result: {:?}",
        client.send_enable_scan_commands()
    );

    loop {
        println!("waiting for begin scan…");
        loop {
            match client.await_event(Instant::now() + Duration::from_millis(10)) {
                Err(pdiscan::client::Error::RecvTimeout(_)) => {}
                Err(e) => return Err(e.into()),
                Ok(_) => {}
            }

            if client.begin_scan_rx.try_recv().is_ok() {
                break;
            }
        }

        println!("waiting for end scan…");
        loop {
            match client.await_event(Instant::now() + Duration::from_millis(10)) {
                Err(pdiscan::client::Error::RecvTimeout(_)) => {}
                Err(e) => return Err(e.into()),
                Ok(_) => {}
            }

            if client.end_scan_rx.try_recv().is_ok() {
                break;
            }
        }

        // std::thread::sleep(std::time::Duration::from_millis(10));
        println!("accepting document…");
        client.eject_document(pdiscan::protocol::types::EjectMotion::ToRear)?;
        // client.get_test_string(std::time::Duration::from_millis(200))?;
    }
}

pub fn main() -> color_eyre::Result<()> {
    // main_threaded()
    // main_request_response()
    // main_watch_status()
    main_scan_loop()
}
