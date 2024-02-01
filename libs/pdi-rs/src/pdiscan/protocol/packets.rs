use std::time::Duration;

use super::types::{ResolutionTableType, Settings, Side, Status, Version};

pub(crate) const PACKET_DATA_START: &[u8] = &[0x02];
pub(crate) const PACKET_DATA_END: &[u8] = &[0x03];

#[derive(Debug)]
pub enum Outgoing {
    /// This command requests a hard-coded test string from the scanner.
    ///
    /// `ASCII character D = (44H)`
    ///
    /// # Response
    ///
    /// `D Test Message USB 1.1/2.0 Communication`
    GetTestStringRequest,

    /// This command causes the scanner to return 10 bytes representing the
    /// scanner firmware version number and the CPLD version number.
    ///
    /// `ASCII character V = (56H)`
    ///
    /// # Response
    ///
    /// ## Format
    ///
    /// `V <Scanner Firmware Version Number>`
    ///
    /// ## Firmware Version Number Byte Format
    ///
    /// - Bytes 8-5: Product ID
    /// - Bytes 4-3: Major Version
    /// - Bytes 2-1: Minor Version
    /// - Byte 0: CPLD Version
    GetFirmwareVersionRequest,

    /// Return firmware build date and time.
    ///
    /// `<ESC> V = (1BH) (56H)`
    ///
    /// # Response Format
    ///
    /// `(58H) <3 bytes> (20H) <2 bytes> (20H) <4 bytes> (2FH) <2 bytes> (3AH) <2 bytes> (3AH) <2 bytes>`
    ///
    /// The 3 bytes that follow the (58H) are ASCII characters representing the
    /// month. The 2 bytes that follow the first (20H) are ASCII characters
    /// representing the day. The 4 bytes that follow the second (20H) are ASCII
    /// characters representing the year. The 2 bytes that follow the (2FH) are
    /// ASCII characters representing the hour, in 24-hour time. The 2 bytes
    /// that follow the first (3AH) are ASCII characters representing the
    /// minute, and the last 2 bytes are an ASCII character representing the
    /// second.
    ///
    /// ## Example
    ///
    /// `XMar 01 2010/13:15:01`
    GetCurrentFirmwareBuildVersionString,

    /// This command causes the scanner to return three bytes of status information.
    ///
    /// `ASCII character Q = (51H)`
    ///
    /// # Response
    ///
    /// `Q <Byte 0> <Byte 1> <Byte 2>`
    ///
    /// ## Byte 0
    ///
    /// - Bit 0 (0x01): Rear Left Sensor Covered = 1
    /// - Bit 1 (0x02): Rear Right Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 2 (0x04): Brander Position Sensor Covered = 1
    /// - Bit 3 (0x08): Hi Speed Mode = 1
    /// - Bit 4 (0x10): Download Needed = 1
    /// - Bit 5 (0x20): Future Use (not defined) = 1
    /// - Bit 6 (0x40): Scanner Enabled = 1
    /// - Bit 7 (0x80): Always Set to 1
    ///
    /// ## Byte 1
    ///
    /// - Bit 0 (0x01): Front (1) Left Sensor Covered = 1
    /// - Bit 1 (0x02): Front (2) (M1) Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 2 (0x04): Front (3) (M2) Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 3 (0x08): Front (4) (M3) Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 4 (0x10): Front (5) (M4) Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 5 (0x20): Front (6) (M5) Sensor Covered = 1 (Omitted in Duplex and Ultrascan units)
    /// - Bit 6 (0x40): Front (7) (M6) Sensor Covered = 1 (Omitted in Duplex and Ultrascan units)
    /// - Bit 7 (0x80): Always Set to 1
    ///
    /// ## Byte 2
    ///
    /// - Bit 0 (0x01): Scanner Ready = 1
    /// - Bit 1 (0x02): XMT Aborted (Com Error) = 1
    /// - Bit 2 (0x04): Document Jam = 1
    /// - Bit 3 (0x08): Scan Array (Pixel) Error = 1
    /// - Bit 4 (0x10): In Diagnostic Mode = 1
    /// - Bit 5 (0x20): Doc in Scanner = 1
    /// - Bit 6 (0x40): Calibration of unit needed = 1
    /// - Bit 7 (0x80): Always Set to 1
    GetScannerStatusRequest,
    EnableFeederRequest,

