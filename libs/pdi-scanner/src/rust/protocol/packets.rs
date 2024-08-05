use std::time::Duration;

use super::{
    parsers,
    types::{
        BitonalAdjustment, ClampedPercentage, Direction, DoubleFeedDetectionCalibrationType,
        Resolution, Settings, Side, Status, Version,
    },
};

pub(crate) const PACKET_DATA_START: &[u8] = &[0x02];
pub(crate) const PACKET_DATA_END: &[u8] = &[0x03];

/// All possible commands that can be sent to the scanner.
#[derive(Debug, Clone)]
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
    /// - Bit 4 (0x10): Cover Open = 1
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

    /// This command enables the scanner to process documents.
    ///
    /// `ASCII character 8 = (38H)`
    ///
    /// # Response
    ///
    /// No response.
    EnableFeederRequest,

    /// This command disables the scanner from processing documents. This is the DEFAULT mode.
    ///
    /// `ASCII character 9 = (39H)`
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

    /// Whenever a calibration procedure is performed, the bi-tonal (B/W)
    /// threshold is set to 75% of the average white value for all pixels (See
    /// Hardware Calibration Section 3.5).
    ///
    /// The bi-tonal threshold can be adjusted on a % basis (1 step = 1%), from
    /// its calibrated or present value, by issuing the following commands:
    ///
    /// - `<ESC> ‘+’ = (1BH) (2BH)`: Command to increase the Top CIS threshold by a single step.
    /// - `<ESC> ‘-’ = (1BH) (2DH)`: Command to decrease the Top CIS threshold by a single step.
    /// - `<ESC> ‘>’ = (1BH) (3EH)`: Command to increase the threshold of Top
    ///   CIS (simplex units) by five steps, or increase the Bottom CIS threshold
    ///   (duplex units) by one step.
    /// - `<ESC> ‘<’ = (1BH) (3CH)`: Command to decrease the threshold of Top
    ///   CIS (simplex units) by five steps, or decrease the Bottom CIS threshold
    ///   (duplex units) by one step.
    ///
    /// After execution of any (above) threshold adjustment command, the new
    /// threshold value is ‘echoed-back’ to the user - using the ’X’ (58H)
    /// character (for a text message), followed by a ‘T’ (54H) character (for
    /// top array - for simplex scanners), followed by a ‘SP’ (20H) character
    /// and concluding with 2 bytes representing the hex value of the new
    /// threshold.
    ///
    /// # Response
    ///
    /// `(58H) (54H) (20H) <2 Bytes (new)>`
    ///
    /// ## Example:
    ///
    /// ```plaintext
    /// <58H>/<54H>/<20H>/<34H>/<35H>
    ///                   └─────┬───┘
    ///                  Represents 45H
    /// ```
    ///
    /// New threshold = 45H = 69D = 69% of white value.
    ///
    /// Following any threshold adjustment, the new value is stored (in RAM),
    /// and will remain in effect, provided the unit is not powered-down or
    /// reset. The host must issue a ‘Save Command’, to permanently save a new
    /// (or existing) threshold level in Flash memory. The Format of the Save
    /// Command is:
    ///
    /// `<ESC> ‘$’ = (1BH) (24H)`
    ///
    /// After execution of the save command, the response format is similar to
    /// the response used for threshold adjustment, except that 2 additional
    /// bytes are inserted to indicate the value of the last default
    /// (calibration) threshold.
    AdjustBitonalThresholdBy1Request(BitonalAdjustment),

    /// The ‘W’ command returns the present scanner calibration information.
    ///
    /// `ASCII character W = (57H)`
    ///
    /// # Response
    ///
    /// ```plaintext
    /// W <Num of Top array pixels Low Byte>/< Num of Top array pixels Hi Byte>/
    /// <Top White Cal Value pixel 1>/< Top White Cal Value pixel 2>/..../<Top White Cal Value last pixel>/<Low order Checksum Byte>/<Hi order Checksum Byte>/<Top Black Cal Value pixel 1>/< Top Black Cal Value pixel 2>/..../<Top Black Cal Value last pixel>/<Low order Checksum Byte>/<Hi order Checksum Byte>
    /// ```
    ///
    /// If the scanner has both top and bottom arrays (Duplex Unit), the
    /// following additional information is sent:
    ///
    /// ```plaintext
    /// W <Num of Bottom array pixels Low Byte>/< Num of Bottom array pixels Hi Byte>/<Bottom White Cal Value pixel 1>/<Bottom White Cal Value pixel 2>/..../<Bottom White Cal Value last pixel>/<Low order Checksum Byte>/<Hi order Checksum Byte>/<Bottom Black Cal Value pixel 1>/<Bottom Black Cal Value pixel 2>/..../<Bottom Black Cal Value last pixel>/<Low order Checksum Byte>/<Hi order Checksum Byte>
    /// ```
    ///
    /// Where: Number of top or bottom array pixels = 15552 (PS4C600), 10368
    /// (OS4C400), 1728 (PS4), 1024 (US).
    ///
    /// Note: The color scanner has two sets of calibration tables. One table
    /// for the native resolution scanning and one table for half resolution
    /// scanning. The ‘W’ command has a parameter that will specify which table
    /// is desired. If none is specified then only the full native resolution
    /// table will be returned. The parameter can be either a 0 or a 1, where 0
    /// means the native table and 1 means the half resolution table.
    GetCalibrationInformationRequest {
        resolution: Option<Resolution>,
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

    /// This command sets a duplex scanner to scan both sides of a document
    /// (duplex mode).
    ///
    /// `ASCII character J = (4AH)`
    ///
    /// # Response
    ///
    /// No response.
    SetScannerToDuplexModeRequest,

    /// This command sets a duplex scanner to scan only the front-side (top) of the document.
    /// This is the DEFAULT mode.
    ///
    /// `ASCII character G = (47H)`
    ///
    /// # Response
    ///
    /// No response.
    SetScannerToTopOnlySimplexModeRequest,

    /// This command sets a duplex scanner to scan only the back-side (bottom)
    /// of the document.
    ///
    /// `ASCII character H = (48H)`
    ///
    /// # Response
    ///
    /// No response.
    SetScannerToBottomOnlySimplexModeRequest,

    EnablePickOnCommandModeRequest,
    DisablePickOnCommandModeRequest,
    EnableEjectPauseRequest,
    DisableEjectPauseRequest,
    TransmitInNativeBitsPerPixelRequest,
    TransmitInLowBitsPerPixelRequest,
    EnableAutoRunOutAtEndOfScanRequest,
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
        new_threshold: ClampedPercentage,
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

    /// This command turns-on the scan head (sense array) light source for a
    /// period of 10 seconds or until the ‘6’, turn array light source off,
    /// command is received.
    ///
    /// `ASCII character 5 = (35H)`
    ///
    /// # Response
    ///
    /// No response.
    TurnArrayLightSourceOnRequest,

    /// This command turns-off the sense array light source. This is the DEFAULT
    /// mode.
    ///
    /// `ASCII character 6 = (36H)`
    ///
    /// # Response
    ///
    /// No response.
    TurnArrayLightSourceOffRequest,

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

    EnableDoubleFeedDetectionRequest,
    DisableDoubleFeedDetectionRequest,
    CalibrateDoubleFeedDetectionRequest(DoubleFeedDetectionCalibrationType),
    SetDoubleFeedDetectionSensitivityRequest {
        percentage: ClampedPercentage,
    },
    SetDoubleFeedDetectionMinimumDocumentLengthRequest {
        length_in_hundredths_of_an_inch: u8,
    },

    /// Requests the double feed detection LED intensity (`n3a30`).
    GetDoubleFeedDetectionLedIntensityRequest,

    /// Requests the double feed detection calibration value for a single sheet
    /// (`n3a10`).
    GetDoubleFeedDetectionSingleSheetCalibrationValueRequest,

    /// Requests the double feed detection calibration value for a double sheet
    /// (`n3a20`).
    GetDoubleFeedDetectionDoubleSheetCalibrationValueRequest,

    /// Requests the double feed detection threshold value (`n3a90`).
    GetDoubleFeedDetectionDoubleSheetThresholdValueRequest,

    RawPacket(Vec<u8>),
}

