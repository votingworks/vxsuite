//! `deskpro-diag`: diagnostics for the `DeskPro` driver.
//!
//! ```sh
//! cargo run --example deskpro-diag -- probe        # can the driver load here?
//! cargo run --example deskpro-diag -- info         # versions and live status
//! cargo run --example deskpro-diag -- profile      # dump the active profile
//! cargo run --example deskpro-diag -- watch        # stream control messages and images
//! cargo run --example deskpro-diag -- scan         # start a batch and stream what comes back
//! ```

use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant};

use clap::{Parser, Subcommand};
use deskpro_scanner::driver::{Driver, Event, ProfileSchema};
use deskpro_scanner::ffi;

#[derive(Debug, Parser)]
#[command(
    name = "deskpro-diag",
    about = "Diagnostics for the InoTec DeskPro driver"
)]
struct Args {
    /// Path to the vendor `libinoapi.so`.
    #[clap(long, env = ffi::LIBRARY_PATH_ENV, default_value = ffi::DEFAULT_LIBRARY_PATH)]
    library: String,

    /// Identification string passed to `ScannerConnect`.
    #[clap(long, default_value = "deskpro-diag")]
    app_id: String,

    /// Profile schema version to declare to `ScannerConnect` (its undocumented second argument).
    /// 0 is the header-documented "lite" mode, in which `SetScannerSetup` is refused.
    #[clap(long, default_value = "210")]
    schema: i32,

    /// Oldest profile schema version to accept (`ScannerConnect`'s third argument).
    #[clap(long, default_value = "69")]
    schema_min: i32,

    #[command(subcommand)]
    command: DiagCommand,
}

#[derive(Debug, Subcommand)]
enum DiagCommand {
    /// Report whether the driver can be loaded here, and why not if it cannot. Does not connect
    /// to a scanner, so it is useful on a bare workstation.
    Probe,

    /// Connect and print the driver version, scanner version and live status.
    Info,

    /// Dump the active profile as the driver's `Section_field = value` text.
    Profile {
        /// Write to this file instead of stdout.
        #[clap(long)]
        out: Option<String>,
    },

    /// Stream control messages, log lines and image metadata until interrupted.
    Watch {
        /// Stop after this many seconds.
        #[clap(long, default_value = "60")]
        seconds: u64,

        /// Write each image's bytes to this directory as `<seqId>-<side>.bin`.
        #[clap(long)]
        save_images: Option<String>,
    },

    /// `SetReady(1)`, `ScanStart`, then stream like `watch` until the batch ends; `ScanStop` at the end.
    Scan {
        /// Stop after this many seconds even if the batch hasn't ended.
        #[clap(long, default_value = "60")]
        timeout: u64,

        /// Write each image's bytes to this directory as `<seqId>-<side>.bin`.
        #[clap(long)]
        save_images: Option<String>,

        /// Send this profile file with `SetScannerSetup` first.
        #[clap(long)]
        profile_file: Option<String>,

        /// Activate this stored profile with `SelectScannerSetup` first.
        #[clap(long)]
        select: Option<String>,

        /// Call `SetNumberOfSheets` with this count before starting.
        #[clap(long)]
        sheets: Option<u32>,

        /// Wait this long after `SetReady(1)` before `ScanStart`.
        #[clap(long, default_value = "0")]
        start_delay_ms: u64,

        /// Skip `SetReady(1)`.
        #[clap(long)]
        no_ready: bool,

        /// Skip `ScanStart`: prepare the scanner and wait for it to start on its own (the play
        /// button).
        #[clap(long)]
        no_start: bool,
    },

    /// List the profiles the scanner holds (`GetScannerSetupListSync`).
    Profiles,

    /// Dump the scanner's default profile (`GetScannerSetupDefault`).
    DefaultProfile {
        /// Write to this file instead of stdout.
        #[clap(long)]
        out: Option<String>,
    },

    /// Activate a stored profile by name (`SelectScannerSetup`).
    Select { name: String },

    /// Send a profile file to the scanner (`SetScannerSetup`).
    SetProfile { file: String },

