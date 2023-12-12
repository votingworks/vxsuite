use serialport::{self, SerialPort};
use std::{fmt::Display, io, thread, time::Duration};
use uinput::{event::keyboard, Device};

const POLL_INTERVAL_MS: u64 = 10;
const UINPUT_PATH: &str = "/dev/uinput";
const DEVICE_PATH: &str = "/dev/ttyACM1";
const DEVICE_BAUD_RATE: u32 = 9600;
const EXPECTED_PACKET_LEGNTH: usize = 7;

#[derive(Debug, PartialEq, thiserror::Error)]
enum ParseError {
    #[error("Unexpected command data length: {0}")]
    UnexpectedPacketSize(usize),
    #[error("Unexpected data length reported: {0}")]
    UnexpectedDataLength(u16),
    #[error("Invalid command received: {0}")]
    InvalidCommand(u8),
    #[error("Invalid action received: {0}")]
    InvalidAction(u8),
    #[error("Error occurred when sending keypress event")]
    KeypressError(),
    #[error("Button value invalid: {0}")]
    Button(#[from] ButtonError),
}

#[derive(Debug, PartialEq, thiserror::Error)]
struct ButtonError {
    invalid_code: u8,
}

impl Display for ButtonError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Invalid button code {}", self.invalid_code)
    }
}

enum CommandId {
    Echo = 0x10,
    ButtonStatus = 0x30,
}

impl TryFrom<u8> for CommandId {
    type Error = ParseError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x10 => Ok(CommandId::Echo),
            0x30 => Ok(CommandId::ButtonStatus),
            _ => Err(ParseError::InvalidCommand(value)),
        }
    }
}

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

impl TryFrom<u8> for Button {
    type Error = ButtonError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x00 => Ok(Button::RateUp),
            0x01 => Ok(Button::RateDown),
            0x02 => Ok(Button::Select),
            0x03 => Ok(Button::VolumeUp),
            0x04 => Ok(Button::VolumeDown),
            0x05 => Ok(Button::Right),
            0x06 => Ok(Button::Left),
            0x07 => Ok(Button::Up),
            0x08 => Ok(Button::Down),
            0x09 => Ok(Button::Help),
            0x0A => Ok(Button::Pause),
            _ => Err(ButtonError {
                invalid_code: value,
            }),
        }
    }
}

enum Action {
    Released = 0x00,
    Pressed = 0x01,
}

impl TryFrom<u8> for Action {
    type Error = ParseError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x00 => Ok(Action::Released),
            0x01 => Ok(Action::Pressed),
            _ => Err(ParseError::InvalidAction(value)),
        }
    }
}

fn send_key(device: &mut Device, key: keyboard::Key) -> Result<(), ParseError> {
    let keypress_result = device.click(&key);
    if keypress_result.is_ok() {}
    match keypress_result {
        Ok(_) => {
            device.synchronize().unwrap();
            return Ok(());
        }
        Err(error) => {
            eprintln!("Error sending keypress event: {:?}", error);
            return Err(ParseError::KeypressError());
        }
    }
}

fn handle_command(device: &mut Device, data: &[u8]) -> Result<(), ParseError> {
    // The expected format of a data packet for key status command is 7 bytes total:
    // 1 byte command ID, constant 0x30
    // 2 bytes payload size, constant 0x0002
    // 1 byte key ID
    // 1 byte key status
    // 2 bytes CRC validation value

    // TODO check CRC16 value
    // println!("Received data {:02X?}", data);

    if data.len() != EXPECTED_PACKET_LEGNTH {
        return Err(ParseError::UnexpectedPacketSize(data.len()));
    }

    let _: CommandId = data[0].try_into()?;

    let n_data_bytes = ((data[1] as u16) << 8) | data[2] as u16;
    if n_data_bytes != 0x0002 {
        return Err(ParseError::UnexpectedDataLength(n_data_bytes));
    }

    let button: Button = data[3].try_into()?;
    let action: Action = data[4].try_into()?;
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
            Button::Help => {
                key = keyboard::Key::Q;
            }
            _ => {
                return Err(ParseError::Button(ButtonError {
                    invalid_code: data[3],
                }));
            }
        },
        Action::Released => {
            // Button release is a no-op since we already sent the keypress event
            return Ok(());
        }
    }

    return send_key(device, key);
}

