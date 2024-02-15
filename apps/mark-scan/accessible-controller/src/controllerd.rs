use serialport::{self, SerialPort};
use std::{
    io,
    process::exit,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};
use uinput::{
    event::{keyboard, Keyboard},
    Device,
};
use vx_logging::{log, set_app_name, Disposition, EventId, EventType};

const APP_NAME: &str = "vx-mark-scan-controller-daemon";
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const MAX_ECHO_RESPONSE_WAIT: Duration = Duration::from_secs(5);
const UINPUT_PATH: &str = "/dev/uinput";
const DEVICE_PATH: &str = "/dev/ttyACM1";
const DEVICE_BAUD_RATE: u32 = 9600;

#[derive(Debug, thiserror::Error)]
enum CommandError {
    #[error("Unexpected command data length: {0}")]
    UnexpectedPacketSize(usize),
    #[error("Unexpected data length reported: {0}")]
    UnexpectedDataLength(u16),
    #[error("Invalid command received: {0}")]
    InvalidCommand(u8),
    #[error("Invalid action received: {0}")]
    InvalidAction(u8),
    #[error("Error occurred when sending keypress event")]
    KeypressError(#[from] uinput::Error),
    #[error("Button value invalid: {0}")]
    InvalidButton(u8),
    #[error("Invalid CRC16 value: expected {expected:x}, actual {actual:x}")]
    InvalidCrc { expected: u16, actual: u16 },
}

#[derive(Debug, num_enum::TryFromPrimitive, Clone, Copy)]
#[repr(u8)]
enum CommandId {
    Echo = 0x10,
    ButtonStatus = 0x30,
}

#[derive(Debug)]
struct EchoCommand {
    payload: Vec<u8>,
}

impl EchoCommand {
    const fn new(payload: Vec<u8>) -> Self {
        Self { payload }
    }
}

impl From<EchoCommand> for Vec<u8> {
    fn from(command: EchoCommand) -> Self {
        let payload_length = u16::try_from(command.payload.len()).expect("Payload too large");
        let mut bytes = Self::new();
        bytes.push(CommandId::Echo as u8);
        bytes.extend_from_slice(&payload_length.to_be_bytes());
        bytes.extend(command.payload);
        bytes.extend_from_slice(&crc16::State::<crc16::XMODEM>::calculate(&bytes).to_be_bytes());
        bytes
    }
}

fn validate_payload_length(
    payload_length: u16,
    bytes: &[u8],
    non_payload_bytes: usize,
) -> Result<(), CommandError> {
    if payload_length as usize != bytes.len() - non_payload_bytes {
        return Err(CommandError::UnexpectedDataLength(payload_length));
    }

    Ok(())
}

impl TryFrom<&[u8]> for EchoCommand {
    type Error = CommandError;

    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        const NON_PAYLOAD_BYTES: usize = 5;
        const PAYLOAD_OFFSET: usize = 3;

        if bytes.len() < NON_PAYLOAD_BYTES {
            return Err(CommandError::UnexpectedPacketSize(bytes.len()));
        }

        match CommandId::try_from(bytes[0]) {
            Ok(CommandId::Echo) => (),
            _ => return Err(CommandError::InvalidCommand(bytes[0])),
        }

        let payload_length = u16::from_be_bytes([bytes[1], bytes[2]]);
        validate_payload_length(payload_length, bytes, NON_PAYLOAD_BYTES)?;

        let expected_crc = u16::from_be_bytes([bytes[5], bytes[6]]);
        let actual_crc = crc16::State::<crc16::XMODEM>::calculate(
            &bytes[..PAYLOAD_OFFSET + payload_length as usize],
        );

        if expected_crc != actual_crc {
            return Err(CommandError::InvalidCrc {
                expected: expected_crc,
                actual: actual_crc,
            });
        }

        Ok(Self {
            payload: bytes[PAYLOAD_OFFSET..PAYLOAD_OFFSET + payload_length as usize].to_vec(),
        })
    }
}

#[derive(Debug)]
struct ButtonStatusCommand {
    button: Button,
    action: Action,
}

impl From<ButtonStatusCommand> for Vec<u8> {
    fn from(command: ButtonStatusCommand) -> Self {
        let mut bytes = Self::new();
        bytes.push(CommandId::ButtonStatus as u8);
        bytes.extend_from_slice(&2u16.to_be_bytes());
        bytes.push(command.button as u8);
        bytes.push(command.action as u8);
        bytes.extend_from_slice(&crc16::State::<crc16::XMODEM>::calculate(&bytes).to_be_bytes());
        bytes
    }
}