macro_rules! checked {
    ($command:expr, $parser:expr) => {{
        let command = $command;
        if let Ok(([], _)) = $parser(&command.to_bytes()) {
            command.to_bytes()
        } else {
            panic!("Command {:?} failed to parse", command)
        }
    }};
}

impl Outgoing {
    #[must_use]
    pub fn to_bytes(&self) -> Vec<u8> {
        match &self {
            Self::GetTestStringRequest => {
                checked!(Command::new(b"D"), parsers::get_test_string_request)
            }
            Self::GetFirmwareVersionRequest => {
                checked!(Command::new(b"V"), parsers::get_firmware_version_request)
            }
            Self::GetCurrentFirmwareBuildVersionString => checked!(
                Command::new(b"\x1BV"),
                parsers::get_current_firmware_build_version_string_request
            ),
            Self::GetScannerStatusRequest => {
                checked!(Command::new(b"Q"), parsers::get_scanner_status_request)
            }
            Self::EnableFeederRequest => {
                checked!(Command::new(b"8"), parsers::enable_feeder_request)
            }
            Self::DisableFeederRequest => {
                checked!(Command::new(b"9"), parsers::disable_feeder_request)
            }
            Self::DisableMomentaryReverseOnFeedAtInputRequest => checked!(
                Command::new(b"\x1BO"),
                parsers::disable_momentary_reverse_on_feed_at_input_request
            ),
            Self::GetSerialNumberRequest => {
                checked!(Command::new(b"*"), parsers::get_serial_number_request)
            }
            Self::SetSerialNumberRequest(serial_number) => checked!(
                Command::new(b"*").with_data(serial_number),
                parsers::set_serial_number_request
            ),
            Self::GetScannerSettingsRequest => {
                checked!(Command::new(b"I"), parsers::get_scanner_settings_request)
            }
            Self::GetRequiredInputSensorsRequest => checked!(
                Command::new(b"\x1Bs"),
                parsers::get_input_sensors_required_request
            ),
            Self::SetRequiredInputSensorsRequest { sensors } => checked!(
                Command::new(b"\x1Bs").with_data(&[*sensors + b'0']),
                parsers::set_input_sensors_required_request
            ),
            Self::AdjustBitonalThresholdBy1Request(BitonalAdjustment { side, direction }) => {
                checked!(
                    Command::new(match (side, direction) {
                        (Side::Top, Direction::Increase) => b"\x1B+",
                        (Side::Top, Direction::Decrease) => b"\x1B-",
                        (Side::Bottom, Direction::Increase) => b"\x1B>",
                        (Side::Bottom, Direction::Decrease) => b"\x1B<",
                    }),
                    parsers::adjust_bitonal_threshold_by_1_request
                )
            }
            Self::GetCalibrationInformationRequest { resolution } => checked!(
                Command::new(match resolution {
                    Some(Resolution::Half) => b"W1",
                    Some(Resolution::Native) => b"W0",
                    Some(Resolution::Medium) | None => b"W",
                }),
                parsers::get_calibration_information_request
            ),
            Self::SetScannerImageDensityToHalfNativeResolutionRequest => checked!(
                Command::new(b"A"),
                parsers::set_scanner_image_density_to_half_native_resolution_request
            ),
            Self::SetScannerImageDensityToNativeResolutionRequest => checked!(
                Command::new(b"B"),
                parsers::set_scanner_image_density_to_native_resolution_request
            ),
            Self::SetScannerToDuplexModeRequest => checked!(
                Command::new(b"J"),
                parsers::set_scanner_to_duplex_mode_request
            ),
            Self::SetScannerToTopOnlySimplexModeRequest => checked!(
                Command::new(b"G"),
                parsers::set_scanner_to_top_only_simplex_mode_request
            ),
            Self::SetScannerToBottomOnlySimplexModeRequest => checked!(
                Command::new(b"H"),
                parsers::set_scanner_to_bottom_only_simplex_mode_request
            ),
            Self::EnablePickOnCommandModeRequest => checked!(
                Command::new(b"\x1bX"),
                parsers::enable_pick_on_command_mode_request
            ),
            Self::DisablePickOnCommandModeRequest => checked!(
                Command::new(b"\x1bY"),
                parsers::disable_pick_on_command_mode_request
            ),
            Self::EnableEjectPauseRequest => {
                checked!(Command::new(b"M"), parsers::enable_eject_pause_request)
            }
            Self::DisableEjectPauseRequest => {
                checked!(Command::new(b"N"), parsers::disable_eject_pause_request)
            }
            Self::TransmitInNativeBitsPerPixelRequest => checked!(
                Command::new(b"y"),
                parsers::transmit_in_native_bits_per_pixel_request
            ),
            Self::TransmitInLowBitsPerPixelRequest => checked!(
                Command::new(b"z"),
                parsers::transmit_in_low_bits_per_pixel_request
            ),
            Self::EnableAutoRunOutAtEndOfScanRequest => checked!(
                Command::new(b"\x1be"),
                parsers::enable_auto_run_out_at_end_of_scan_request
            ),
            Self::DisableAutoRunOutAtEndOfScanRequest => checked!(
                Command::new(b"\x1bd"),
                parsers::disable_auto_run_out_at_end_of_scan_request
            ),
            Self::ConfigureMotorToRunAtHalfSpeedRequest => checked!(
                Command::new(b"j"),
                parsers::configure_motor_to_run_at_half_speed_request
            ),
            Self::ConfigureMotorToRunAtFullSpeedRequest => checked!(
                Command::new(b"k"),
                parsers::configure_motor_to_run_at_full_speed_request
            ),
            Self::SetThresholdToANewValueRequest {
                side,
                new_threshold,
            } => checked!(
                Command::new(b"\x1B%").with_data(&[(*side).into(), new_threshold.value()]),
                parsers::set_bitonal_threshold_request
            ),
            Self::SetLengthOfDocumentToScanRequest {
                length_byte,
                unit_byte,
            } => checked!(
                Command::new(b"\x1BD").with_data(
                    &unit_byte.map_or_else(|| vec![*length_byte], |unit| vec![*length_byte, unit])
                ),
                parsers::set_length_of_document_to_scan_request
            ),
            Self::SetScanDelayIntervalForDocumentFeedRequest { delay_interval } => checked!(
                Command::new(b"\x1Bj").with_data(delay_interval.as_millis().to_string().as_bytes()),
                parsers::set_scan_delay_interval_for_document_feed_request
            ),
            Self::TurnArrayLightSourceOnRequest => checked!(
                Command::new(b"5"),
                parsers::turn_array_light_source_on_request
            ),
            Self::TurnArrayLightSourceOffRequest => checked!(
                Command::new(b"6"),
                parsers::turn_array_light_source_off_request
            ),
            Self::EjectDocumentToRearOfScannerRequest => checked!(
                Command::new(b"3"),
                parsers::eject_document_to_rear_of_scanner_request
            ),
            Self::EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest => checked!(
                Command::new(b"1"),
                parsers::eject_document_to_front_of_scanner_and_hold_in_input_rollers_request
            ),
            Self::EjectDocumentToFrontOfScannerRequest => checked!(
                Command::new(b"4"),
                parsers::eject_document_to_front_of_scanner_request
            ),
            Self::EjectEscrowDocumentRequest => todo!(),
            Self::RescanDocumentHeldInEscrowPositionRequest => checked!(
                Command::new(b"["),
                parsers::rescan_document_held_in_escrow_position_request
            ),
            Self::EnableDoubleFeedDetectionRequest => checked!(
                Command::new(b"n"),
                parsers::enable_double_feed_detection_request
            ),
            Self::DisableDoubleFeedDetectionRequest => checked!(
                Command::new(b"o"),
                parsers::disable_double_feed_detection_request
            ),
            Self::CalibrateDoubleFeedDetectionRequest(calibration_type) => checked!(
                Command::new(b"n1").with_data(u8::from(*calibration_type).to_string().as_bytes()),
                parsers::calibrate_double_feed_detection_request
            ),
            Self::SetDoubleFeedDetectionSensitivityRequest { percentage } => checked!(
                Command::new(b"n3A").with_data(percentage.value().to_string().as_bytes()),
                parsers::set_double_feed_detection_sensitivity_request
            ),
            Self::SetDoubleFeedDetectionMinimumDocumentLengthRequest {
                length_in_hundredths_of_an_inch,
            } => checked!(
                Command::new(b"n3B")
                    .with_data(length_in_hundredths_of_an_inch.to_string().as_bytes()),
                parsers::set_double_feed_detection_minimum_document_length_request
            ),
            Self::GetDoubleFeedDetectionLedIntensityRequest => checked!(
                Command::new(b"n3a30"),
                parsers::get_double_feed_detection_led_intensity_request
            ),
            Self::GetDoubleFeedDetectionSingleSheetCalibrationValueRequest => checked!(
                Command::new(b"n3a10"),
                parsers::get_double_feed_detection_single_sheet_calibration_value_request
            ),
            Self::GetDoubleFeedDetectionDoubleSheetCalibrationValueRequest => checked!(
                Command::new(b"n3a20"),
                parsers::get_double_feed_detection_double_sheet_calibration_value_request
            ),
            Self::GetDoubleFeedDetectionDoubleSheetThresholdValueRequest => checked!(
                Command::new(b"n3a90"),
                parsers::get_double_feed_detection_double_sheet_threshold_value_request
            ),
            Self::RawPacket(data) => checked!(Command::new(data), parsers::raw_outgoing),
        }
    }
}

