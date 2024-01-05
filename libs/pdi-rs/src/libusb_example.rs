use clap::Parser;
use rand::Rng;
use std::{process::exit, thread, time::Duration};
use tracing_subscriber::prelude::*;

use crate::pdi_client::PdiClient;

mod pdi_client;

#[derive(Debug, Parser)]
struct Config {
    #[clap(long, env = "LOG_LEVEL", default_value = "warn")]
    log_level: tracing::Level,
}

#[tracing::instrument]
fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;

    let config = Config::parse();

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

    let (tx, rx) = std::sync::mpsc::channel();
    let (tx2, rx2) = std::sync::mpsc::channel();
    let (quit_tx, quit_rx) = std::sync::mpsc::channel();
    let (quit_tx_test_string, quit_rx_test_string) = std::sync::mpsc::channel();
    let (quit_tx_version, quit_rx_version) = std::sync::mpsc::channel();

    let mut rng = rand::thread_rng();
    let test_string_thread_interval = std::time::Duration::from_millis(rng.gen_range(1..10) * 10);
    tracing::debug!("test_string thread interval: {test_string_thread_interval:?}");
    let test_string_thread = thread::spawn(move || {
        let _entered = tracing::span!(tracing::Level::TRACE, "test_string_thread").entered();
        loop {
            if let Ok(_) = quit_rx_test_string.try_recv() {
                tracing::debug!("received quit message, stopping test string thread");
                break;
            }

            tx.send(()).unwrap();
            thread::sleep(test_string_thread_interval);
        }
    });

    let version_thread_interval = std::time::Duration::from_millis(rng.gen_range(1..10) * 10);
    tracing::debug!("version_thread: interval: {:?}", version_thread_interval);
    let version_thread = thread::spawn(move || {
        let _entered = tracing::span!(tracing::Level::TRACE, "version_thread").entered();
        loop {
            if let Ok(_) = quit_rx_version.try_recv() {
                tracing::debug!("received quit message, stopping version thread");
                break;
            }

            tx2.send(()).unwrap();
            thread::sleep(version_thread_interval);
        }
    });

    let Ok(mut client) = PdiClient::open() else {
        tracing::error!("Failed to open device");
        exit(-1);
    };

    thread::spawn(move || {
        thread::sleep(Duration::from_secs(1));
        tracing::trace!("sending quit message");
        quit_tx.send(()).unwrap();
        tracing::trace!("sending quit message to test string thread");
        quit_tx_test_string.send(()).unwrap();
        tracing::trace!("sending quit message to version thread");
        quit_tx_version.send(()).unwrap();
    });

    loop {
        if let Ok(_) = quit_rx.try_recv() {
            tracing::trace!("received quit message, stopping main loop");
            break;
        }

        if let Ok(_) = rx.try_recv() {
            client.send_command(b"D");
        }

        if let Ok(_) = rx2.try_recv() {
            client.send_command(b"V");
        }
    }

    tracing::trace!("joining test string thread");
    test_string_thread.join().unwrap();
    tracing::trace!("joining version thread");
    version_thread.join().unwrap();
    tracing::trace!("dropping client");
    drop(client);
    tracing::trace!("exiting");

    Ok(())
}
