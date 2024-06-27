// use uinput::event::keyboard;

use crate::device::{Signal, Status};

const BUTTON_SIGNAL_INDEX: usize = 0;
const SIP_SIGNAL_INDEX: usize = 2;
const PUFF_SIGNAL_INDEX: usize = 4;
const SIP_AND_PUFF_CONNECTED_SIGNAL_INDEX: usize = 6;
// The length of the payload portion of "2.1.3 Notification Status" (NOT the length of all data in response).
const NOTIFICATION_STATUS_PAYLOAD_LENGTH: usize = 16;

#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("Unexpected command data length: {0}")]
    UnexpectedPacketSize(usize),
    #[error("Unknown sender ID: {0}")]
    UnknownSenderId(u32),
    #[error("Failed to convert slice to unsigned int type")]
    FailedSliceConversion(),
    #[error("Unexpected data length: {0}")]
    UnexpectedDataLength(usize),
    #[error("Unexpected command ID received: {0}")]
    UnexpectedCommandId(u8),
    #[error("Unknown command received: {0}")]
    UnknownCommand(u8),
    #[error("Signal value invalid: {0}")]
    InvalidSignal(u8),
    #[error("Invalid status received: {0}")]
    InvalidStatus(u8),
    #[error("Empty notification status payload received")]
    EmptyNotificationStatusPayload(),
    #[error("Error occurred when sending keypress event")]
    KeypressError(#[from] uinput::Error),
}

const SENDER_ID: u32 = 0xD0BB55AA;

#[derive(Debug, num_enum::TryFromPrimitive, Clone, Copy)]
#[repr(u8)]
enum CommandId {
    NotificationStatus = 0xab,
    GetFirmwareVersion = 0x50,
    GetNotificationValues = 0xc1,
    EnableNotifications = 0xac,
}

const MULTIBYTE_COMMAND_PREFIX: u8 = 0x1b;

pub struct EnableNotificationsCommand {}

impl From<EnableNotificationsCommand> for Vec<u8> {
    fn from(_command: EnableNotificationsCommand) -> Self {
        const EXPECTED_LENGTH: usize = 31;
        let mut bytes = Self::with_capacity(EXPECTED_LENGTH);
        // All commands start with device sender ID
        bytes.extend_from_slice(&u32::to_le_bytes(SENDER_ID));
        // Unused padding
        bytes.append(&mut vec![0; 16]);
        // LE u32 size of upcoming noise + data = 7 bytes
        bytes.push(0x07);
        bytes.append(&mut vec![0; 3]);
        // 2 bytes of noise
        bytes.append(&mut vec![0xff; 2]);
        // 5 bytes of data
        bytes.push(MULTIBYTE_COMMAND_PREFIX);
        bytes.push(CommandId::EnableNotifications as u8);
        // Bitmask describing which status notifications to operate on. We want all of them turned on.
        bytes.push(0xff);
        // Unused byte
        bytes.push(0x00);
        // 0x01 == enable notifications for notifications described by bitmask
        bytes.push(0x01);

        bytes
    }
}

#[derive(Debug)]
pub struct VersionCommand {}

impl From<VersionCommand> for Vec<u8> {
    // TODO VersionCommand struct is overkill atm. Probably should
    // make a generic Command struct
    fn from(_command: VersionCommand) -> Self {
        const EXPECTED_LENGTH: usize = 27;
        let mut bytes = Self::with_capacity(EXPECTED_LENGTH);
        // All commands start with device sender ID
        bytes.extend_from_slice(&u32::to_le_bytes(SENDER_ID));
        // Unused padding
        bytes.append(&mut vec![0; 16]);
        // LE u32 size of upcoming noise + data = 3 bytes
        bytes.push(0x03);
        bytes.append(&mut vec![0; 3]);
        // 2 bytes of noise
        bytes.append(&mut vec![0xff; 2]);
        // 1 byte of data (just the command ID)
        bytes.push(CommandId::GetFirmwareVersion as u8);

        bytes
    }
}

#[derive(Debug)]
pub struct GetNotificationValues {}