/// All possible incoming data from the scanner, including responses to commands
/// and unsolicited messages.
#[derive(Debug, Clone)]
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
    /// - Bit 4 (0x10): Cover Open = 1
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
    GetSetRequiredInputSensorsResponse {
        /// The number of input sensors required.
        current_sensors_required: u8,

        /// Total number of sensors available.
        total_sensors_available: u8,
    },

    /// Whenever a calibration procedure is performed, the bi-tonal (B/W)
    /// threshold is set to 75% of the average white value for all pixels (See
    /// Hardware Calibration Section 3.5).
    ///
    /// The bi-tonal threshold can be adjusted on a % basis (1 step = 1%), from
    /// its calibrated or present value, by issuing the following commands:
    ///
    /// - `<ESC> ‘+’ = (1BH) (2BH)`: Command to increase the Top CIS threshold by a single step.
    /// - `<ESC> ‘-’ = (1BH) (2DH)`: Command to decrease the Top CIS threshold by a single step.
    /// - `<ESC> ‘>’ = (1BH) (3EH)`: Command to increase the threshold of Top
    ///   CIS (simplex units) by five steps, or increase the Bottom CIS threshold
    ///   (duplex units) by one step.
    /// - `<ESC> ‘<’ = (1BH) (3CH)`: Command to decrease the threshold of Top
    ///   CIS (simplex units) by five steps, or decrease the Bottom CIS threshold
    ///   (duplex units) by one step.
    ///
    /// After execution of any (above) threshold adjustment command, the new
    /// threshold value is ‘echoed-back’ to the user - using the ’X’ (58H)
    /// character (for a text message), followed by a ‘T’ (54H) character (for
    /// top array - for simplex scanners), followed by a ‘SP’ (20H) character
    /// and concluding with 2 bytes representing the hex value of the new
    /// threshold.
    ///
    /// # Response
    ///
    /// `(58H) (54H) (20H) <2 Bytes (new)>`
    ///
    /// ## Example:
    ///
    /// ```plaintext
    /// <58H>/<54H>/<20H>/<34H>/<35H>
    ///                   └─────┬───┘
    ///                  Represents 45H
    /// ```
    ///
    /// New threshold = 45H = 69D = 69% of white value.
    ///
    /// Following any threshold adjustment, the new value is stored (in RAM),
    /// and will remain in effect, provided the unit is not powered-down or
    /// reset. The host must issue a ‘Save Command’, to permanently save a new
    /// (or existing) threshold level in Flash memory. The Format of the Save
    /// Command is:
    ///
    /// `<ESC> ‘$’ = (1BH) (24H)`
    ///
    /// After execution of the save command, the response format is similar to
    /// the response used for threshold adjustment, except that 2 additional
    /// bytes are inserted to indicate the value of the last default
    /// (calibration) threshold.
    AdjustBitonalThresholdResponse {
        side: Side,
        percent_white_threshold: u8,
    },

    /// The ‘W’ command returns the present scanner calibration information.
    ///
    /// `ASCII character W = (57H)`
    ///
    /// # Response
    ///
    /// ```plaintext
    /// W <Num of Top array pixels Low Byte>/< Num of Top array pixels Hi Byte>/
    /// <Top White Cal Value pixel 1>/< Top White Cal Value pixel 2>/..../<Top White Cal Value last pixel>/<Low order Checksum Byte>/<Hi order Checksum Byte>/<Top Black Cal Value pixel 1>/< Top Black Cal Value pixel 2>/..../<Top Black Cal Value last pixel>/<Low order Checksum Byte>/<Hi order Checksum Byte>
    /// ```
    ///
    /// If the scanner has both top and bottom arrays (Duplex Unit), the
    /// following additional information is sent:
    ///
    /// ```plaintext
    /// W <Num of Bottom array pixels Low Byte>/< Num of Bottom array pixels Hi Byte>/<Bottom White Cal Value pixel 1>/<Bottom White Cal Value pixel 2>/..../<Bottom White Cal Value last pixel>/<Low order Checksum Byte>/<Hi order Checksum Byte>/<Bottom Black Cal Value pixel 1>/<Bottom Black Cal Value pixel 2>/..../<Bottom Black Cal Value last pixel>/<Low order Checksum Byte>/<Hi order Checksum Byte>
    /// ```
    ///
    /// Where: Number of top or bottom array pixels = 15552 (PS4C600), 10368
    /// (OS4C400), 1728 (PS4), 1024 (US).
    ///
    /// Note: The color scanner has two sets of calibration tables. One table
    /// for the native resolution scanning and one table for half resolution
    /// scanning. The ‘W’ command has a parameter that will specify which table
    /// is desired. If none is specified then only the full native resolution
    /// table will be returned. The parameter can be either a 0 or a 1, where 0
    /// means the native table and 1 means the half resolution table.
    GetCalibrationInformationResponse {
        white_calibration_table: Vec<u8>,
        black_calibration_table: Vec<u8>,
    },

    /// Response to the `n3a30` command to get the LED intensity for double feed
    /// detection.
    GetDoubleFeedDetectionLedIntensityResponse(u16),

    /// Response to the `n3a10` command to get the double feed detection
    /// calibration value for a single sheet.
    GetDoubleFeedDetectionSingleSheetCalibrationValueResponse(u16),

    /// Response to the `n3a20` command to get the double feed detection
    /// calibration value for a double sheet.
    GetDoubleFeedDetectionDoubleSheetCalibrationValueResponse(u16),

    /// Response to the `n3a90` command to get the double feed detection
    /// threshold value.
    GetDoubleFeedDetectionDoubleSheetThresholdValueResponse(u16),

    ScannerOkayEvent,
    DocumentJamEvent,
    CalibrationNeededEvent,
    ScannerCommandErrorEvent,
    ReadErrorEvent,
    MsdNeedsCalibrationEvent,
    MsdNotFoundOrOldFirmwareEvent,
    FifoOverflowEvent,
    CoverOpenEvent,
    CoverClosedEvent,
    CommandPacketCrcErrorEvent,
    FpgaOutOfDateEvent,
    CalibrationOkEvent,
    CalibrationShortCalibrationDocumentEvent,
    CalibrationDocumentRemovedEvent,
    CalibrationPixelErrorFrontArrayBlack,
    CalibrationPixelErrorFrontArrayWhite,
    CalibrationTimeoutError,
    CalibrationSpeedValueError,
    CalibrationSpeedBoxError,

    /// An unsolicited message from the scanner indicating that the scanner is
    /// initiating a scan.
    BeginScanEvent,

    /// An unsolicited message from the scanner indicating that the scanner has
    /// completed a scan and has sent the image data.
    EndScanEvent,

    /// An unsolicited message from the scanner indicating that the scanner has
    /// detected a double feed, i.e. two documents were fed into the scanner at
    /// the same time.
    DoubleFeedEvent,

    // An unsolicited message from the scanner indicating that the scanner has
    // paused ejecting a document to the rear because the front sensors were
    // covered (presumably due to another document being inserted).
    EjectPauseEvent,

    // An unsolicited message from the scanner indicating that the scanner has
    // resumed ejecting after an EjectPause event since the front sensors are
    // now clear.
    EjectResumeEvent,

    /// An unsolicited message from the scanner indicating that the scanner has
    /// completed the double-feed detection calibration.
    DoubleFeedCalibrationCompleteEvent,

    /// An unsolicited message from the scanner indicating that the scanner has
    /// timed out waiting for paper during double-feed detection calibration.
    DoubleFeedCalibrationTimedOutEvent,

    ImageData(Vec<u8>),

    /// Incoming data of an unknown type.
    Unknown(Vec<u8>),
}

