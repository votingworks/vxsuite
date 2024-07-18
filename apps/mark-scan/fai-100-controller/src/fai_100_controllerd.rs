//! Daemon whose purpose is to expose signal from VSAP's FAI-100 accessible controller
//! to the mark-scan application.
//!
//! Signal from the accessible controller is available in userspace over
//! the serialport protocol. The daemon connects to the controller and polls
//! for change in signal value. When a button press is detected, it sends
//! a keypress event for consumption by the mark-scan application.

use clap::Parser;
use commands::{
    ButtonSignal, CommandError, NotificationStatusResponse, SipAndPuffDeviceStatus,
    SipAndPuffSignalStatus, VersionResponse, NOTIFICATION_STATUS_RESPONSE_BYTE_LENGTH,
};
use daemon_utils::run_no_op_event_loop;
use std::{
    fs::OpenOptions,
    io::{self, Read},
    path::PathBuf,
    process::exit,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread::sleep,
    time::{Duration, Instant},
};
use uinput::event::keyboard;
use usb_device::UsbDevice;
use virtual_keyboard::{create_keyboard, VirtualKeyboard};
use vx_logging::{log, set_app_name, Disposition, EventId, EventType};

mod commands;
mod usb_device;
mod virtual_keyboard;

const APP_NAME: &str = "vx-mark-scan-fai-100-controller-daemon";
const FAI_100_VID: u16 = 0x28cd;
const FAI_100_PID: u16 = 0x4002;
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const EVENT_LOOP_LOG_INTERVAL: Duration = Duration::from_secs(1);
const BUFFER_MAX_BYTES: usize = 64;
const PAT_CONNECTION_STATUS_FILENAME: &str = "_pat_connection.status";
use std::io::Write;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Allow the daemon to run if no hardware is found.
    #[arg(short, long)]
    skip_hardware_check: bool,

    /// Path to the directory where MarkScan's working files are stored.
    #[arg(long, env = "MARK_SCAN_WORKSPACE")]
    mark_scan_workspace: PathBuf,
}

fn write_pat_connection_status(
    status: SipAndPuffDeviceStatus,
    workspace_path: &PathBuf,
) -> Result<(), io::Error> {
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(workspace_path.join(PAT_CONNECTION_STATUS_FILENAME))?;
    // For consistency with the BMD 155 integration, "0" means a PAT device is connected and "1" means no device is connected
    let value: &str = match status {
        SipAndPuffDeviceStatus::Connected => "0",
        SipAndPuffDeviceStatus::Disconnected => "1",
    };
    file.write_all(value.as_bytes())?;

    Ok(())
}

