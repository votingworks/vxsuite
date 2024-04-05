//! Daemon whose purpose is to expose signal from VSAP's input for personal
//! assistive technology (PAT) devices to the mark-scan application.
//!
//! PAT input status is made accessible in userspace with GPIO pins. The daemon
//! connects to the pins then polls their values. When a change in value is read,
//! the daemon sends a keypress event for consumption by the application.
//!
//! Notably, running this daemon is required for the mark-scan app to read PAT
//! device connection status.
use clap::Parser;
use daemon_utils::run_no_op_event_loop;
use pin::Pin;
use std::{
    io,
    process::exit,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::Duration,
};
use uinput::{
    event::{keyboard, Keyboard},
    Device,
};

use vx_logging::{log, set_app_name, types::EventType, Disposition, EventId};

mod pin;

const UINPUT_PATH: &str = "/dev/uinput";
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const APP_NAME: &str = "vx-mark-scan-pat-input-daemon";
const IS_CONNECTED_PIN: Pin = Pin::new(478);
const SIGNAL_A_PIN: Pin = Pin::new(481);
const SIGNAL_B_PIN: Pin = Pin::new(476);

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Allow the daemon to run if no hardware is found.
    #[arg(short, long)]
    skip_hardware_check: bool,
}

fn send_key(device: &mut Device, key: keyboard::Key) -> Result<(), uinput::Error> {
    device.click(&key)?;
    device.synchronize()?;
    Ok(())
}

fn create_virtual_device() -> Device {
    uinput::open(UINPUT_PATH)
        .unwrap()
        .name("PAT Input Daemon Virtual Device")
        .unwrap()
        .event(Keyboard::All)
        .unwrap()
        .create()
        .unwrap()
}

fn set_up_pins() -> io::Result<()> {
    IS_CONNECTED_PIN.set_up()?;
    SIGNAL_A_PIN.set_up()?;
    SIGNAL_B_PIN.set_up()?;
    Ok(())
}

fn main() {
    let args = Args::parse();

    set_app_name(APP_NAME);
    log!(EventId::ProcessStarted; EventType::SystemAction);

    let running = Arc::new(AtomicBool::new(true));

    if let Err(e) = ctrlc::set_handler({
        let running = running.clone();
        move || {
            running.store(false, Ordering::SeqCst);
        }
    }) {
        log!(
            event_id: EventId::ErrorSettingSigintHandler,
            message: e.to_string(),
            event_type: EventType::SystemStatus
        );
    }

    // Create virtual device for keypress events
    log!(EventId::CreateVirtualUinputDeviceInit; EventType::SystemAction);
    let mut device = create_virtual_device();
    // Wait for virtual device to register
    thread::sleep(Duration::from_secs(1));
    log!(
        event_id: EventId::CreateVirtualUinputDeviceComplete,
        disposition: Disposition::Success,
        event_type: EventType::SystemAction
    );

    log!(EventId::ConnectToPatInputInit);

    // Export pins and set direction
    if let Err(err) = set_up_pins() {
        log!(
            event_id: EventId::ConnectToPatInputComplete,
            disposition: Disposition::Failure,
            message: format!("An error occurred during GPIO pin connection: {err}")
        );

        if args.skip_hardware_check {
            run_no_op_event_loop(&running);
            exit(0);
        }
        exit(1);
    };

    // is_connected is unused for keypresses in this daemon but it's important to export
    // the pin so it can be read by the mark-scan backend
    let is_connected = IS_CONNECTED_PIN.is_active();
    let mut signal_a = SIGNAL_A_PIN.is_active();
    let mut signal_b = SIGNAL_B_PIN.is_active();

    log!(
        EventId::ConnectToPatInputInit,
        "Connected to PAT with initial values [is_connected={is_connected}], [signal_a={signal_a}], [signal_b={signal_b}]"
    );

    loop {
        if !running.load(Ordering::SeqCst) {
            log!(EventId::ProcessTerminated; EventType::SystemAction);
            IS_CONNECTED_PIN.tear_down();
            SIGNAL_A_PIN.tear_down();
            SIGNAL_B_PIN.tear_down();
            exit(0);
        }

        let new_signal_a = SIGNAL_A_PIN.is_active();
        let new_signal_b = SIGNAL_B_PIN.is_active();

        if new_signal_a && !signal_a {
            if let Err(err) = send_key(&mut device, keyboard::Key::_1) {
                log!(
                    EventId::PatDeviceError,
                    "Error sending 1 keypress event: {err}"
                );
            }
        }
        if new_signal_b && !signal_b {
            if let Err(err) = send_key(&mut device, keyboard::Key::_2) {
                log!(
                    EventId::PatDeviceError,
                    "Error sending 2 keypress event: {err}"
                );
            }
        }

        signal_a = new_signal_a;
        signal_b = new_signal_b;

        thread::sleep(POLL_INTERVAL);
    }
}