impl TryFrom<&[u8]> for ButtonStatusCommand {
    type Error = CommandError;

    // The expected format of a data packet for key status command is 7 bytes total:
    // 1 byte command ID, constant 0x30
    // 2 bytes payload size, constant 0x0002
    // 1 byte key ID
    // 1 byte key status
    // 2 bytes CRC validation value
    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        const NON_PAYLOAD_BYTES: usize = 5;
        const PAYLOAD_OFFSET: usize = 3;

        if bytes.len() < NON_PAYLOAD_BYTES {
            return Err(CommandError::UnexpectedPacketSize(bytes.len()));
        }

        match CommandId::try_from(bytes[0]) {
            Ok(CommandId::ButtonStatus) => (),
            _ => return Err(CommandError::InvalidCommand(bytes[0])),
        }

        let payload_length = u16::from_be_bytes([bytes[1], bytes[2]]);
        validate_payload_length(payload_length, bytes, NON_PAYLOAD_BYTES)?;

        let expected_crc = u16::from_be_bytes([bytes[5], bytes[6]]);
        let actual_crc = crc16::State::<crc16::XMODEM>::calculate(
            &bytes[..PAYLOAD_OFFSET + payload_length as usize],
        );

        if expected_crc != actual_crc {
            return Err(CommandError::InvalidCrc {
                expected: expected_crc,
                actual: actual_crc,
            });
        }

        let button =
            Button::try_from(bytes[3]).map_err(|err| CommandError::InvalidButton(err.number))?;
        let action =
            Action::try_from(bytes[4]).map_err(|err| CommandError::InvalidAction(err.number))?;

        Ok(Self { button, action })
    }
}

#[derive(Debug, num_enum::TryFromPrimitive, PartialEq)]
#[repr(u8)]
enum Button {
    RateUp = 0x00,
    RateDown = 0x01,
    Select = 0x02,
    VolumeUp = 0x03,
    VolumeDown = 0x04,
    Right = 0x05,
    Left = 0x06,
    Up = 0x07,
    Down = 0x08,
    Help = 0x09,
    Pause = 0x0A,
}

#[derive(Debug, num_enum::TryFromPrimitive)]
#[repr(u8)]
enum Action {
    Released = 0x00,
    Pressed = 0x01,
}

fn send_key(device: &mut Device, key: keyboard::Key) -> Result<(), CommandError> {
    device.click(&key)?;
    device.synchronize()?;
    Ok(())
}

fn handle_command(data: &[u8]) -> Result<Option<keyboard::Key>, CommandError> {
    let ButtonStatusCommand { button, action } = data.try_into()?;

    let key: keyboard::Key;
    match action {
        Action::Pressed => match button {
            Button::Select => {
                key = keyboard::Key::Enter;
            }
            Button::Left => {
                key = keyboard::Key::Left;
            }
            Button::Right => {
                key = keyboard::Key::Right;
            }
            Button::Up => {
                key = keyboard::Key::Up;
            }
            Button::Down => {
                key = keyboard::Key::Down;
            }
            Button::Help => key = keyboard::Key::R,
            Button::RateDown => {
                key = keyboard::Key::Comma;
            }
            Button::RateUp => {
                key = keyboard::Key::Dot;
            }
            Button::VolumeDown => {
                key = keyboard::Key::Minus;
            }
            Button::VolumeUp => {
                key = keyboard::Key::Equal;
            }
            Button::Pause => {
                key = keyboard::Key::P;
            }
        },
        Action::Released => {
            // Button release is a no-op since we already sent the keypress event
            return Ok(None);
        }
    }
    Ok(Some(key))
}