    /// This command sets a duplex scanner to scan only the backside (bottom) of the document.
    ///
    /// `ASCII character H = (48H)`
    ///
    /// # Response
    ///
    /// No response.
    DisableFeederRequest,

    /// This command stops the normal (default) mode, whereby the feed rollers
    /// are momentarily reversed (at document insertion) to allow document
    /// straightening. This is the DEFAULT mode.
    ///
    /// `<ESC> O = (1BH) (4FH)`
    DisableMomentaryReverseOnFeedAtInputRequest,

    /// This command enables the application to generate a scanner serial
    /// number, and to save it in scanner Flash memory. The command will also
    /// return the serial number stored in Flash. If the command is issued by
    /// itself (no serial number following the (*) command), the present serial
    /// number is returned. If the command is issued followed by an 8-digit
    /// number, the stored serial number will be changed to this new value.
    ///
    /// Case 1: Retrieve present Serial Number
    ///
    /// `ASCII character * = (2AH)`
    ///
    /// # Response
    ///
    /// `* <Flash Serial Number (8 bytes)>`
    ///
    /// The 8 bytes are returned as the ASCII values of the serial number (0-9 and A-F)
    GetSerialNumberRequest,

    /// This command enables the application to generate a scanner serial
    /// number, and to save it in scanner Flash memory. The command will also
    /// return the serial number stored in Flash. If the command is issued by
    /// itself (no serial number following the (*) command), the present serial
    /// number is returned. If the command is issued followed by an 8-digit
    /// number, the stored serial number will be changed to this new value.
    ///
    /// Case 2: Set and Retrieve new Serial Number
    ///
    /// `ASCII character * = (2AH) / <8-digit serial number in ASCII Format>`
    ///
    /// # Response
    ///
    /// `*<Flash Serial Number (8 bytes)>` (The serial number entered is echoed back)
    ///
    /// The 8 bytes are returned as the ASCII values of the serial number.
    SetSerialNumberRequest([u8; 8]),

    /// The ‘I’ command returns the present scanner setup status.
    ///
    /// `ASCII character I = (49H)`
    ///
    /// # Response
    ///
    /// ```plaintext
    /// I <DPI Setting Low Byte>/<DPI Setting Hi Byte>/
    /// <Num of Bits per Pixel Low Byte>/< Num of Bits per Pixel Hi Byte>/ <Total Array Pixels Low Byte>/<Total Array Pixels Hi Byte>/
    /// <Num of Arrays Low Byte>/< Num of Arrays Hi Byte>/
    /// <Calibration Status Low Byte>/<Calibration Status Hi Byte>
    /// ```
    ///
    /// If present: `<Number of Calibration Tables Low Byte>/<Number of Calibration Tables High Byte>`
    /// Where:
    /// - DPI Setting = 100 or 200 dots per inch (PS4), or 150 or 300 DPI (US)
    /// - Num of Bits per Pixel = 1 (Bi-tonal) or 8 (Eight-bit Grayscale)
    /// - Total Array Pixels = 1728 pixels (PS4) for single-sided scanning; 3456 for double-sided scanning
    /// - Num of Arrays = 1 (Front/top array), 2 = (Back/bottom array), 3 = (Front & Back Arrays
    /// - Calibration Status = 1 (Calibration needed), 0 (Calibration OK)
    GetScannerSettingsRequest,

    /// When this command is sent without arguments, it will report the number
    /// of entry sensors that need to be covered before the scanner will
    /// initiate a scan. This command also reports the number of entry sensors
    /// available in the scanner.
    ///
    /// `<ESC> s = (1BH) (73H)`
    ///
    /// # Response Format
    ///
    /// `(73H) <’Current Sensors Needed’> <’Total Input Sensors’>`
    GetRequiredInputSensorsRequest,