fn validate_connection(port: &mut Box<dyn SerialPort>) {
    let echo_command: Vec<u8> = vec![
        CommandId::Echo as u8,
        0x00, // u16 data size; fixed value of 5 bytes
        0x05,
        0x01, // 5 bytes of arbitrary data
        0x02,
        0x03,
        0x04,
        0x05,
        0xfc, // CRC16_XModem value of data packet up to this point
        0xbd,
    ];
    match port.write(&echo_command) {
        Ok(_) => println!("Echo command sent"),
        Err(error) => eprintln!("{:?}", error),
    }

    let mut serial_buf: Vec<u8> = vec![0; 20];

    // Allow 1s for echo response
    for _n in 1..(1000 / POLL_INTERVAL_MS) {
        match port.read(serial_buf.as_mut_slice()) {
            Ok(size) => {
                let echo_response = &serial_buf[..size];
                if echo_command != echo_response {
                    panic!(
                        "Recieved different response from echo command: {:x?}",
                        echo_response
                    )
                }

                println!("Received valid echo command response");
                return;
            }
            Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
            Err(e) => eprintln!("Error reading echo response: {:?}", e),
        }
    }
}

fn create_virtual_device() -> Device {
    return uinput::open(UINPUT_PATH)
        .unwrap()
        .name("Accessible Controller Daemon Virtual Device")
        .unwrap()
        .event(uinput::event::Keyboard::All)
        .unwrap()
        .create()
        .unwrap();
}

fn main() {
    // Open the serial port
    let port = serialport::new(DEVICE_PATH, DEVICE_BAUD_RATE)
        .timeout(Duration::from_millis(POLL_INTERVAL_MS))
        .open();

    println!("Opened controller serial port at {DEVICE_PATH}");

    // Create virtual device for keypress events
    let mut device = create_virtual_device();
    println!("Created virtual device");

    // Wait for virtual device to register
    thread::sleep(Duration::from_secs(1));

    match port {
        Ok(mut port) => {
            validate_connection(&mut port);

            println!(
                "Receiving data on {} at {} baud:",
                &DEVICE_PATH, &DEVICE_BAUD_RATE
            );

            let mut serial_buf: Vec<u8> = vec![0; 1000];
            loop {
                match port.read(serial_buf.as_mut_slice()) {
                    Ok(size) => handle_command(&mut device, &serial_buf[..size]).unwrap(),
                    // Timeout error just means no event was sent in the current polling period
                    Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
                    Err(e) => eprintln!("{:?}", e),
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to open \"{}\". Error: {}", DEVICE_PATH, e);
            ::std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_handle_command_packet_length_error() {
        let mut device = create_virtual_device();
        let bad_data = [0x01];
        let result = handle_command(&mut device, &bad_data);
        assert!(result.is_err());
        assert_eq!(
            result,
            Err(ParseError::UnexpectedPacketSize(bad_data.len()))
        );
    }

    #[test]
    fn test_handle_command_data_length() {
        let bad_data_length: u8 = 0x03;
        let mut device = create_virtual_device();
        let bad_data = [0x30, 0x00, bad_data_length, 0x00, 0x00, 0x00, 0x00];
        let result = handle_command(&mut device, &bad_data);
        assert!(result.is_err());
        assert_eq!(
            result,
            Err(ParseError::UnexpectedDataLength(bad_data_length as u16))
        );
    }

    #[test]
    fn test_handle_command_success() {
        let mut device = create_virtual_device();
        thread::sleep(Duration::from_millis(200));

        let data = [
            0x30,
            0x00,
            0x02,
            Button::Help as u8,
            Action::Pressed as u8,
            0x00,
            0x00,
        ];
        let result = handle_command(&mut device, &data);
        assert!(result.is_ok());
    }
}
