//! Daemon whose purpose is to expose signal from VSAP's accessible controller
//! to the mark-scan application.
//!
//! Signal from the accessible controller is available in userspace over
//! the serialport protocol. The daemon connects to the controller and polls
//! for change in signal value. When a button press is detected, it sends
//! a keypress event for consumption by the mark-scan application.

use clap::Parser;
use daemon_utils::run_no_op_event_loop;
use std::{
    io::{self, Read},
    process::exit,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::sleep,
    time::Duration,
};
use uinput::event::keyboard;
use vx_logging::{log, set_app_name, Disposition, EventId, EventType};

use crate::{
    commands::handle_command,
    device::{create_keyboard, VirtualKeyboard},
    port::Port,
};

mod commands;
mod device;
mod port;

const APP_NAME: &str = "vx-mark-scan-controller-daemon";
const KPB_200_FW_VID: u16 = 0x28cd;
const KPB_200_FW_PID: u16 = 0x4008;
const STARTUP_SLEEP_DURATION: Duration = Duration::from_millis(3000);

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Allow the daemon to run if no hardware is found.
    #[arg(short, long)]
    skip_hardware_check: bool,
}

fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;
    // Give the controller device time to register with the OS. The echo command
    // will sometimes fail without this pause.
    sleep(STARTUP_SLEEP_DURATION);

    let args = Args::parse();
    set_app_name(APP_NAME);
    log!(
        EventId::ProcessStarted;
        EventType::SystemAction
    );

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
    log!(
        EventId::CreateVirtualUinputDeviceInit;
        EventType::SystemAction
    );
    let keyboard = create_keyboard("Accessible Controller Daemon Virtual Device")?;
    log!(
        event_id: EventId::CreateVirtualUinputDeviceComplete,
        disposition: Disposition::Success,
        event_type: EventType::SystemAction
    );

    log!(
        EventId::ControllerConnectionInit;
        EventType::SystemAction
    );

    if let Some(port) = get_port() {
        run_event_loop(keyboard, port, &running);
        exit(0);
    }

    if args.skip_hardware_check {
        run_no_op_event_loop(&running);
        exit(0);
    }

    log!(
        event_id: EventId::ProcessTerminated,
        event_type: EventType::SystemStatus,
        message: "Could not connect to ATI controller".to_string()
    );
    exit(1);
}

fn get_port() -> Option<Port> {
    match Port::open_by_ids(KPB_200_FW_VID, KPB_200_FW_PID) {
        Ok(port) => {
            log!(
                event_id: EventId::ControllerConnectionComplete,
                message: format!("Receiving data on port: {port:?}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Success
            );

            return Some(port);
        }
        Err(e) => {
            log!(
                event_id: EventId::ControllerConnectionComplete,
                message: format!("Failed to open controller port. Error: {e}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );
        }
    }

    None
}

fn run_event_loop(mut keyboard: impl VirtualKeyboard, mut port: Port, running: &Arc<AtomicBool>) {
    let mut serial_buf = [0; 1000];
    loop {
        if !running.load(Ordering::SeqCst) {
            log!(
                EventId::ProcessTerminated;
                EventType::SystemAction
            );
            break;
        }
        match port.read(&mut serial_buf) {
            Ok(size) => on_port_data_received(&mut keyboard, &serial_buf[..size]),
            // Timeout error just means no event was sent in the current polling period
            Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
            Err(e) => {
                log!(
                    event_id: EventId::UnknownError,
                    message: format!("Unexpected error when reading from serial port: {e:?}"),
                    event_type: EventType::SystemStatus
                );
            }
        }
    }
}

fn on_port_data_received(keyboard: &mut impl VirtualKeyboard, data: &[u8]) {
    match handle_command(data) {
        Ok(Some((key, send_shift))) => {
            if let Err(err) = keyboard.send_keystroke(
                key,
                if send_shift {
                    &[keyboard::Key::LeftShift]
                } else {
                    &[]
                },
            ) {
                log!(EventId::UnknownError, "Error sending key: {err}");
            }
        }
        Ok(None) => {}
        Err(err) => log!(
            event_id: EventId::UnknownError,
            message: format!("Unexpected error when handling controller command: {err}"),
            event_type: EventType::SystemStatus
        ),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use crate::device::{Action, Button};

    use super::*;

    struct MockKeyboard {
        pub keystrokes: Vec<(keyboard::Key, Vec<keyboard::Key>)>,
    }

    impl MockKeyboard {
        pub const fn new() -> Self {
            Self {
                keystrokes: Vec::new(),
            }
        }
    }

    impl VirtualKeyboard for MockKeyboard {
        fn send_keystroke(
            &mut self,
            key: keyboard::Key,
            modifiers: &[keyboard::Key],
        ) -> Result<(), uinput::Error> {
            self.keystrokes.push((key, modifiers.to_vec()));
            Ok(())
        }
    }

    #[test]
    fn test_press_help() {
        set_app_name("test");
        let mut mock_keyboard = MockKeyboard::new();
        let data = [
            0x30,
            0x00,
            0x02,
            Button::Help as u8,
            Action::Pressed as u8,
            0xc8,
            0x37,
        ];
        on_port_data_received(&mut mock_keyboard, &data);
        assert_eq!(
            mock_keyboard.keystrokes,
            vec![(keyboard::Key::R, vec![keyboard::Key::LeftShift])]
        );
    }

    #[test]
    fn test_press_left() {
        set_app_name("test");
        let mut mock_keyboard = MockKeyboard::new();
        let data = [
            0x30,
            0x00,
            0x02,
            Button::Left as u8,
            Action::Pressed as u8,
            0xd8,
            0x09,
        ];
        on_port_data_received(&mut mock_keyboard, &data);
        assert_eq!(
            mock_keyboard.keystrokes,
            vec![(keyboard::Key::Left, vec![])]
        );
    }
}