    /// In case an additional byte is added to this command, it will set the
    /// number of sensors needed to start a scan. This additional byte can be no
    /// less than 1 and not greater than the maximum number of sensors.
    ///
    /// `<ESC> s <’Number of Sensors’>`
    ///
    /// # Response Format
    ///
    /// `(73H) <’Current Sensors Needed’> <’Total Input Sensors’>`
    ///
    /// The values are single characters, ascii decimal digit. As an example,
    /// for PageScan 5 Simplex, the esc-s command will return:
    ///
    /// `<esc>s37`
    ///
    /// Meaning 7 sensors available, 3 need to be covered to initiate a scan.
    SetRequiredInputSensorsRequest {
        sensors: u8,
    },

    IncreaseTopCISSensorThresholdBy1Request,
    DecreaseTopCISSensorThresholdBy1Request,
    IncreaseBottomCISSensorThresholdBy1Request,
    DecreaseBottomCISSensorThresholdBy1Request,

    GetCalibrationInformationRequest {
        resolution_table_type: ResolutionTableType,
    },

    /// This command sets the scanner mode for scanning documents at one half of
    /// the scanner’s native resolution. For the Pagescan 5 this will mean 200
    /// dpi, for the Ultrascan this will mean 150 dpi, and for the color scanner
    /// this will mean 200 or 300 dpi depending on the model. This is the
    /// DEFAULT mode.
    ///
    /// `ASCII character A = (41H)`
    ///
    /// # Response
    ///
    /// No response.
    SetScannerImageDensityToHalfNativeResolutionRequest,

    /// This command sets the scanner mode for scanning documents at the full
    /// native resolution. For the Pagescan 5 this will mean 400 dpi, for the
    /// Ultrascan this will mean 300 dpi, and for the color scanner this will
    /// mean either 400 or 600 dpi depending on the model.
    ///
    /// `ASCII character B = (42H)`
    ///
    /// # Response
    ///
    /// No response.
    SetScannerImageDensityToNativeResolutionRequest,

    SetScannerToDuplexModeRequest,
    DisablePickOnCommandModeRequest,
    DisableEjectPauseRequest,
    TransmitInLowBitsPerPixelRequest,
    DisableAutoRunOutAtEndOfScanRequest,

    /// This command will set the motor to run at half speed. The scanner will
    /// then continue to run the motor at half speed until either the ‘k’, run
    /// motor at full speed, command is issued or the power to the scanner is
    /// cycled.
    ///
    /// `ASCII character j = (6AH)`
    ///
    /// # Response
    ///
    /// No response.
    ConfigureMotorToRunAtHalfSpeedRequest,

    /// This command will set the motor to run at full speed. The scanner
    /// normally runs the motor at full speed unless the ‘j’, run motor at half
    /// speed, command is issued. This is the DEFAULT mode.
    ///
    /// `ASCII character k = (6BH)`
    ///
    /// # Response
    ///
    /// No response.
    ConfigureMotorToRunAtFullSpeedRequest,

    /// This command sets the threshold offset value to a specific value (in RAM
    /// only) – data format is a hexadecimal percentage followed by the
    /// hexadecimal representation of either ASCII “T” for the top array, or
    /// ASCII “B” for the bottom array of a duplex scanner. This command does
    /// not save threshold to ROM. This command has no effect on the PS4 color
    /// scanner models were bi-tonal mode is not an option.
    ///
    /// `<ESC>% = (1BH) (25H)`
    ///
    /// # Example Command
    ///
    /// `(1BH) (25H) (54H) <hexadecimal value of threshold>`
    ///
    /// This example would set the Top threshold to the desired value.
    ///
    /// # Response Format
    ///
    /// `(58H) (54H) (20H) <2 Bytes (current)>`
    SetThresholdToANewValueRequest {
        side: Side,
        new_threshold: u8,
    },

