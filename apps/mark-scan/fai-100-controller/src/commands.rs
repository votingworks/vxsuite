use num_enum::TryFromPrimitiveError;
use std::io;

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
    #[error("Error occurred when sending keypress event")]
    KeypressError(#[from] uinput::Error),
    #[error("Error occurred when converting button value from raw response")]
    InvalidButton(TryFromPrimitiveError<ButtonSignal>),
    #[error("Error occurred when converting sip/puff signal status value from raw response")]
    InvalidSipPuffSignalStatus(TryFromPrimitiveError<SipAndPuffSignalStatus>),
    #[error("Error occurred when converting sip/puff connection status value from raw response")]
    InvalidSipPuffDeviceStatus(TryFromPrimitiveError<SipAndPuffDeviceStatus>),
    #[error("I/O error when parsing command response")]
    IOError(#[from] io::Error),
}

impl From<TryFromPrimitiveError<ButtonSignal>> for CommandError {
    fn from(err: TryFromPrimitiveError<ButtonSignal>) -> Self {
        Self::InvalidButton(err)
    }
}

impl From<TryFromPrimitiveError<SipAndPuffSignalStatus>> for CommandError {
    fn from(err: TryFromPrimitiveError<SipAndPuffSignalStatus>) -> Self {
        Self::InvalidSipPuffSignalStatus(err)
    }
}

impl From<TryFromPrimitiveError<SipAndPuffDeviceStatus>> for CommandError {
    fn from(err: TryFromPrimitiveError<SipAndPuffDeviceStatus>) -> Self {
        Self::InvalidSipPuffDeviceStatus(err)
    }
}

const SENDER_ID: u32 = 0xD0BB_55AA;

#[derive(Debug, num_enum::TryFromPrimitive, Clone, Copy)]
#[repr(u8)]
pub enum CommandId {
    GetFirmwareVersion = 0x50,
    GetNotificationValues = 0xc1,
}

/// An outgoing command sent from host to device.
#[derive(Debug)]
pub struct Command {
    pub command_id: CommandId,
}

#[macro_export]
macro_rules! create_command {
    ($id:ident) => {
        $crate::commands::Command {
            command_id: $crate::commands::CommandId::$id,
        }
    };
}

impl From<Command> for Vec<u8> {
    fn from(command: Command) -> Self {
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
        bytes.push(command.command_id as u8);

        bytes
    }
}

#[derive(Debug, num_enum::TryFromPrimitive, PartialEq, Eq, Hash)]
#[repr(u8)]
pub enum ButtonSignal {
    Help = 0x30,
    VolumeDown = 0x31,
    Down = 0x32,
    RateDown = 0x33,
    Left = 0x34,
    Select = 0x35,
    Right = 0x36,
    VolumeUp = 0x37,
    Up = 0x38,
    RateUp = 0x39,
    Play = 0x3a,
    Pause = 0x3b,
    NoButton = 0xff,
}

#[derive(Debug, num_enum::TryFromPrimitive, PartialEq, Eq)]
#[repr(u8)]
pub enum SipAndPuffSignalStatus {
    // Documented as Active = 0x01, Idle = 0x00, but based on experimentation the signals are flipped
    // when a PAT device is plugged in.
    Active = 0x00,
    Idle = 0x01,
}

#[derive(Debug, num_enum::TryFromPrimitive, PartialEq, Eq)]
#[repr(u8)]
pub enum SipAndPuffDeviceStatus {
    Connected = 0x01,
    Disconnected = 0x00,
}

#[derive(Debug)]
pub struct NotificationStatusResponse {
    pub button_pressed: ButtonSignal,
    pub sip_status: SipAndPuffSignalStatus,
    pub puff_status: SipAndPuffSignalStatus,
    pub sip_puff_device_connection_status: SipAndPuffDeviceStatus,
}

pub const NOTIFICATION_STATUS_RESPONSE_BYTE_LENGTH: usize = 31;

impl TryFrom<&[u8]> for NotificationStatusResponse {
    type Error = CommandError;

    // All data segments are little endian.
    // The expected format of a data packet for input status command is 31 bytes
    // Bytes 0-3 (4 bytes) sender ID 0xD0BB55AA
    // Bytes 4-19 (16 bytes) unused padding
    // Bytes 20-23 (4 bytes) `n=7`, describing length of incoming noise + data
    // Bytes 24-25 (2 bytes) random noise, unused
    // Byte 26 command ID
    // Bytes 27-30 (4 bytes) button status, sip status, puff status, sip/puff device detection status
    // eg. AA55BBD00000000000000000000000000000000007000000FFFFC134000000
    // Sender ID 0xAA55BBD
    // Padding 0x0000000000000000000000000000000000
    // Data length 0x7000000
    // Noise 0xFFFF
    // Command ID 0xC1
    // Button status 0x34000000 = "Left" button is pressed
    fn try_from(bytes: &[u8]) -> Result<Self, Self::Error> {
        if bytes.len() != NOTIFICATION_STATUS_RESPONSE_BYTE_LENGTH {
            return Err(CommandError::UnexpectedPacketSize(bytes.len()));
        }

        let sender_id: u32 = u32::from_le_bytes(
            bytes[..4]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );

        if sender_id != SENDER_ID {
            return Err(CommandError::UnknownSenderId(sender_id));
        }

        match CommandId::try_from(bytes[26]) {
            Ok(CommandId::GetNotificationValues) => (),
            _ => return Err(CommandError::UnexpectedCommandId(bytes[26])),
        }

        let payload: &[u8] = &bytes[27..];

        let button_pressed = ButtonSignal::try_from(payload[0])?;
        let sip_status = SipAndPuffSignalStatus::try_from(payload[1])?;
        let puff_status = SipAndPuffSignalStatus::try_from(payload[2])?;
        let sip_puff_device_connection_status = SipAndPuffDeviceStatus::try_from(payload[3])?;

        Ok(Self {
            button_pressed,
            sip_status,
            puff_status,
            sip_puff_device_connection_status,
        })
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

        let sender_id: u32 = u32::from_le_bytes(
            bytes[..4]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );
        if sender_id != SENDER_ID {
            return Err(CommandError::UnknownSenderId(sender_id));
        }

        let data_length: u32 = u32::from_le_bytes(
            bytes[20..24]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );

        // Length including 2 bytes of noise we don't need to read
        let response_length: usize =
            usize::try_from(data_length - 2).expect("Failed to parse data length");
        if response_length != 5 {
            return Err(CommandError::UnexpectedDataLength(response_length));
        }
        let response: &[u8] = &bytes[26..26 + response_length];

        // Validate correct command ID was returned
        if response[0] != CommandId::GetFirmwareVersion as u8 {
            return Err(CommandError::UnknownCommand(bytes[25]));
        }

        // Version is the only chunk of data that is big endian according to docs.
        // However, version reported by device does not match that of docs, regardless
        // of endianness so we can't confirm.
        let version: u32 = u32::from_be_bytes(
            response[1..]
                .try_into()
                .map_err(|_| CommandError::FailedSliceConversion())?,
        );
        Ok(Self { version })
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    const BUTTON_SIGNAL_INDEX: usize = 27;
    const SIP_SIGNAL_INDEX: usize = 28;
    const PUFF_SIGNAL_INDEX: usize = 29;
    const DEVICE_CONNECTION_STATUS_INDEX: usize = 30;

    use super::*;

    #[test]
    fn test_notification_status_command() {
        let mut expected = vec![0xAA, 0x55, 0xBB, 0xD0];
        expected.extend(vec![0x00; 16]); // Padding
        expected.extend(vec![0x03, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xC1]);

        let cmd = create_command!(GetNotificationValues);
        let cmd: Vec<u8> = cmd.into();

        assert_eq!(cmd, expected);
    }

    fn create_notification_status_test_data() -> Vec<u8> {
        let mut data = vec![0xAA, 0x55, 0xBB, 0xD0];
        data.extend(vec![0x00; 16]); // Padding
        data.extend(vec![
            0x07, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0xC1, 0xff, 0x00, 0x00, 0x00,
        ]);

        data
    }

    #[test]
    fn test_notification_status_response_button_signal() {
        let button_byte_values = vec![
            0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x3b, 0xff,
        ];

        for &value in &button_byte_values {
            let mut data = create_notification_status_test_data();
            data[BUTTON_SIGNAL_INDEX] = value;

            let notification = NotificationStatusResponse::try_from(&data[..]).unwrap();
            let expected_button_signal = ButtonSignal::try_from(value).unwrap();
            assert_eq!(notification.button_pressed, expected_button_signal);
        }
    }

    #[test]
    fn test_notification_status_response_sip_and_puff_signal() {
        for i in SIP_SIGNAL_INDEX..=PUFF_SIGNAL_INDEX {
            for status in 0x00..=0x01 {
                let mut data = create_notification_status_test_data();
                let status_value = SipAndPuffSignalStatus::try_from(status).unwrap();
                data[i] = status;
                let notification = NotificationStatusResponse::try_from(&data[..]).unwrap();
                assert_eq!(
                    if i == SIP_SIGNAL_INDEX {
                        notification.sip_status
                    } else {
                        notification.puff_status
                    },
                    status_value
                );
            }
        }
    }

    #[test]
    fn test_notification_status_response_device_connection_status() {
        for status in 0x00..=0x01 {
            let mut data = create_notification_status_test_data();
            let status_value = SipAndPuffDeviceStatus::try_from(status).unwrap();
            data[DEVICE_CONNECTION_STATUS_INDEX] = status;
            let notification = NotificationStatusResponse::try_from(&data[..]).unwrap();
            assert_eq!(notification.sip_puff_device_connection_status, status_value);
        }
    }

    #[test]
    fn test_version_command() {
        let mut expected = vec![0xAA, 0x55, 0xBB, 0xD0];
        expected.extend(vec![0x00; 16]); // Padding
        expected.extend(vec![0x03, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x50]);

        let cmd = create_command!(GetFirmwareVersion);
        let cmd: Vec<u8> = cmd.into();

        assert_eq!(cmd, expected);
    }

    #[test]
    fn test_version_response() {
        let mut data = vec![0xAA, 0x55, 0xBB, 0xD0];
        data.extend(vec![0x00; 16]); // Padding
        data.extend(vec![
            0x07, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x50, 0x01, 0x02, 0x03, 0x04,
        ]);

        let version_response = VersionResponse::try_from(&data[..]).unwrap();
        assert_eq!(version_response.version, 0x0102_0304);
    }
}