    /// Pull the scanner's log files into a directory (`GetLastLogs` / `GetAllLogs`).
    Logs {
        /// Directory to write into.
        #[clap(long, default_value = "./scanner-logs")]
        out: String,

        /// Every log file, not just the latest.
        #[clap(long)]
        all: bool,

        /// Give up after this many seconds.
        #[clap(long, default_value = "120")]
        timeout: u64,
    },
}

fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;
    let args = Args::parse();

    match &args.command {
        DiagCommand::Probe => probe(&args.library),
        DiagCommand::Info => info(&args),
        DiagCommand::Profile { out } => profile(&args, out.as_deref()),
        DiagCommand::Watch {
            seconds,
            save_images,
        } => watch(&args, *seconds, save_images.as_deref(), None),
        DiagCommand::Scan {
            timeout,
            save_images,
            profile_file,
            select,
            sheets,
            start_delay_ms,
            no_ready,
            no_start,
        } => watch(
            &args,
            *timeout,
            save_images.as_deref(),
            Some(&ScanSetup {
                profile_file: profile_file.as_deref(),
                select: select.as_deref(),
                sheets: *sheets,
                start_delay: Duration::from_millis(*start_delay_ms),
                ready: !no_ready,
                start: !no_start,
            }),
        ),
        DiagCommand::Profiles => {
            let (driver, _events) = connect(&args)?;
            print!("{}", driver.profile_list()?);
            Ok(())
        }
        DiagCommand::DefaultProfile { out } => {
            let (driver, _events) = connect(&args)?;
            write_profile(&driver.default_profile()?, out.as_deref())
        }
        DiagCommand::Select { name } => {
            let (driver, _events) = connect(&args)?;
            driver.select_profile(name)?;
            println!("SelectScannerSetup({name:?}) ok");
            Ok(())
        }
        DiagCommand::SetProfile { file } => {
            let (driver, _events) = connect(&args)?;
            driver.set_profile(&std::fs::read_to_string(file)?)?;
            println!("SetScannerSetup({file}) ok");
            Ok(())
        }
        DiagCommand::Logs { out, all, timeout } => logs(&args, out, *all, *timeout),
    }
}

/// Libraries `libinoapi.so` `dlopen`s at runtime, from its own directory.
const RUNTIME_DEPENDENCIES: &[(&str, &str)] = &[
    ("libinousb.so", "USB transport"),
    (
        "libinoui.so",
        "local GUI; links Qt's xcb/wayland stack, so keep `[GUI] local=off` on a headless host",
    ),
];

fn probe(library: &str) -> color_eyre::Result<()> {
    println!("library path: {library}");
    let path = Path::new(library);
    if path.exists() {
        println!("  exists:     yes");
    } else {
        println!("  exists:     NO — is the driver installed? (install_scamaxusb3.sh)");
    }

    let config = Path::new("/opt/inotec/scamaxusb3/conf/config.ini");
    println!(
        "config.ini:   {} ({})",
        config.display(),
        if config.exists() {
            "present"
        } else {
            "missing"
        }
    );

    let library_dir = path.parent().unwrap_or(Path::new("."));
    for (name, note) in RUNTIME_DEPENDENCIES {
        let present = if library_dir.join(name).exists() {
            "present"
        } else {
            "MISSING"
        };
        println!("dlopen dep:   {name} ({present}) — {note}");
    }

    print!("loading...    ");
    std::io::stdout().flush()?;
    // SAFETY: `Symbols` mirrors the driver's own headers.
    match unsafe { ffi::Symbols::load(library) } {
        Ok(_) => println!("ok, all entry points resolved"),
        Err(error) => {
            println!("FAILED");
            let text = ffi::describe(&error);
            println!("  {text}");
            if text.contains("version `GLIBC") {
                println!(
                    "  → this host's C/C++ runtime is older than the one the driver was built \
                     against"
                );
            }
        }
    }
    Ok(())
}

fn connect(args: &Args) -> color_eyre::Result<(Driver, std::sync::mpsc::Receiver<Event>)> {
    Driver::connect_with_schema(
        &args.library,
        &args.app_id,
        ProfileSchema {
            version: args.schema,
            minimum: args.schema_min,
        },
    )
    .map_err(|error| {
        color_eyre::eyre::eyre!(
            "{error}\n\nrun `deskpro-diag probe` for why the driver may not load"
        )
    })
}