impl Incoming {
    #[must_use]
    pub const fn is_event(&self) -> bool {
        matches!(
            self,
            Self::ScannerOkayEvent
                | Self::DocumentJamEvent
                | Self::CalibrationNeededEvent
                | Self::ScannerCommandErrorEvent
                | Self::ReadErrorEvent
                | Self::MsdNeedsCalibrationEvent
                | Self::MsdNotFoundOrOldFirmwareEvent
                | Self::FifoOverflowEvent
                | Self::CoverOpenEvent
                | Self::CoverClosedEvent
                | Self::CommandPacketCrcErrorEvent
                | Self::FpgaOutOfDateEvent
                | Self::CalibrationOkEvent
                | Self::CalibrationShortCalibrationDocumentEvent
                | Self::CalibrationDocumentRemovedEvent
                | Self::CalibrationPixelErrorFrontArrayBlack
                | Self::CalibrationPixelErrorFrontArrayWhite
                | Self::CalibrationTimeoutError
                | Self::CalibrationSpeedValueError
                | Self::CalibrationSpeedBoxError
                | Self::BeginScanEvent
                | Self::EndScanEvent
                | Self::DoubleFeedEvent
                | Self::EjectPauseEvent
                | Self::EjectResumeEvent
                | Self::DoubleFeedCalibrationCompleteEvent
                | Self::DoubleFeedCalibrationTimedOutEvent
        )
    }
}

