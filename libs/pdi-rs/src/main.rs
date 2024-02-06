use clap::Parser;
use std::{
    io::{self, Write},
    process::exit,
    time::{Duration, Instant},
};
use tracing_subscriber::prelude::*;

use pdi_rs::pdiscan::{self, client::Client};

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
enum Command {
    #[serde(rename = "exit")]
    Exit,

    #[serde(rename = "connect")]
    Connect,

    #[serde(rename = "enable_scanning")]
    EnableScanning,
}

#[derive(Debug, serde::Serialize)]
#[serde(tag = "outgoingType")]
enum Outgoing {
    #[serde(rename = "ok")]
    Ok,

    #[serde(rename = "error")]
    Err { message: String },

    #[serde(rename = "scan_complete")]
    ScanComplete { image_data: String },
}

fn wrap_outgoing(outgoing: &Outgoing) -> color_eyre::Result<()> {
    serde_json::to_writer(io::stdout(), outgoing)?;
    let mut stdout = io::stdout().lock();
    stdout.write_all(b"\n")?;
    Ok(())
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

    let mut client: Option<Client> = None;
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

                match (&mut client, command) {
                    (_, Command::Exit) => {
                        serde_json::to_writer(io::stdout(), &Outgoing::Ok)?;
                        exit(0)
                    }
                    (Some(_), Command::Connect) => {
                        wrap_outgoing(&Outgoing::Err {
                            message: "already connected".to_string(),
                        })?;
                    }
                    (None, Command::Connect) => {
                        client = match Client::open() {
                            Ok(mut client) => {
                                match client.send_connect() {
                                    Ok(()) => {
                                        wrap_outgoing(&Outgoing::Ok)?;
                                    }
                                    Err(e) => {
                                        eprintln!("send_connect() error: {e:?}");
                                        wrap_outgoing(&Outgoing::Err {
                                            message: e.to_string(),
                                        })?;
                                    }
                                }
                                Some(client)
                            }
                            Err(e) => {
                                eprintln!("open() error: {e:?}");
                                wrap_outgoing(&Outgoing::Err {
                                    message: e.to_string(),
                                })?;
                                None
                            }
                        };
                    }
                    (Some(client), Command::EnableScanning) => {
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
                    (None, Command::EnableScanning) => {
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

        if let Some(client) = &mut client {
            match client.await_event(Instant::now() + Duration::from_millis(10)) {
                Ok(()) | Err(pdiscan::client::Error::RecvTimeout(_)) => {}
                Err(e) => {
                    tracing::error!("error: {e:?}");
                    exit(-1);
                }
            }

            if client.begin_scan_rx.try_recv().is_ok() {
                // println!("begin scan");
            }

            if client.end_scan_rx.try_recv().is_ok() {
                wrap_outgoing(&Outgoing::ScanComplete {
                    image_data: "".to_string(),
                })?;
            }
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

    //     // std::thread::sleep(std::time::Duration::from_millis(10));
    //     println!("accepting document…");
    //     client.eject_document(pdiscan::protocol::types::EjectMotion::ToRear)?;
    //     // client.get_test_string(std::time::Duration::from_millis(200))?;
    // }
}

pub fn main() -> color_eyre::Result<()> {
    // main_threaded()
    // main_request_response()
    // main_watch_status()
    main_scan_loop()
}