fn info(args: &Args) -> color_eyre::Result<()> {
    let (driver, _events) = connect(args)?;
    println!("api version:     {}", driver.api_version()?);
    println!("scanner version: {}", driver.scanner_version()?);

    let status = driver.status();
    println!("state:               {}", status.state);
    println!("operational state:   {}", status.operational_state);
    println!("images available:    {}", status.images_available);
    println!("feeder loaded:       {}", status.feeder_loaded);
    println!("next feeder loaded:  {}", status.next_feeder_loaded);
    println!("feeder side:         {}", status.feeder_side);
    Ok(())
}

fn profile(args: &Args, out: Option<&str>) -> color_eyre::Result<()> {
    let (driver, _events) = connect(args)?;
    write_profile(&driver.profile()?, out)
}

fn write_profile(profile: &str, out: Option<&str>) -> color_eyre::Result<()> {
    match out {
        Some(path) => {
            std::fs::write(path, profile)?;
            println!("wrote {} bytes to {path}", profile.len());
        }
        None => println!("{profile}"),
    }
    Ok(())
}

type Step<'a> = Box<dyn Fn() -> Result<(), deskpro_scanner::driver::Error> + 'a>;

struct ScanSetup<'a> {
    profile_file: Option<&'a str>,
    select: Option<&'a str>,
    sheets: Option<u32>,
    start_delay: Duration,
    ready: bool,
    start: bool,
}

fn watch(
    args: &Args,
    seconds: u64,
    save_images: Option<&str>,
    scan: Option<&ScanSetup<'_>>,
) -> color_eyre::Result<()> {
    let (driver, events) = connect(args)?;
    if let Some(directory) = save_images {
        std::fs::create_dir_all(directory)?;
    }
    println!("status after connect {:?}", driver.status());
    if let Some(setup) = scan {
        let drain = |events: &std::sync::mpsc::Receiver<Event>| {
            std::thread::sleep(Duration::from_millis(200));
            while let Ok(event) = events.try_recv() {
                print_event(&event, None).ok();
            }
        };
        let steps: Vec<(String, Step<'_>)> = vec![
            (
                format!("SetScannerSetup({:?})", setup.profile_file),
                Box::new(|| match setup.profile_file {
                    Some(file) => driver.set_profile(
                        &std::fs::read_to_string(file).expect("readable profile file"),
                    ),
                    None => Ok(()),
                }),
            ),
            (
                format!("SelectScannerSetup({:?})", setup.select),
                Box::new(|| {
                    setup
                        .select
                        .map_or(Ok(()), |name| driver.select_profile(name))
                }),
            ),
            (
                format!("SetNumberOfSheets({:?})", setup.sheets),
                Box::new(|| {
                    setup
                        .sheets
                        .map_or(Ok(()), |n| driver.set_number_of_sheets(n))
                }),
            ),
            (
                format!(
                    "SetReady(1) [{}]",
                    if setup.ready { "on" } else { "skipped" }
                ),
                Box::new(|| {
                    if setup.ready {
                        driver.set_ready(true)
                    } else {
                        Ok(())
                    }
                }),
            ),
            (
                format!(
                    "ScanStart after {:?} [{}]",
                    setup.start_delay,
                    if setup.start { "on" } else { "skipped" }
                ),
                Box::new(|| {
                    if !setup.start {
                        return Ok(());
                    }
                    std::thread::sleep(setup.start_delay);
                    driver.scan_start()
                }),
            ),
        ];
        for (name, step) in steps {
            if let Err(error) = step() {
                drain(&events);
                return Err(color_eyre::eyre::eyre!("{name} failed: {error}"));
            }
            println!("{name} ok");
            drain(&events);
        }
    }

    let deadline = Instant::now() + Duration::from_secs(seconds);
    if scan.is_some() {
        println!("watching for up to {seconds}s or until the batch ends; feed sheets now");
    } else {
        println!("watching for {seconds}s; feed sheets now");
    }
    stream(&events, deadline, save_images, scan.is_some())?;

    if scan.is_some() {
        match driver.scan_stop() {
            Ok(()) => println!("ScanStop ok"),
            Err(error) => println!("ScanStop failed: {error}"),
        }
    }
    println!("done; final status {:?}", driver.status());
    Ok(())
}