fn main() -> color_eyre::Result<()> {
    color_eyre::install()?;

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
    let mut keyboard = create_keyboard("FAI 100 Accessible Controller Daemon Virtual Device")?;
    log!(
        event_id: EventId::CreateVirtualUinputDeviceComplete,
        disposition: Disposition::Success,
        event_type: EventType::SystemAction
    );

    log!(
        EventId::ControllerConnectionInit;
        EventType::SystemAction
    );

    if let Some(mut port) = get_usb_device() {
        log!(
            event_id: EventId::Info,
            disposition: Disposition::Success,
            event_type: EventType::SystemStatus,
            message: ("Connected to port successfully").to_string()
        );

        if let Err(err) = validate_connection(&mut port) {
            log!(
                event_id: EventId::ControllerHandshakeComplete,
                message: err.to_string(),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );

            exit(1);
        }

        run_event_loop(
            &mut port,
            &running,
            &mut keyboard,
            &args.mark_scan_workspace,
        );
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

fn get_usb_device() -> Option<UsbDevice> {
    match UsbDevice::open_and_claim(FAI_100_VID, FAI_100_PID) {
        Ok(port) => {
            log!(
                event_id: EventId::ControllerConnectionComplete,
                event_type: EventType::SystemAction,
                disposition: Disposition::Success
            );

            return Some(port);
        }
        Err(e) => {
            log!(
                event_id: EventId::ControllerConnectionComplete,
                message: format!("Failed to open controller device. Error: {e}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );
        }
    }

    None
}

fn validate_connection(usb_device: &mut UsbDevice) -> Result<(), io::Error> {
    log!(
        event_id: EventId::ControllerHandshakeInit,
        event_type: EventType::SystemAction
    );

    let version_cmd = create_command!(GetFirmwareVersion);
    let version_cmd: Vec<u8> = version_cmd.into();

    match usb_device.write(&version_cmd) {
        Ok(num_bytes) => log!(
            event_id: EventId::Info,
            message: format!("validate_connection: {num_bytes} bytes written"),
            event_type: EventType::SystemAction
        ),
        Err(e) => log!(
            event_id: EventId::UnknownError,
            message: format!("validate_connection unexpected error when writing command: {e:?}"),
            event_type: EventType::SystemStatus
        ),
    }
    let _ = usb_device.flush();

    let mut buf = [0; BUFFER_MAX_BYTES];
    match usb_device.read(&mut buf) {
        Ok(size) => match VersionResponse::try_from(&buf[..size]) {
            Ok(response) => {
                log!(
                    event_id: EventId::ControllerHandshakeComplete,
                    event_type: EventType::SystemAction,
                    disposition: Disposition::Success,
                    message: format!("Version: {:x}", response.version)
                );
                return Ok(());
            }
            Err(error) => {
                log!(
                    event_id: EventId::ControllerHandshakeComplete,
                    event_type: EventType::SystemAction,
                    disposition: Disposition::Failure,
                    message: format!("Error reading GetFirmwareVersion response: {error}")
                );
            }
        },
        Err(ref e) if e.kind() == io::ErrorKind::TimedOut => {
            println!("No data received from IN ENDPOINT");
        }
        Err(e) => {
            log!(
                event_id: EventId::ControllerHandshakeComplete,
                message: format!("Error reading echo response: {e:?}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );
        }
    }

    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "No echo response received",
    ))
}

#[derive(Debug)]
struct CurrentStatus {
    button_pressed: ButtonSignal,
    sip: SipAndPuffSignalStatus,
    puff: SipAndPuffSignalStatus,
    sip_puff_device_connected: SipAndPuffDeviceStatus,
}

struct KeypressSpec {
    key: keyboard::Key,
    send_shift: bool,
}

const fn get_key_for_button_signal(signal: &ButtonSignal) -> Option<KeypressSpec> {
    let key: keyboard::Key;
    let mut send_shift: bool = false;

    match signal {
        ButtonSignal::Select => {
            key = keyboard::Key::Enter;
        }
        ButtonSignal::Left => {
            key = keyboard::Key::Left;
        }
        ButtonSignal::Right => {
            key = keyboard::Key::Right;
        }
        ButtonSignal::Up => {
            key = keyboard::Key::Up;
        }
        ButtonSignal::Down => {
            key = keyboard::Key::Down;
        }
        ButtonSignal::Help => {
            send_shift = true;
            key = keyboard::Key::R;
        }
        ButtonSignal::RateDown => {
            key = keyboard::Key::Comma;
        }
        ButtonSignal::RateUp => {
            key = keyboard::Key::Dot;
        }
        ButtonSignal::VolumeDown => {
            key = keyboard::Key::Minus;
        }
        ButtonSignal::VolumeUp => {
            key = keyboard::Key::Equal;
        }
        ButtonSignal::Pause | ButtonSignal::Play => {
            send_shift = true;
            key = keyboard::Key::P;
        }
        ButtonSignal::NoButton => return None,
    }

    Some(KeypressSpec { key, send_shift })
}

fn send_keystroke(keypress: &KeypressSpec, keyboard: &mut impl VirtualKeyboard) {
    if let Err(err) = keyboard.send_keystroke(
        keypress.key,
        if keypress.send_shift {
            &[keyboard::Key::LeftShift]
        } else {
            &[]
        },
    ) {
        log!(EventId::UnknownError, "Error sending key: {err}");
    }
}

/// Checks new status for changed statuses in button press, sip, puff, and sip & puff device connection.
/// If changing from inactive to active, sends the appropriate event (keypress or system file update).
/// If changing from active to inactive or no status change, does nothing.
fn handle_status_response(
    new_status: NotificationStatusResponse,
    current_status: &mut CurrentStatus,
    keyboard: &mut impl VirtualKeyboard,
    workspace_path: &PathBuf,
) -> Result<(), CommandError> {
    let new_button = new_status.button_pressed;
    let new_sip_status = new_status.sip_status;
    let new_puff_status = new_status.puff_status;
    let new_connection_status = new_status.sip_puff_device_connection_status;

    // When no sip & puff device is connected, the sip/puff values contradict docs.
    // +-------------------------+-------------------+-------------+
    // | Device Status           | Sip Status        | Value (Hex) |
    // +-------------------------+-------------------+-------------+
    // | Device Connected        | No Sip            | 0x00        |
    // | Device Connected        | Sip               | 0x01        |
    // | Device Not Connected    | No Sip            | 0x01        |
    // | Device Not Connected    | Sip               | 0x00        |
    // +-------------------------+-------------------+-------------+
    // To avoid processing erroneous signals, we throw out sip/puff data for a short time
    // after device connection status changes
    if new_connection_status != current_status.sip_puff_device_connected {
        current_status.sip_puff_device_connected = new_connection_status;
        current_status.sip = SipAndPuffSignalStatus::Idle;
        current_status.puff = SipAndPuffSignalStatus::Idle;
        current_status.button_pressed = ButtonSignal::NoButton;

        // Write device connection status to system file so mark-scan app is aware
        write_pat_connection_status(new_connection_status, workspace_path)?;

        sleep(2 * POLL_INTERVAL);
        return Ok(());
    }

    // If the new button isn't currently being pressed (ie. this is a keydown event), send a keypress
    if new_button != current_status.button_pressed {
        // Only sends keypress when a new button is pressed.
        // This will no-op when a button is released because new_button == ButtonSignal::NoButton
        // get_key_for_button_signal(ButtonSignal::NoButton) returns None
        if let Some(keypress_spec) = get_key_for_button_signal(&new_button) {
            send_keystroke(&keypress_spec, keyboard);
        }
    }
    // Update the currently pressed button so subsequent identical status reports won't trigger a second keypress
    current_status.button_pressed = new_button;

    // Only check for sip & puff actions when the device is connected because
    // sip/puff values are inverted when no device is connected, per comment above.
    // Even if values were consistent, logically no sip/puff signal can be sent without a
    // connected device.
    if current_status.sip_puff_device_connected == SipAndPuffDeviceStatus::Connected {
        // Send keypress for new sip event
        if new_sip_status == SipAndPuffSignalStatus::Active
            && current_status.sip == SipAndPuffSignalStatus::Idle
        {
            send_keystroke(
                &KeypressSpec {
                    key: keyboard::Key::_1,
                    send_shift: false,
                },
                keyboard,
            );
        }
        current_status.sip = new_sip_status;

        // Send keypress for new puff event
        if new_puff_status == SipAndPuffSignalStatus::Active
            && current_status.puff == SipAndPuffSignalStatus::Idle
        {
            send_keystroke(
                &KeypressSpec {
                    key: keyboard::Key::_2,
                    send_shift: false,
                },
                keyboard,
            );
        }
        current_status.puff = new_puff_status;
    }

    Ok(())
}

fn run_event_loop(
    usb_device: &mut UsbDevice,
    running: &Arc<AtomicBool>,
    keyboard: &mut impl VirtualKeyboard,
    workspace_path: &PathBuf,
) {
    let mut buf: [u8; BUFFER_MAX_BYTES] = [0; BUFFER_MAX_BYTES];

    log!(
        event_id: EventId::Info,
        message: "Starting event loop".to_string(),
        event_type: EventType::SystemAction
    );

    let mut last_log_time = Instant::now();
    let mut current_status = CurrentStatus {
        button_pressed: ButtonSignal::NoButton,
        sip: SipAndPuffSignalStatus::Idle,
        puff: SipAndPuffSignalStatus::Idle,
        sip_puff_device_connected: SipAndPuffDeviceStatus::Connected,
    };

    loop {
        if !running.load(Ordering::SeqCst) {
            log!(
                EventId::ProcessTerminated;
                EventType::SystemAction
            );
            break;
        }

        if last_log_time.elapsed() > EVENT_LOOP_LOG_INTERVAL {
            log!(EventId::Info, "Polling for status");
            last_log_time = Instant::now();
        }

        let get_notifications_command = create_command!(GetNotificationValues);
        let get_notifications_command: Vec<u8> = get_notifications_command.into();
        match usb_device.write(&get_notifications_command) {
            Ok(_) => (),
            Err(e) => log!(
                event_id: EventId::UnknownError,
                message: format!("Unexpected error when writing get_notifications_command: {e:?}"),
                event_type: EventType::SystemStatus
            ),
        }
        let _ = usb_device.flush();

        match usb_device.read(&mut buf) {
            Ok(_) => {
                let data = &buf[..NOTIFICATION_STATUS_RESPONSE_BYTE_LENGTH];
                match NotificationStatusResponse::try_from(data) {
                    Ok(response) => {
                        if let Err(e) = handle_status_response(
                            response,
                            &mut current_status,
                            keyboard,
                            workspace_path,
                        ) {
                            log!(
                                event_id: EventId::UnknownError,
                                message: format!("Unexpected error when handling status response: {e:?}"),
                                event_type: EventType::SystemStatus
                            );
                        }
                    }
                    Err(e) => log!(
                        event_id: EventId::UnknownError,
                        message: format!("Unexpected error when parsing status response from raw data: {e:?}"),
                        event_type: EventType::SystemStatus
                    ),
                }
            }
            // Timeout error just means no event was sent in the current polling period
            Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
            Err(e) => {
                log!(
                    event_id: EventId::UnknownError,
                    message: format!("Unexpected error when reading from bulk endpoint: {e:?}"),
                    event_type: EventType::SystemStatus
                );
            }
        }

        sleep(POLL_INTERVAL);
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use std::env::temp_dir;

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

        let current_status = &mut CurrentStatus {
            button_pressed: ButtonSignal::NoButton,
            sip: SipAndPuffSignalStatus::Idle,
            puff: SipAndPuffSignalStatus::Idle,
            sip_puff_device_connected: SipAndPuffDeviceStatus::Disconnected,
        };
        let new_status = NotificationStatusResponse {
            button_pressed: ButtonSignal::Help,
            sip_status: SipAndPuffSignalStatus::Idle,
            puff_status: SipAndPuffSignalStatus::Idle,
            sip_puff_device_connection_status: SipAndPuffDeviceStatus::Disconnected,
        };

        handle_status_response(new_status, current_status, &mut mock_keyboard, &temp_dir())
            .unwrap();

        assert_eq!(
            mock_keyboard.keystrokes,
            vec![(keyboard::Key::R, vec![keyboard::Key::LeftShift])]
        );
    }

    #[test]
    fn test_press_left() {
        set_app_name("test");
        let mut mock_keyboard = MockKeyboard::new();

        let current_status = &mut CurrentStatus {
            button_pressed: ButtonSignal::NoButton,
            sip: SipAndPuffSignalStatus::Idle,
            puff: SipAndPuffSignalStatus::Idle,
            sip_puff_device_connected: SipAndPuffDeviceStatus::Disconnected,
        };
        let new_status = NotificationStatusResponse {
            button_pressed: ButtonSignal::Left,
            sip_status: SipAndPuffSignalStatus::Idle,
            puff_status: SipAndPuffSignalStatus::Idle,
            sip_puff_device_connection_status: SipAndPuffDeviceStatus::Disconnected,
        };

        handle_status_response(new_status, current_status, &mut mock_keyboard, &temp_dir())
            .unwrap();

        assert_eq!(
            mock_keyboard.keystrokes,
            vec![(keyboard::Key::Left, vec![])]
        );
    }
}