    /// This command sets the maximum expected length of a document. If a
    /// scanned document is longer than this value, then a paper jam will be
    /// reported.
    ///
    /// `<ESC> D <Scan Length Byte>= (1BH) (44H) (Hex Scan Length Byte)`
    ///
    /// The Hex Scan Length Byte is calculated by dividing the scan length (in
    /// inches) by 0.1 (“the default unit”), converting this decimal number to
    /// its hex equivalent, and then add 20 (hex) to eliminate control code
    /// characters.
    ///
    /// # Example:
    ///
    /// To scan 5.0 inches of a form, the scan length byte is calculated:
    ///
    /// `(5.0”/0.1 = 50D = 32H) (32H + 20H = 52H)`
    /// `<ESC> D <Scan Length Byte>= (1BH) (44H) (52H)`
    ///
    /// In case document lengths of over 22.3 inches are used, one can add one
    /// additional byte to this command.
    ///
    /// `<ESC>D<Scan Length Byte><Unit Byte>`
    ///
    /// This Unit Byte will overrule the default unit of 0.1”. The unit used
    /// will be: `(Unit Byte – ‘0’) * 5 + 10 in 1/100 of inch`. So a value of 10
    /// is 0.1 inch.
    ///
    /// # Example:
    ///
    /// `(1BH)(44H)(52H)(32H)`
    /// The unit in this case is: `(32H – 30H) * 5 + 10 = 20 or 0.2 inch` for
    /// the unit. The length set will be `(52H – 20H) * 0.20 = 10.0 inch`.
    ///
    /// # Response
    ///
    /// No response
    SetLengthOfDocumentToScanRequest {
        length_byte: u8,
        unit_byte: Option<u8>,
    },

    /// This command allows selection of a delay interval from the time a
    /// document is inserted into the scanner and the intake of the document for
    /// scanning. It gives a user the ability to straighten or adjust the
    /// document position. The command is followed by a single byte with hex
    /// value between 32 (20 hex) and 232 (E8 hex), from which 32 is subtracted
    /// to yield a final value between 0 and 200. This value is multiplied by 16
    /// msec to give a delay time between 0 and 3.2 sec. Values outside the
    /// legal range result in reversion to a default delay of 1 msec.
    ///
    /// # Example:
    /// `<ESC> j = (1BH) (6AH)`
    ///
    /// # Response
    ///
    /// No response.
    SetScanDelayIntervalForDocumentFeedRequest {
        delay_interval: Duration,
    },

    /// This command causes the scanner’s motor to run in the forward direction
    /// (ejecting a document from the rear of the unit). Motor runs until exit
    /// sensors say that document has been ejected, or runs for a max run time
    /// of about 4 seconds. ASCII character 3 = (33H)
    ///
    /// # Response
    ///
    /// No response.
    EjectDocumentToRearOfScannerRequest,

    /// This command causes the scanner to eject a form (after scanning) at the
    /// front input throat of the scanner, but form remains gripped by the
    /// scanner input rollers. ASCII character 1 = (31H)
    ///
    /// # Response
    ///
    /// No response.
    EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest,

    /// This command causes the scanner’s motor to run in the reverse direction
    /// (clearing a document from the front entrance of the scanner). Motor runs
    /// until front sensors indicate form has exited, or for a max run time of
    /// about 4 seconds. ASCII character 4 = (34H)
    ///
    /// # Response
    ///
    /// No response.
    EjectDocumentToFrontOfScannerRequest,

    /// This command causes the scanner to eject a document held in escrow (rear
    /// rollers), by advancing the feed mechanism only enough to release the
    /// document. ASCII character 7 = (37H)
    ///
    /// # Response
    ///
    /// No response.
    EjectEscrowDocumentRequest,

    /// On receipt of this command, the scanner will re-scan a document in
    /// escrow position (held by rear set of rollers), and re-transmit the data.
    /// ASCII character [ = (5BH)
    ///
    /// # Response
    ///
    /// No response.
    RescanDocumentHeldInEscrowPositionRequest,
}

#[derive(Debug)]
pub enum Incoming {
    /// This command requests a hard-coded test string from the scanner.
    ///
    /// `ASCII character D = (44H)`
    ///
    /// # Response
    ///
    /// `D Test Message USB 1.1/2.0 Communication`
    GetTestStringResponse(String),