fn logs(args: &Args, out: &str, all: bool, seconds: u64) -> color_eyre::Result<()> {
    let (driver, events) = connect(args)?;
    std::fs::create_dir_all(out)?;
    let out = std::fs::canonicalize(out)?;
    let out = out.to_string_lossy();
    driver.fetch_logs(&out, all)?;
    println!(
        "requested {} logs into {out}",
        if all { "all" } else { "last" }
    );

    let deadline = Instant::now() + Duration::from_secs(seconds);
    while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
        let Ok(event) = events.recv_timeout(remaining) else {
            break;
        };
        print_event(&event, None)?;
        if matches!(&event, Event::Control(c) if c.ctype == ffi::CTYPE_INOUI_TRANSFERFINISHED) {
            break;
        }
    }
    for entry in std::fs::read_dir(&*out)? {
        let entry = entry?;
        println!(
            "  {} ({} bytes)",
            entry.file_name().to_string_lossy(),
            entry.metadata()?.len()
        );
    }
    Ok(())
}

/// Prints one event the way `watch` does, saving the image when `save_images` is set.
fn stream(
    events: &std::sync::mpsc::Receiver<Event>,
    deadline: Instant,
    save_images: Option<&str>,
    stop_at_batch_end: bool,
) -> color_eyre::Result<()> {
    let mut batch = BatchTracker::default();
    while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
        let timeout = if batch.finished() {
            remaining.min(BATCH_END_GRACE)
        } else {
            remaining
        };
        let Ok(event) = events.recv_timeout(timeout) else {
            break;
        };
        print_event(&event, save_images)?;
        if stop_at_batch_end {
            batch.observe(&event);
        }
    }
    if batch.finished() {
        println!("feeder empty and scanner ready; batch finished");
    }
    Ok(())
}

/// `CTYPE_STATUS` values the scanner sends with "Ready for Scan" and "Scanning".
const STATUS_READY: u32 = 1;
const STATUS_SCANNING: u32 = 4;

/// How long to keep listening for trailing images once a batch looks finished.
const BATCH_END_GRACE: Duration = Duration::from_secs(1);

/// Recognizes the end of a batch: it was scanning, the feeder is empty and the scanner is ready.
#[derive(Default)]
struct BatchTracker {
    scanned: bool,
    feeder_empty: bool,
    ready: bool,
}

impl BatchTracker {
    fn observe(&mut self, event: &Event) {
        let Event::Control(control) = event else {
            return;
        };
        match control.ctype {
            ffi::CTYPE_STATUS => {
                self.scanned |= control.num_data == STATUS_SCANNING;
                self.ready = control.num_data == STATUS_READY;
            }
            ffi::CTYPE_FEEDER => self.feeder_empty = control.num_data == 0,
            _ => {}
        }
    }

    fn finished(&self) -> bool {
        self.scanned && self.feeder_empty && self.ready
    }
}

fn print_event(event: &Event, save_images: Option<&str>) -> color_eyre::Result<()> {
    match event {
        Event::Log(message) => println!("log      {message}"),
        Event::Control(control) => println!(
            "control  ctype={} num={} str={:?}",
            control.ctype,
            control.num_data,
            control.str_data_lossy()
        ),
        Event::OperationalState(state) => println!("opstate  {state}"),
        Event::IncompatibleImage(incompatible) => println!(
            "image    INCOMPATIBLE: driver sent {} bytes of ImageInfo_t, we expect {}",
            incompatible.size,
            size_of::<ffi::ImageInfo_t>()
        ),
        Event::Image(image) => {
            println!(
                "image    seq={} side={:?} {}x{} {}bpp res={} fmt={} bytes={} endorser={:?}",
                image.seq_id(),
                image.scan_side(),
                image.pixels_per_line(),
                image.lines(),
                image.bits_per_pixel(),
                image.resolution(),
                image.file_format(),
                image.data().len(),
                image.endorser_front_text()
            );
            if let Some(directory) = save_images {
                let name = format!("{directory}/{}-{:?}.bin", image.seq_id(), image.scan_side());
                std::fs::write(&name, image.data())?;
                println!("         saved {name}");
            }
        }
    }
    Ok(())
}