impl From<GetNotificationValues> for Vec<u8> {
    fn from(_command: GetNotificationValues) -> Self {
        const EXPECTED_LENGTH: usize = 27;
        let mut bytes = Self::with_capacity(EXPECTED_LENGTH);
        // All commands start with device sender ID
        bytes.extend_from_slice(&u32::to_le_bytes(SENDER_ID));
        // Unused padding
        bytes.append(&mut vec![0; 16]);
        // LE u32 size of upcoming noise + data = 3 bytes
        bytes.push(0x03);
        bytes.append(&mut vec![0; 3]);
        // 2 bytes of noise
        bytes.append(&mut vec![0xff; 2]);
        // 1 byte of data (just the command ID)
        bytes.push(CommandId::GetNotificationValues as u8);

        bytes
    }
}

#[derive(Debug)]
pub struct VersionResponse {
    pub version: u32,
}

impl TryFrom<&[u8]> for VersionResponse {
    type Error = CommandError;

    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        const EXPECTED_LENGTH: usize = 31;
        if bytes.len() != EXPECTED_LENGTH {
            return Err(CommandError::UnexpectedPacketSize(bytes.len()));
        }

        // TODO bake this into SenderId struct
        let sender_id: u32 = u32::from_le_bytes(
            bytes[..4]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );
        if sender_id != SENDER_ID {
            return Err(CommandError::UnknownSenderId(sender_id));
        }

        // TODO bake this into a commonn Command struct
        let data_length: u32 = u32::from_le_bytes(
            bytes[20..24]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );

        // Length including 2 bytes of noise we don't need to read
        let response_length: usize = usize::try_from(data_length - 2).unwrap();
        if response_length != 5 {
            return Err(CommandError::UnexpectedDataLength(response_length));
        }
        let response: &[u8] = &bytes[26..26 + response_length];

        // Validate correct command ID was returned
        if response[0] != CommandId::GetFirmwareVersion as u8 {
            return Err(CommandError::UnknownCommand(bytes[25]));
        }

        // Version is the only chunk of data that seems to be big endian
        let version: u32 = u32::from_be_bytes(
            response[1..]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );
        Ok(Self { version })
    }
}

#[derive(Debug)]
pub struct NotificationStatusResponse {
    pub signal: Signal,
    pub status: Status,
}

impl TryFrom<&[u8]> for NotificationStatusResponse {
    type Error = CommandError;

    // All data segments are little endian.
    // The expected format of a data packet for input status command is of variable length:
    // Bytes 0-3 (4 bytes) sender ID 0xD0BB55AA
    // Bytes 4-19 (16 bytes) unused padding
    // Bytes 20-23 (4 bytes) `n`, describing length of incoming noise + data
    // Bytes 24-25 (2 bytes) random noise, unused
    // Bytes 26+ (n - 2) bytes of payload data, starting with command ID
    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        const MIN_PAYLOAD_SIZE: usize = 27;

        if bytes.len() < MIN_PAYLOAD_SIZE {
            return Err(CommandError::UnexpectedPacketSize(bytes.len()));
        }

        match CommandId::try_from(bytes[26]) {
            Ok(CommandId::NotificationStatus) => (),
            Ok(_) => return Err(CommandError::UnexpectedCommandId(bytes[26])),
            Err(_) => return Err(CommandError::UnexpectedCommandId(bytes[26])),
        }

        let sender_id: u32 = u32::from_le_bytes(
            bytes[..4]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );

        if sender_id != SENDER_ID {
            return Err(CommandError::UnknownSenderId(sender_id));
        }

        // Length including 2 bytes of noise we don't need to read
        let data_length: u32 = u32::from_le_bytes(
            bytes[20..24]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );

        let response_length: usize = usize::try_from(data_length - 2).unwrap();
        if response_length != NOTIFICATION_STATUS_PAYLOAD_LENGTH {
            return Err(CommandError::UnexpectedDataLength(response_length));
        }
        let response: &[u8] = &bytes[26..26 + response_length];

        // Validate response payload includes the expected command ID
        match CommandId::try_from(response[0]) {
            Ok(CommandId::NotificationStatus) => (),
            Ok(_) => return Err(CommandError::UnexpectedCommandId(response[0])),
            Err(_) => return Err(CommandError::UnknownCommand(response[0])),
        }

        // Slice payload so indices match those described in the docs
        let payload: &[u8] = &response[1..];

