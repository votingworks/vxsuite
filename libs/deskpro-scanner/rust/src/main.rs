//! `deskproctl`: a daemon around the `InoTec` `DeskPro` driver, isolating it from the scan
//! backend. Speaks [`deskpro_scanner::protocol`] over stdin/stdout and logs to stderr.

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::mpsc::{Receiver, Sender, SyncSender, sync_channel};

use clap::Parser;
use deskpro_scanner::driver::{self, Driver};
use deskpro_scanner::ffi;
use deskpro_scanner::protocol::{
    Command, CommandBody, DecodeError, ErrorCode, Event, FRAME_HEADER_LENGTH, Hello, ImageHeader,
    Response, ResponseBody, decode_frame_header, encode_frame, encode_image_frame_prefix,
    frame_type,
};

#[derive(Debug, Parser)]
#[command(about = "Daemon for the InoTec DeskPro scanner")]
struct Config {
    /// Path to the vendor `libinoapi.so`.
    #[clap(long, env = ffi::LIBRARY_PATH_ENV, default_value = ffi::DEFAULT_LIBRARY_PATH)]
    library: PathBuf,

    #[clap(long, env = "LOG_LEVEL", default_value = "warn")]
    log_level: tracing::Level,
}

/// Frames that may sit unwritten before the main loop blocks. Driver callbacks feed a separate
/// unbounded channel, so blocking here never stalls them.
const OUTPUT_QUEUE_DEPTH: usize = 8;

/// Exit status after losing the scanner. The vendor library cannot reconnect in the same process.
const LOST_SCANNER_EXIT_CODE: i32 = 3;

fn main() -> color_eyre::Result<()> {
    let config = Config::parse();
    color_eyre::install()?;
    setup_logging(&config)?;

    let output = Output::spawn(std::io::stdout());
    let (inputs_tx, inputs) = std::sync::mpsc::channel();
    spawn_input_reader(std::io::stdin(), inputs_tx.clone());
    let terminate = inputs_tx.clone();
    ctrlc::set_handler(move || {
        let _ = terminate.send(Input::Terminate);
    })?;

    output.send_frame(
        frame_type::HELLO,
        &Hello {
            daemon_version: env!("CARGO_PKG_VERSION").to_owned(),
        }
        .encode(),
    );

    let mut session = Session::new(config.library, output, inputs_tx);
    for input in inputs {
        match input {
            Input::Command(command) => {
                if session.handle(&command) == Flow::Exit {
                    break;
                }
            }
            Input::DriverEvent(event) => {
                if session.handle_driver_event(event) == Flow::LostScanner {
                    session.output.shutdown();
                    // SAFETY: output is flushed. After a lost link the vendor library's threads
                    // outlive even `ScannerDisconnect`, so `exit` aborts in its C++ destructors.
                    unsafe { libc::_exit(LOST_SCANNER_EXIT_CODE) };
                }
            }
            Input::Malformed(error) => {
                tracing::error!("malformed frame from client: {error}");
                break;
            }
            Input::Closed => break,
            Input::Terminate => {
                tracing::info!("terminated by signal");
                break;
            }
        }
    }

    tracing::info!("shutting down");
    session.shutdown();
    Ok(())
}

fn setup_logging(config: &Config) -> color_eyre::Result<()> {
    use tracing_subscriber::prelude::*;

    let filter = tracing_subscriber::EnvFilter::builder()
        .with_default_directive(format!("deskpro_scanner={}", config.log_level).parse()?)
        .from_env_lossy()
        .add_directive(format!("deskproctl={}", config.log_level).parse()?);

    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stderr)
                .pretty(),
        )
        .with(filter)
        .try_init()
        .map_err(|error| color_eyre::eyre::eyre!("{error}"))
}

enum Outgoing {
    Frame(Vec<u8>),
    /// An image frame's prefix, then its pixels, written without copying them into one buffer.
    Image {
        prefix: Vec<u8>,
        data: Box<dyn AsRef<[u8]> + Send>,
    },
}

/// Writes frames to stdout from a dedicated thread so a slow client never stalls the main loop.
struct Output {
    frames: Option<SyncSender<Outgoing>>,
    writer: Option<std::thread::JoinHandle<()>>,
}

