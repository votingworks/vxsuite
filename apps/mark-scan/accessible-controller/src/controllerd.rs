use serialport;
use std::{fmt::Display, io, time::Duration, thread};
use uinput::{event::keyboard, Device};

const EXPECTED_PACKET_LEGNTH: usize = 7;

#[derive(Debug, thiserror::Error)]
enum ParseError {
    #[error("Unexpected command data length: {0}")]
    UnexpectedPacketSize(usize),
    #[error("Invalid command received: {0}")]
    InvalidCommand(u8),
    #[error("Invalid action received: {0}")]
    InvalidAction(u8),
    #[error("Button value invalid: {0}")]
    Button(#[from] ButtonError),
}

#[derive(Debug, thiserror::Error)]
struct ButtonError {
    invalid_code: u8,
}

impl Display for ButtonError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Invalid button code {}", self.invalid_code)
    }
}

enum CommandId {
    ButtonStatus = 0x30,
}

impl TryFrom<u8> for CommandId {
    type Error = ParseError;

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
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
            _ => Err(ParseError::InvalidAction(value))
        }
    }
}

fn send_key(device: &mut Device, key: keyboard::Key) -> () {
    if device.click(&key).is_err() {
        eprintln!("Error clicking key");
    }

    device.synchronize().unwrap();
}

fn handle_command(device: &mut Device, data: &[u8]) -> Result<(), ParseError> {
    // The expected format of a data packet for key status command is 7 bytes total:
    // 1 byte command ID, constant 0x30
    // 2 bytes payload size, constant 0x0002
    // 1 byte key ID
    // 1 byte key status
    // 2 bytes CRC validation value

    if data.len() != EXPECTED_PACKET_LEGNTH {
        return Err(ParseError::UnexpectedPacketSize(data.len()));
    }

    let _: CommandId = data[0].try_into()?;

    let n_data_bytes = ((data[1] as u16) << 8) | data[2] as u16;
    if n_data_bytes != 0x0002 {
        eprintln!("Unexpected data length specified {}", n_data_bytes);
    }

    println!("Button value recieved: {:0x}", data[3]);
    let button: Button = data[3].try_into()?;
    let action: Action = data[4].try_into()?;
    match action {
        Action::Pressed => {
            match button {
                Button::Select => {
                    send_key(device, keyboard::Key::Enter);
                }
                Button::Left => {
                    send_key(device, keyboard::Key::Left);
                }
                Button::Right => {
                    send_key(device, keyboard::Key::Right);
                }
                Button::Up => {
                    send_key(device, keyboard::Key::Up);
                }
                Button::Down => {
                    send_key(device, keyboard::Key::Down);
                }
                _ => {
                    println!("Unhandled button {:#02x}", data[3]);
                }
            }
        }
        Action::Released => {
            // Button release is a no-op since we already sent the keypress event
            println!("Received no-op RELEASED action");
            return Ok(());
        }
    }
    Ok(())
}

fn main() {
    // Open the serial port
    let port_path = "/dev/ttyACM1";
    let baud_rate = 9600;
    let port = serialport::new(port_path, baud_rate)
        .timeout(Duration::from_millis(10))
        .open();

    println!("Opened serial port");

    let mut device = uinput::open("/dev/uinput")
        .unwrap()
        .name("Virtual device")
        .unwrap()
        .event(uinput::event::Keyboard::All)
        .unwrap()
        .create()
        .unwrap();
    println!("Created virtual device");

    // Wait for device to register
    thread::sleep(Duration::from_secs(1));

    match port {
        Ok(mut port) => {
            let mut serial_buf: Vec<u8> = vec![0; 1000];
            println!("Receiving data on {} at {} baud:", &port_path, &baud_rate);
            loop {
                match port.read(serial_buf.as_mut_slice()) {
                    Ok(t) => handle_command(&mut device, &serial_buf[..t]).unwrap(),
                    Err(ref e) if e.kind() == io::ErrorKind::TimedOut => (),
                    Err(e) => eprintln!("{:?}", e),
                }
            }
        }
        Err(e) => {
            eprintln!("Failed to open \"{}\". Error: {}", port_path, e);
            ::std::process::exit(1);
        }
    }
    /*
    // Read data from the serial port
    let mut buffer = vec![0; 1000];
    loop {
        match port.read(buffer.as_mut_slice()) {
            Ok(_) => {
                if !buffer.is_empty() {
                    println!("Received data of byte length {}", buffer.len());
                    if let Err(e) = handle_command(&mut device, &buffer) {
                        eprintln!("Error from handling command {e}");
                    }

                    buffer.clear();
                }
            }
            Err(e) => {
                println!("Error reading from serial port: {e}");
                break;
            }
        }
    }
    */
}