fn validate_connection(port: &mut Box<dyn SerialPort>) -> Result<(), io::Error> {
    let echo_command = EchoCommand::new(vec![0x01, 0x02, 0x03, 0x04, 0x05]);
    let echo_command: Vec<u8> = echo_command.into();
    match port.write(&echo_command) {
        Ok(_) => log!(EventId::ControllerHandshakeInit; EventType::SystemAction),
        Err(error) => eprintln!("{error:?}"),
    }

    let mut serial_buf: Vec<u8> = vec![0; 20];

    let start_time = Instant::now();
    loop {
        match port.read(serial_buf.as_mut_slice()) {
            Ok(size) => {
                let echo_response = &serial_buf[..size];
                assert_eq!(
                    echo_command, echo_response,
                    "Received different response from echo command: {echo_response:x?}"
                );

                log!(
                    event_id: EventId::ControllerHandshakeComplete,
                    event_type: EventType::SystemAction,
                    disposition: Disposition::Success
                );
                return Ok(());
            }
            Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
            Err(e) => {
                log!(
                    event_id: EventId::ControllerHandshakeComplete,
                    message: format!("Error reading echo response: {e:?}"),
                    event_type: EventType::SystemAction,
                    disposition: Disposition::Failure
                );
            }
        }

        if start_time.elapsed() >= MAX_ECHO_RESPONSE_WAIT {
            break;
        }

        thread::sleep(POLL_INTERVAL);
    }

    log!(
        event_id: EventId::ControllerHandshakeComplete,
        message: "No echo response received".to_string(),
        event_type: EventType::SystemAction,
        disposition: Disposition::Failure
    );
    Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "No echo response received",
    ))
}

fn create_virtual_device() -> Device {
    uinput::open(UINPUT_PATH)
        .unwrap()
        .name("Accessible Controller Daemon Virtual Device")
        .unwrap()
        .event(Keyboard::All)
        .unwrap()
        .create()
        .unwrap()
}

fn main() {
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
    let mut device = create_virtual_device();
    // Wait for virtual device to register
    thread::sleep(Duration::from_secs(1));
    log!(
        event_id: EventId::CreateVirtualUinputDeviceComplete,
        disposition: Disposition::Success,
        event_type: EventType::SystemAction
    );

    log!(
        EventId::ControllerConnectionInit;
        EventType::SystemAction
    );

    // Open the serial port
    let port = serialport::new(DEVICE_PATH, DEVICE_BAUD_RATE)
        .timeout(POLL_INTERVAL)
        .open();

    match port {
        Ok(mut port) => {
            validate_connection(&mut port).unwrap();

            log!(
                event_id: EventId::ControllerConnectionComplete,
                message: format!("Receiving data on {DEVICE_PATH} at {DEVICE_BAUD_RATE} baud"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Success
            );

            let mut serial_buf: Vec<u8> = vec![0; 1000];
            loop {
                if !running.load(Ordering::SeqCst) {
                    log!(
                        EventId::ProcessTerminated;
                        EventType::SystemAction
                    );
                    exit(0);
                }
                match port.read(serial_buf.as_mut_slice()) {
                    Ok(size) => match handle_command(&serial_buf[..size]) {
                        Ok(Some(key)) => {
                            if let Err(err) = send_key(&mut device, key) {
                                log!(EventId::UnknownError, "Error sending key: {err}");
                            }
                        }
                        Ok(None) => {}
                        Err(err) => log!(
                            event_id: EventId::UnknownError,
                            message: format!(
                                "Unexpected error when handling controller command: {err}"
                            ),
                            event_type: EventType::SystemStatus
                        ),
                    },
                    // Timeout error just means no event was sent in the current polling period
                    Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
                    Err(e) => {
                        log!(
                            event_id: EventId::UnknownError,
                            message: format!("Unexpected error when opening serial port: {e}"),
                            event_type: EventType::SystemStatus
                        );
                    }
                }
            }
        }
        Err(e) => {
            log!(
                event_id: EventId::ControllerConnectionComplete,
                message: format!("Failed to open {DEVICE_PATH}. Error: {e}"),
                event_type: EventType::SystemAction,
                disposition: Disposition::Failure
            );
            exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_command_packet_length_error() {
        let bad_data = [0x01];
        match handle_command(&bad_data) {
            Err(CommandError::UnexpectedPacketSize(size)) => assert_eq!(size, 1),
            result => panic!("Unexpected result: {result:?}"),
        }
    }

    #[test]
    fn test_handle_command_data_length() {
        let bad_data_length: u8 = 0x03;
        let bad_data = [0x30, 0x00, bad_data_length, 0x00, 0x00, 0x00, 0x00];
        match handle_command(&bad_data) {
            Err(CommandError::UnexpectedDataLength(length)) => {
                assert_eq!(length, bad_data_length as u16)
            }
            result => panic!("Unexpected result: {result:?}"),
        }
    }

    #[test]
    fn test_handle_command_success() {
        let data = [
            0x30,
            0x00,
            0x02,
            Button::Help as u8,
            Action::Pressed as u8,
            0xc8,
            0x37,
        ];
        assert_eq!(handle_command(&data).unwrap().unwrap(), keyboard::Key::R);
    }
}