impl Output {
    fn spawn<W: Write + Send + 'static>(mut writer: W) -> Self {
        let (tx, rx) = sync_channel::<Outgoing>(OUTPUT_QUEUE_DEPTH);
        let handle = std::thread::spawn(move || {
            for outgoing in rx {
                let written = match &outgoing {
                    Outgoing::Frame(frame) => writer.write_all(frame),
                    Outgoing::Image { prefix, data } => writer
                        .write_all(prefix)
                        .and_then(|()| writer.write_all((**data).as_ref())),
                };
                if let Err(error) = written.and_then(|()| writer.flush()) {
                    tracing::error!("failed to write frame: {error}");
                    break;
                }
            }
        });
        Self {
            frames: Some(tx),
            writer: Some(handle),
        }
    }

    /// Flushes everything queued and stops the writer.
    fn shutdown(&mut self) {
        drop(self.frames.take());
        if let Some(writer) = self.writer.take() {
            let _ = writer.join();
        }
    }

    fn send_frame(&self, frame_type: u8, payload: &[u8]) {
        if let Some(frames) = self.frames.as_ref() {
            let _ = frames.send(Outgoing::Frame(encode_frame(frame_type, payload)));
        }
    }

    fn respond(&self, id: u32, body: ResponseBody) {
        self.send_frame(frame_type::RESPONSE, &Response { id, body }.encode());
    }

    fn event(&self, event: &Event) {
        self.send_frame(frame_type::EVENT, &event.encode());
    }

    fn image(&self, header: &ImageHeader, data: impl AsRef<[u8]> + Send + 'static) {
        match encode_image_frame_prefix(header, data.as_ref().len()) {
            Ok(prefix) => {
                if let Some(frames) = self.frames.as_ref() {
                    let data = Box::new(data);
                    let _ = frames.send(Outgoing::Image { prefix, data });
                }
            }
            Err(size) => {
                tracing::error!(
                    "dropping image seq={} side={}: {size} bytes exceeds the frame maximum",
                    header.seq_id,
                    header.scan_side,
                );
                self.event(&Event::OversizedImage {
                    seq_id: header.seq_id,
                    scan_side: header.scan_side,
                    size: i64::try_from(size).unwrap_or(i64::MAX),
                });
            }
        }
    }
}

enum Input {
    Command(Command),
    DriverEvent(driver::Event),
    Malformed(DecodeError),
    Closed,
    /// SIGINT or SIGTERM; disconnect cleanly so the scanner accepts the next connection at once.
    Terminate,
}

/// Reads command frames from stdin and hands them to the main loop.
fn spawn_input_reader<R: Read + Send + 'static>(mut reader: R, tx: Sender<Input>) {
    std::thread::spawn(move || {
        loop {
            let mut header = [0u8; FRAME_HEADER_LENGTH];
            if reader.read_exact(&mut header).is_err() {
                let _ = tx.send(Input::Closed);
                return;
            }
            let (frame_type, length) = match decode_frame_header(&header) {
                Ok(header) => header,
                Err(error) => {
                    let _ = tx.send(Input::Malformed(error));
                    return;
                }
            };
            let mut payload = vec![0u8; length as usize];
            if reader.read_exact(&mut payload).is_err() {
                let _ = tx.send(Input::Closed);
                return;
            }
            if frame_type != frame_type::COMMAND {
                tracing::warn!("ignoring unexpected frame type {frame_type} from client");
                continue;
            }
            let input = match Command::decode(&payload) {
                Ok(command) => Input::Command(command),
                Err(error) => Input::Malformed(error),
            };
            let is_fatal = matches!(input, Input::Malformed(_));
            if tx.send(input).is_err() || is_fatal {
                return;
            }
        }
    });
}

/// Moves driver events onto the main loop's channel until the driver is dropped.
fn spawn_event_forwarder(events: Receiver<driver::Event>, tx: Sender<Input>) {
    std::thread::spawn(move || {
        for event in events {
            if tx.send(Input::DriverEvent(event)).is_err() {
                return;
            }
        }
    });
}

#[derive(Debug, PartialEq, Eq)]
enum Flow {
    Continue,
    Exit,
    LostScanner,
}

/// Owns the driver connection, if any, and turns commands into calls on it.
struct Session {
    library: PathBuf,
    output: Output,
    inputs: Sender<Input>,
    driver: Option<Driver>,
}

impl Session {
    fn new(library: PathBuf, output: Output, inputs: Sender<Input>) -> Self {
        Self {
            library,
            output,
            inputs,
            driver: None,
        }
    }