    /// This command causes the scanner to return 10 bytes representing the
    /// scanner firmware version number and the CPLD version number.
    ///
    /// `ASCII character V = (56H)`
    ///
    /// # Response
    ///
    /// ## Format
    ///
    /// `V <Scanner Firmware Version Number>`
    ///
    /// ## Firmware Version Number Byte Format
    ///
    /// - Bytes 8-5: Product ID
    /// - Bytes 4-3: Major Version
    /// - Bytes 2-1: Minor Version
    /// - Byte 0: CPLD Version
    GetFirmwareVersionResponse(Version),

    /// Return firmware build date and time.
    ///
    /// `<ESC> V = (1BH) (56H)`
    ///
    /// # Response Format
    ///
    /// `(58H) <3 bytes> (20H) <2 bytes> (20H) <4 bytes> (2FH) <2 bytes> (3AH) <2 bytes> (3AH) <2 bytes>`
    ///
    /// The 3 bytes that follow the (58H) are ASCII characters representing the
    /// month. The 2 bytes that follow the first (20H) are ASCII characters
    /// representing the day. The 4 bytes that follow the second (20H) are ASCII
    /// characters representing the year. The 2 bytes that follow the (2FH) are
    /// ASCII characters representing the hour, in 24-hour time. The 2 bytes
    /// that follow the first (3AH) are ASCII characters representing the
    /// minute, and the last 2 bytes are an ASCII character representing the
    /// second.
    ///
    /// ## Example
    ///
    /// `XMar 01 2010/13:15:01`
    GetCurrentFirmwareBuildVersionStringResponse(String),

    /// This command causes the scanner to return three bytes of status information.
    ///
    /// `ASCII character Q = (51H)`
    ///
    /// # Response
    ///
    /// `Q <Byte 0> <Byte 1> <Byte 2>`
    ///
    /// ## Byte 0
    ///
    /// - Bit 0 (0x01): Rear Left Sensor Covered = 1
    /// - Bit 1 (0x02): Rear Right Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 2 (0x04): Brander Position Sensor Covered = 1
    /// - Bit 3 (0x08): Hi Speed Mode = 1
    /// - Bit 4 (0x10): Download Needed = 1
    /// - Bit 5 (0x20): Future Use (not defined) = 1
    /// - Bit 6 (0x40): Scanner Enabled = 1
    /// - Bit 7 (0x80): Always Set to 1
    ///
    /// ## Byte 1
    ///
    /// - Bit 0 (0x01): Front (1) Left Sensor Covered = 1
    /// - Bit 1 (0x02): Front (2) (M1) Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 2 (0x04): Front (3) (M2) Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 3 (0x08): Front (4) (M3) Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 4 (0x10): Front (5) (M4) Sensor Covered = 1 (Omitted in Ultrascan)
    /// - Bit 5 (0x20): Front (6) (M5) Sensor Covered = 1 (Omitted in Duplex and Ultrascan units)
    /// - Bit 6 (0x40): Front (7) (M6) Sensor Covered = 1 (Omitted in Duplex and Ultrascan units)
    /// - Bit 7 (0x80): Always Set to 1
    ///
    /// ## Byte 2
    ///
    /// - Bit 0 (0x01): Scanner Ready = 1
    /// - Bit 1 (0x02): XMT Aborted (Com Error) = 1
    /// - Bit 2 (0x04): Document Jam = 1
    /// - Bit 3 (0x08): Scan Array (Pixel) Error = 1
    /// - Bit 4 (0x10): In Diagnostic Mode = 1
    /// - Bit 5 (0x20): Doc in Scanner = 1
    /// - Bit 6 (0x40): Calibration of unit needed = 1
    /// - Bit 7 (0x80): Always Set to 1
    GetScannerStatusResponse(Status),