        // Parse notification payload and return the first signal we encounter.
        // This approach assumes
        // 1. The notification event is sent only when status changes
        // 2. A discrete notification event is sent for each status change ie.
        //      a single notification payload will include status data for
        //      exactly one button or sip & puff signal.
        let signal_indices = &[
            BUTTON_SIGNAL_INDEX,
            SIP_SIGNAL_INDEX,
            PUFF_SIGNAL_INDEX,
            SIP_AND_PUFF_CONNECTED_SIGNAL_INDEX,
        ];

        for i in signal_indices {
            let signal = Signal::try_from(payload[*i])
                .map_err(|err| CommandError::InvalidSignal(err.number))?;
            if signal != Signal::NoOp {
                return Ok(Self {
                    signal,
                    status: Status::try_from(payload[i + 1])
                        .map_err(|err| CommandError::InvalidStatus(err.number))?,
                });
            }
        }

        Err(CommandError::EmptyNotificationStatusPayload())
    }
}

/*
pub fn handle_command(data: &[u8]) -> Result<Option<(keyboard::Key, bool)>, CommandError> {
    let NotificationStatusResponse { signal, status } = data.try_into()?;

    let key: keyboard::Key;
    let mut send_shift: bool = false;
    match status {
        Status::Active => match signal {
            Signal::Select => {
                key = keyboard::Key::Enter;
            }
            Signal::Left => {
                key = keyboard::Key::Left;
            }
            Signal::Right => {
                key = keyboard::Key::Right;
            }
            Signal::Up => {
                key = keyboard::Key::Up;
            }
            Signal::Down => {
                key = keyboard::Key::Down;
            }
            Signal::Help => {
                send_shift = true;
                key = keyboard::Key::R;
            }
            Signal::RateDown => {
                key = keyboard::Key::Comma;
            }
            Signal::RateUp => {
                key = keyboard::Key::Dot;
            }
            Signal::VolumeDown => {
                key = keyboard::Key::Minus;
            }
            Signal::VolumeUp => {
                key = keyboard::Key::Equal;
            }
            Signal::Pause => {
                send_shift = true;
                key = keyboard::Key::P;
            }
            Signal::Play => {
                send_shift = true;
                key = keyboard::Key::P;
            }
            Signal::SipAndPuffConnection => {
                // TODO
                return Ok(None);
            }
            Signal::Sip => key = keyboard::Key::_1,
            Signal::Puff => key = keyboard::Key::_2,
            // Unreachable but included for completion
            Signal::NoOp => return Ok(None),
        },
        Status::Idle => {
            // Button release is a no-op since we already sent the keypress event
            return Ok(None);
        }
    }
    Ok(Some((key, send_shift)))
}
    */

// #[cfg(test)]
// #[allow(clippy::unwrap_used)]
// mod tests {
//     use core::panic;

//     use super::*;

//     #[test]
//     fn test_handle_command_packet_length_error() {
//         let bad_data = [0x01];
//         match handle_command(&bad_data) {
//             Err(CommandError::UnexpectedPacketSize(size)) => assert_eq!(size, 1),
//             result => panic!("Unexpected result: {result:?}"),
//         }
//     }

//     #[test]
//     fn test_handle_command_data_length() {
//         let bad_data_length: u8 = 0x03;
//         let bad_data = [0x30, 0x00, bad_data_length, 0x00, 0x00, 0x00, 0x00];
//         match handle_command(&bad_data) {
//             Err(CommandError::UnexpectedDataLength(length)) => {
//                 assert_eq!(length, u16::from(bad_data_length));
//             }
//             result => panic!("Unexpected result: {result:?}"),
//         }
//     }

//     #[test]
//     fn test_handle_command_success_with_shift() {
//         let data = [
//             0x30,
//             0x00,
//             0x02,
//             Button::Help as u8,
//             Action::Pressed as u8,
//             0xc8,
//             0x37,
//         ];
//         assert_eq!(
//             handle_command(&data).unwrap().unwrap(),
//             (keyboard::Key::R, true)
//         );
//     }

//     #[test]
//     fn test_handle_command_success_no_shift() {
//         let data = [
//             0x30,
//             0x00,
//             0x02,
//             Button::Left as u8,
//             Action::Pressed as u8,
//             0xd8,
//             0x09,
//         ];
//         assert_eq!(
//             handle_command(&data).unwrap().unwrap(),
//             (keyboard::Key::Left, false)
//         );
//     }
// }