    fn handle(&mut self, command: &Command) -> Flow {
        let id = command.id;
        tracing::debug!("command {id}: {:?}", command.body);

        let body = match &command.body {
            CommandBody::Exit => {
                self.driver = None;
                self.output.respond(id, ResponseBody::Ok);
                return Flow::Exit;
            }
            CommandBody::Connect { app_id } => self.connect(app_id),
            CommandBody::Disconnect => {
                self.driver = None;
                ResponseBody::Ok
            }
            CommandBody::GetStatus => {
                self.with_driver(|driver| Ok(ResponseBody::Status(driver.status())))
            }
            CommandBody::GetVersions => self.with_driver(|driver| {
                let api = driver.api_version()?;
                let scanner = driver.scanner_version()?;
                Ok(ResponseBody::Versions { api, scanner })
            }),
            CommandBody::GetProfile => self.with_driver(|driver| {
                driver
                    .profile()
                    .map(|profile| ResponseBody::Profile { profile })
            }),
            CommandBody::SetProfile { profile } => {
                self.with_driver(|driver| driver.set_profile(profile).map(ok))
            }
            CommandBody::SetReady { ready } => {
                self.with_driver(|driver| driver.set_ready(*ready).map(ok))
            }
            CommandBody::ScanStart => self.with_driver(|driver| driver.scan_start().map(ok)),
            CommandBody::ScanStop => self.with_driver(|driver| driver.scan_stop().map(ok)),
            CommandBody::ScanPause => self.with_driver(|driver| driver.scan_break().map(ok)),
            CommandBody::ScanResume => self.with_driver(|driver| driver.scan_continue().map(ok)),
            CommandBody::SetImprinterText { text } => {
                self.with_driver(|driver| driver.set_printer_string(text).map(ok))
            }
            CommandBody::SetCounter { index, value } => {
                self.with_driver(|driver| driver.set_counter(u32::from(*index), *value).map(ok))
            }
            CommandBody::SetNumberOfSheets { count } => {
                self.with_driver(|driver| driver.set_number_of_sheets(*count).map(ok))
            }
        };
        self.output.respond(id, body);
        Flow::Continue
    }

    fn connect(&mut self, app_id: &str) -> ResponseBody {
        if self.driver.is_some() {
            return ResponseBody::Error {
                code: ErrorCode::AlreadyConnected,
                message: String::new(),
            };
        }

        match Driver::connect(&self.library, app_id) {
            Ok((driver, events)) => {
                spawn_event_forwarder(events, self.inputs.clone());
                self.driver = Some(driver);
                ResponseBody::Ok
            }
            Err(error) => error_response(&error),
        }
    }

    fn with_driver(
        &self,
        run: impl FnOnce(&Driver) -> Result<ResponseBody, driver::Error>,
    ) -> ResponseBody {
        let Some(driver) = self.driver.as_ref() else {
            return ResponseBody::Error {
                code: ErrorCode::NotConnected,
                message: String::new(),
            };
        };
        run(driver).unwrap_or_else(|error| error_response(&error))
    }

    /// Disconnects first so no callback can queue a frame after the writer stops.
    fn shutdown(&mut self) {
        self.driver = None;
        self.output.shutdown();
    }

    fn handle_driver_event(&mut self, event: driver::Event) -> Flow {
        if self.driver.is_none() {
            return Flow::Continue;
        }
        if let driver::Event::Control(control) = &event
            && is_link_lost(control)
        {
            let message = driver::ErrorCode(control.num_data).to_string();
            tracing::error!("lost the scanner: {message}");
            self.output.event(&Event::Disconnected { message });
            return Flow::LostScanner;
        }
        match event {
            driver::Event::Image(image) => {
                self.output.image(&to_wire_header(&image), image);
            }
            driver::Event::Control(control) => self.output.event(&Event::Control {
                control_type: control.ctype,
                num_data: control.num_data,
                str_data: control.str_data_lossy().into_owned(),
            }),
            driver::Event::Log(message) => self.output.event(&Event::Log { message }),
            driver::Event::IncompatibleImage(size) => {
                self.output.event(&Event::IncompatibleImage { size });
            }
            driver::Event::OperationalState(state) => {
                self.output.event(&Event::OperationalState { state });
            }
        }
        Flow::Continue
    }
}

/// The driver reports a detached scanner only as a stream of these errors.
fn is_link_lost(control: &driver::ScannerControl) -> bool {
    control.ctype == ffi::CTYPE_ERROR && control.num_data == ffi::ERR_BEGINDATAXFER
}