    /// This command enables the application to generate a scanner serial
    /// number, and to save it in scanner Flash memory. The command will also
    /// return the serial number stored in Flash. If the command is issued by
    /// itself (no serial number following the (*) command), the present serial
    /// number is returned. If the command is issued followed by an 8-digit
    /// number, the stored serial number will be changed to this new value.
    ///
    /// Case 1: Retrieve present Serial Number
    ///
    /// `ASCII character * = (2AH)`
    ///
    /// # Response
    ///
    /// `* <Flash Serial Number (8 bytes)>`
    ///
    /// The 8 bytes are returned as the ASCII values of the serial number (0-9 and A-F)
    ///
    /// Case 2: Set and Retrieve new Serial Number
    ///
    /// `ASCII character * = (2AH) / <8-digit serial number in ASCII Format>`
    ///
    /// # Response
    ///
    /// `*<Flash Serial Number (8 bytes)>` (The serial number entered is echoed back)
    ///
    /// The 8 bytes are returned as the ASCII values of the serial number.
    GetSetSerialNumberResponse([u8; 8]),

    /// The ‘I’ command returns the present scanner setup status.
    ///
    /// `ASCII character I = (49H)`
    ///
    /// # Response
    ///
    /// ```plaintext
    /// I <DPI Setting Low Byte>/<DPI Setting Hi Byte>/
    /// <Num of Bits per Pixel Low Byte>/< Num of Bits per Pixel Hi Byte>/ <Total Array Pixels Low Byte>/<Total Array Pixels Hi Byte>/
    /// <Num of Arrays Low Byte>/< Num of Arrays Hi Byte>/
    /// <Calibration Status Low Byte>/<Calibration Status Hi Byte>
    /// ```
    ///
    /// If present: `<Number of Calibration Tables Low Byte>/<Number of Calibration Tables High Byte>`
    /// Where:
    /// - DPI Setting = 100 or 200 dots per inch (PS4), or 150 or 300 DPI (US)
    /// - Num of Bits per Pixel = 1 (Bi-tonal) or 8 (Eight-bit Grayscale)
    /// - Total Array Pixels = 1728 pixels (PS4) for single-sided scanning; 3456 for double-sided scanning
    /// - Num of Arrays = 1 (Front/top array), 2 = (Back/bottom array), 3 = (Front & Back Arrays
    /// - Calibration Status = 1 (Calibration needed), 0 (Calibration OK)
    GetScannerSettingsResponse(Settings),

    GetSetRequiredInputSensorsResponse {
        /// The number of input sensors required.
        current_sensors_required: u8,

        /// Total number of sensors available.
        total_sensors_available: u8,
    },

    AdjustTopCISSensorThresholdResponse {
        percent_white_threshold: u8,
    },
    AdjustBottomCISSensorThresholdResponse {
        percent_white_threshold: u8,
    },

    GetCalibrationInformationResponse {
        white_calibration_table: Vec<u8>,
        black_calibration_table: Vec<u8>,
    },

    BeginScanEvent,
    EndScanEvent,
    DoubleFeedEvent,
}

#[derive(Debug)]
pub enum Packet {
    Outgoing(Outgoing),
    Incoming(Incoming),
}

#[derive(Debug)]
pub struct Command<'a> {
    data: &'a [u8],
}

impl<'a> Command<'a> {
    pub const fn new(data: &'a [u8]) -> Self {
        Self { data }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.data.len() + 2);
        bytes.extend_from_slice(PACKET_DATA_START);
        bytes.extend_from_slice(self.data);
        bytes.extend_from_slice(PACKET_DATA_END);
        bytes.push(crc(self.data));
        bytes
    }
}

pub(crate) fn crc(data: &[u8]) -> u8 {
    const POLYNOMIAL: u8 = 0x97;
    data.iter().fold(0, |crc, byte| {
        let mut crc = crc ^ byte;
        for _ in 0..8 {
            if crc & 0x80 != 0 {
                crc = (crc << 1) ^ POLYNOMIAL;
            } else {
                crc <<= 1;
            }
        }
        crc
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crc() {
        assert_eq!(crc(b"123456789"), 0x94);
    }

    #[test]
    fn test_command_to_bytes() {
        let command = Command::new(b"V");
        assert_eq!(command.to_bytes(), b"\x02V\x03\xb7");
    }
}
