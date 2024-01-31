use clap::Parser;
use rand::Rng;
use std::{
    process::exit,
    thread,
    time::{Duration, Instant},
};
use tracing_subscriber::prelude::*;

use crate::pdiscan_next::{pdi_client::PdiClient, protocol::Command};

mod pdiscan_next;

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

#[tracing::instrument]
fn main_threaded() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

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
        tracing::error!("failed to open device");
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
            client.send_command(Command::new(b"D"));
        }

        if let Ok(_) = rx2.try_recv() {
            client.send_command(Command::new(b"V"));
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

fn main_request_response() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    let Ok(mut client) = PdiClient::open() else {
        tracing::error!("failed to open device");
        exit(-1);
    };

    println!("get_test_string result: {:?}", client.get_test_string(None));
    println!(
        "get_firmware_version result: {:#?}",
        client.get_firmware_version(None)
    );
    println!(
        "get_scanner_status result: {:#?}",
        client.get_scanner_status(None)
    );

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
                Err(pdiscan_next::pdi_client::Error::RecvTimeout(_)) => {}
                Err(e) => return Err(e.into()),
                Ok(_) => {}
            }

            if let Ok(_) = client.begin_scan_rx.try_recv() {
                break;
            }
        }

        println!("waiting for end scan…");
        loop {
            match client.await_event(Instant::now() + Duration::from_millis(10)) {
                Err(pdiscan_next::pdi_client::Error::RecvTimeout(_)) => {}
                Err(e) => return Err(e.into()),
                Ok(_) => {}
            }

            if let Ok(_) = client.end_scan_rx.try_recv() {
                break;
            }
        }

        // std::thread::sleep(std::time::Duration::from_millis(10));
        println!("ejecting document to back of scanner…");
        client.eject_document_to_back_of_scanner()?;
        // client.get_test_string(std::time::Duration::from_millis(200))?;
    }

    Ok(())
}

fn main_watch_status() -> color_eyre::Result<()> {
    let config = Config::parse();
    setup(&config)?;

    let Ok(mut client) = PdiClient::open() else {
        tracing::error!("failed to open device");
        exit(-1);
    };

    let mut status = client.get_scanner_status(None)?;
    loop {
        let new_status = client.get_scanner_status(None)?;
        if new_status != status {
            println!("status changed: {:#?}", new_status);
            status = new_status;
        }

        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

fn main() -> color_eyre::Result<()> {
    // main_threaded()
    // main_request_response()
    // main_watch_status()
    main_scan_loop()
}