/// All possible incoming or outgoing data between the host and the scanner.
#[derive(Debug)]
pub enum Packet {
    /// Packets sent from the host to the scanner.
    Outgoing(Outgoing),

    /// Packets sent from the scanner to the host.
    Incoming(Incoming),
}

/// Encapsulates a command to be sent to the scanner. Commands sent to the
/// scanner are always wrapped in a packet with a start and end byte, and are
/// followed by a CRC byte:
///
/// ```plaintext
/// <STX = 0x02> <body> <ETX 0x03> <CRC = crc(body)>
/// ```
#[derive(Debug)]
pub struct Command {
    body: Vec<u8>,
}

impl Command {
    #[must_use]
    pub fn new(tag: &[u8]) -> Self {
        Self { body: tag.to_vec() }
    }

    #[must_use]
    pub fn with_data(mut self, data: &[u8]) -> Self {
        self.body.extend_from_slice(data);
        self
    }

    #[must_use]
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.body.len() + 2);
        bytes.extend_from_slice(PACKET_DATA_START);
        bytes.extend_from_slice(&self.body);
        bytes.extend_from_slice(PACKET_DATA_END);
        bytes.push(crc(&self.body));
        bytes
    }
}

/// Computes the CRC for the given data. This is used to verify the integrity of
/// the data sent to the scanner. It is only used for requests, not responses.
///
/// The generator polynomial of 0x97 was provided by PDI and seems to be an
/// arbitrary choice. Otherwise, this implementation of CRC-8 is standard.
pub(crate) fn crc(data: &[u8]) -> u8 {
    const POLYNOMIAL: u8 = 0x97;
    data.iter().fold(0, |crc, byte| {
        let mut crc = crc ^ byte;
        for _ in 0..u8::BITS {
            if crc & 0x80 == 0 {
                crc <<= 1;
            } else {
                crc = (crc << 1) ^ POLYNOMIAL;
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