fn ok((): ()) -> ResponseBody {
    ResponseBody::Ok
}

fn error_response(error: &driver::Error) -> ResponseBody {
    let code = match error {
        driver::Error::Load(_) => ErrorCode::DriverUnavailable,
        driver::Error::AlreadyConnected => ErrorCode::AlreadyConnected,
        driver::Error::InteriorNul => ErrorCode::BadRequest,
        driver::Error::Api { .. } => ErrorCode::Driver,
    };
    ResponseBody::Error {
        code,
        message: ffi::describe(error),
    }
}

fn to_wire_header(image: &driver::Image) -> ImageHeader {
    ImageHeader {
        seq_id: image.seq_id(),
        stream_id: image.stream_id(),
        scan_side: image.scan_side().into(),
        resolution: image.resolution(),
        pixels_per_line: image.pixels_per_line(),
        lines: image.lines(),
        bytes_per_line: image.bytes_per_line(),
        bits_per_pixel: image.bits_per_pixel(),
        file_format: image.file_format(),
        compression: image.compression(),
        double_feed: image.double_feed(),
        blank_page: image.blank_page(),
        integrity: image.integrity(),
        counters: image.counters(),
        endorser_front_text: image.endorser_front_text().into_owned(),
        endorser_back_text: image.endorser_back_text().into_owned(),
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use deskpro_scanner::protocol::{MAX_FRAME_PAYLOAD, decode_image};

    use super::*;

    #[derive(Clone, Default)]
    struct SharedBuffer(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedBuffer {
        fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
            self.0.lock().expect("buffer lock").extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    fn header() -> ImageHeader {
        ImageHeader {
            seq_id: 7,
            stream_id: 0,
            scan_side: 1,
            resolution: 600,
            pixels_per_line: 0,
            lines: 0,
            bytes_per_line: 0,
            bits_per_pixel: 24,
            file_format: 2,
            compression: 0,
            double_feed: 0,
            blank_page: 0,
            integrity: 0,
            counters: [0; 4],
            endorser_front_text: String::new(),
            endorser_back_text: String::new(),
        }
    }

    /// Sends one image through an [`Output`] and returns the single frame it wrote.
    fn written_frame(data: Vec<u8>) -> (u8, Vec<u8>) {
        let buffer = SharedBuffer::default();
        let mut output = Output::spawn(buffer.clone());
        output.image(&header(), data);
        output.shutdown();
        let written = buffer.0.lock().expect("buffer lock").clone();
        let (header, payload) = written.split_at(FRAME_HEADER_LENGTH);
        let (frame_type, length) =
            decode_frame_header(header.try_into().expect("whole header")).expect("valid header");
        assert_eq!(payload.len(), length as usize);
        (frame_type, payload.to_vec())
    }

    #[test]
    fn only_begin_data_transfer_errors_mean_the_link_is_lost() {
        let control = |ctype, num_data| driver::ScannerControl {
            ctype,
            num_data,
            str_data: Vec::new(),
        };
        assert!(is_link_lost(&control(
            ffi::CTYPE_ERROR,
            ffi::ERR_BEGINDATAXFER
        )));
        assert!(!is_link_lost(&control(ffi::CTYPE_ERROR, ffi::ERR_TIMEOUT)));
        assert!(!is_link_lost(&control(
            ffi::CTYPE_STATUS,
            ffi::ERR_BEGINDATAXFER
        )));
    }

    #[test]
    fn an_image_within_the_limit_is_sent() {
        let (frame_type, payload) = written_frame(vec![1, 2, 3]);
        assert_eq!(frame_type, frame_type::IMAGE);
        assert_eq!(decode_image(&payload), Ok((header(), [1, 2, 3].as_slice())));
    }

    #[test]
    fn an_oversized_image_is_dropped_and_reported() {
        let data = vec![0; MAX_FRAME_PAYLOAD as usize];
        let (frame_type, payload) = written_frame(data.clone());
        assert_eq!(frame_type, frame_type::EVENT);
        let size = encode_image_frame_prefix(&header(), data.len()).expect_err("over the limit");
        let size = i64::try_from(size).expect("fits");
        assert_eq!(
            Event::decode(&payload),
            Ok(Event::OversizedImage {
                seq_id: 7,
                scan_side: 1,
                size,
            })
        );
    }
}
