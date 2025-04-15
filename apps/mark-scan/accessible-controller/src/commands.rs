use uinput::event::keyboard;

use crate::device::{Action, Button};

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
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
pub struct EchoCommand<'a> {
    payload: &'a [u8],
}

impl<'a> EchoCommand<'a> {
    pub const fn new(payload: &'a [u8]) -> Self {
        Self { payload }
    }
}

impl From<EchoCommand<'_>> for Vec<u8> {
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

const fn validate_payload_length(
    payload_length: u16,
    bytes: &[u8],
    non_payload_bytes: usize,
) -> Result<(), CommandError> {
    if payload_length as usize != bytes.len() - non_payload_bytes {
        return Err(CommandError::UnexpectedDataLength(payload_length));
    }

    Ok(())
}

impl<'a> TryFrom<&'a [u8]> for EchoCommand<'a> {
    type Error = CommandError;

    fn try_from(bytes: &'a [u8]) -> Result<Self, Self::Error> {
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
            payload: &bytes[PAYLOAD_OFFSET..PAYLOAD_OFFSET + payload_length as usize],
        })
    }
}

#[derive(Debug)]
pub struct ButtonStatusCommand {
    pub button: Button,
    pub action: Action,
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

pub fn handle_command(data: &[u8]) -> Result<Option<(keyboard::Key, bool)>, CommandError> {
    let ButtonStatusCommand { button, action } = data.try_into()?;

    let key: keyboard::Key;
    let mut send_shift: bool = false;
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
                send_shift = true;
                key = keyboard::Key::R;
            }
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
                send_shift = true;
                key = keyboard::Key::P;
            }
        },
        Action::Released => {
            // Button release is a no-op since we already sent the keypress event
            return Ok(None);
        }
    }
    Ok(Some((key, send_shift)))
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use core::panic;

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
                assert_eq!(length, u16::from(bad_data_length));
            }
            result => panic!("Unexpected result: {result:?}"),
        }
    }

    #[test]
    fn test_handle_command_success_with_shift() {
        let data = [
            0x30,
            0x00,
            0x02,
            Button::Help as u8,
            Action::Pressed as u8,
            0xc8,
            0x37,
        ];
        assert_eq!(
            handle_command(&data).unwrap().unwrap(),
            (keyboard::Key::R, true)
        );
    }

    #[test]
    fn test_handle_command_success_no_shift() {
        let data = [
            0x30,
            0x00,
            0x02,
            Button::Left as u8,
            Action::Pressed as u8,
            0xd8,
            0x09,
        ];
        assert_eq!(
            handle_command(&data).unwrap().unwrap(),
            (keyboard::Key::Left, false)
        );
    }
}
