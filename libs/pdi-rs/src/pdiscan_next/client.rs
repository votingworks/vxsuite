use std::time::Duration;

use nom::{
    bytes::complete::{tag, take},
    combinator::{map, map_res},
    number::complete::{le_u16, le_u8},
    IResult,
};

const PAGESCAN_VENDOR_ID: u16 = 0x0bd7;
const PAGESCAN_PRODUCT_ID: u16 = 0xa002;

#[derive(Debug)]
pub enum PacketType {
    /// Signifies host to scanner transaction.
    Out = 0b0001,
    /// Signifies scanner to host transaction.
    In = 0b1001,
    /// Start of frame marker (occurs once per MS denoting a USB frame).
    StartOfFrame = 0b0101,
    /// Unique to host control transfers. Host to peripheral, used to set up
    /// certain endpoints.
    Setup = 0b1101,
    /// Even data packet for bulk transfers.
    Data0 = 0b0011,
    /// Odd data packet for bulk transfers.
    Data1 = 0b1011,
    /// Signifies that receiver (host or scanner) has received error-free data
    /// packet.
    Ack = 0b0010,
    /// Signifies that receiver is busy, try again.
    Nack = 0b1010,
    /// Cannot interpret request, or access request to non-present resource.
    Stall = 0b1110,
}

impl PacketType {
    fn parse(input: &[u8]) -> IResult<&[u8], Self> {
        let (input, packet_type) = le_u8(input)?;

        match packet_type {
            0b0001 => Ok((input, Self::Out)),
            0b1001 => Ok((input, Self::In)),
            0b0101 => Ok((input, Self::StartOfFrame)),
            0b1101 => Ok((input, Self::Setup)),
            0b0011 => Ok((input, Self::Data0)),
            0b1011 => Ok((input, Self::Data1)),
            0b0010 => Ok((input, Self::Ack)),
            0b1010 => Ok((input, Self::Nack)),
            0b1110 => Ok((input, Self::Stall)),
            _ => Err(nom::Err::Error(nom::error::Error::new(
                input,
                nom::error::ErrorKind::Tag,
            ))),
        }
    }
}

#[derive(Debug)]
pub struct Config {
    vendor_id: u16,
    product_id: u16,
    configuration: u8,
    interface: u8,
    out_endpoint: u8,
    in_endpoint: u8,
}

impl Config {
    pub const fn new(
        vendor_id: u16,
        product_id: u16,
        configuration: u8,
        interface: u8,
        out_endpoint: u8,
        in_endpoint: u8,
    ) -> Self {
        Self {
            vendor_id,
            product_id,
            configuration,
            interface,
            out_endpoint,
            in_endpoint,
        }
    }
}

#[derive(Debug)]
pub struct Client {
    config: Config,
    context: rusb::Context,
    device: rusb::DeviceHandle<rusb::Context>,
}

impl Client {
    pub fn new(config: Config) -> Result<Self, Box<dyn std::error::Error>> {
        let context = rusb::Context::new().unwrap();

        let (_device, _descriptor, mut handle) =
            open_device(&context, config.vendor_id, config.product_id)?;

        handle.set_active_configuration(config.configuration)?;
        handle.claim_interface(config.interface)?;

        Ok(Self {
            config,
            context,
            device: handle,
        })
    }

    pub fn get_status(&mut self) -> Result<Status, Error> {
        eprintln!("requesting status from scanner");

        self.write(&[0x02, b'Q', 0x03, 0x7c])?;

        loop {
            let mut buffer = [0; 6];
            let read = self.read(&mut buffer)?;
            let input = &buffer[..read];

            let (input, packet_type) = PacketType::parse(input)?;

            if !matches!(packet_type, PacketType::Ack) {
                return Err(Error::Parse(format!("expected ACK, got {packet_type:?}")));
            }

            if let Ok((_, unsolicited_message)) = UnsolicitedStatusMessage::parse(input) {
                eprintln!("get_status: got unsolicited message: {unsolicited_message:?}");
                continue;
            }

            let (input, _) = tag("Q")(input)?;
            let (input, status_byte0) = le_u8(input)?;
            let (input, status_byte1) = le_u8(input)?;
            let (input, status_byte2) = le_u8(input)?;
            let (input, packet_type) = PacketType::parse(input)?;

            if !matches!(packet_type, PacketType::Data0) {
                return Err(Error::Parse(format!("expected DATA0, got {packet_type:?}")));
            }

            if !input.is_empty() {
                return Err(Error::Parse(format!("unexpected trailing data: {input:?}")));
            }

            return Ok(Status::new(
                status_byte0 & 0b0000_0001 != 0,
                status_byte0 & 0b0000_0010 != 0,
                status_byte0 & 0b0000_0100 != 0,
                status_byte0 & 0b0000_1000 != 0,
                status_byte0 & 0b0001_0000 != 0,
                status_byte0 & 0b0100_0000 != 0,
                status_byte1 & 0b0000_0001 != 0,
                status_byte1 & 0b0000_0010 != 0,
                status_byte1 & 0b0000_0100 != 0,
                status_byte1 & 0b0000_1000 != 0,
                status_byte1 & 0b0001_0000 != 0,
                status_byte1 & 0b0010_0000 != 0,
                status_byte1 & 0b0100_0000 != 0,
                status_byte2 & 0b0000_0001 != 0,
                status_byte2 & 0b0000_0010 != 0,
                status_byte2 & 0b0000_0100 != 0,
                status_byte2 & 0b0000_1000 != 0,
                status_byte2 & 0b0001_0000 != 0,
                status_byte2 & 0b0010_0000 != 0,
                status_byte2 & 0b0100_0000 != 0,
            ));
        }
    }

    pub fn get_test_string_from_scanner(&mut self) -> Result<&'static str, Error> {
        eprintln!("requesting test string from scanner");

        const EXPECTED_RESPONSE: &str = "D Test Message USB 1.1/2.0 Communication";

        self.write(&[0x02, b'D', 0x03, 0xb4])?;

        loop {
            let mut buffer = [0u8; 100];
            let read = self.read(&mut buffer)?;
            let input = &buffer[..read];

            let (input, packet_type) = PacketType::parse(input)?;

            if !matches!(packet_type, PacketType::Ack) {
                return Err(Error::Parse(format!("expected ACK, got {packet_type:?}")));
            }

            if let Ok((_, unsolicited_message)) = UnsolicitedStatusMessage::parse(input) {
                eprintln!("get_test_string_from_scanner: got unsolicited message: {unsolicited_message:?}");
                continue;
            }

            let (input, _message) = tag(EXPECTED_RESPONSE)(input)?;
            let (input, packet_type) = PacketType::parse(input)?;

            if !matches!(packet_type, PacketType::Data0) {
                return Err(Error::Parse(format!("expected DATA0, got {packet_type:?}")));
            }

            if !input.is_empty() {
                return Err(Error::Parse(format!("unexpected trailing data: {input:?}")));
            }

            return Ok(EXPECTED_RESPONSE);
        }
    }

    pub fn get_firmware_version(&mut self) -> Result<Version, Error> {
        eprintln!("requesting firmware version from scanner");

        self.write(&[0x02, b'V', 0x03, 0xb7])?;

        loop {
            let mut buffer = [0; 12];
            self.read(&mut buffer)?;
            let input = &buffer[..];

            let (input, packet_type) = PacketType::parse(input)?;

            if let Ok((_, unsolicited_message)) = UnsolicitedStatusMessage::parse(input) {
                eprintln!("get_firmware_version: got unsolicited message: {unsolicited_message:?}");
                continue;
            }

            if !matches!(packet_type, PacketType::Ack) {
                return Err(Error::Parse(format!("expected ACK, got {packet_type:?}")));
            }

            let (input, _) = tag("V")(input)?;
            let (input, product_id) = map_res(take(4usize), std::str::from_utf8)(input)?;
            let (input, major_version) = map_res(take(2usize), std::str::from_utf8)(input)?;
            let (input, minor_version) = map_res(take(2usize), std::str::from_utf8)(input)?;
            let (input, cpld_version) = map_res(take(1usize), std::str::from_utf8)(input)?;
            let (input, packet_type) = PacketType::parse(input)?;

            if !matches!(packet_type, PacketType::Data0) {
                return Err(Error::Parse(format!("expected DATA0, got {packet_type:?}")));
            }

            if !input.is_empty() {
                return Err(Error::Parse(format!("unexpected trailing data: {input:?}")));
            }

            return Ok(Version::new(
                product_id.to_string(),
                major_version.to_string(),
                minor_version.to_string(),
                cpld_version.to_string(),
            ));
        }
    }

    pub fn get_scan_settings(&mut self) -> Result<ScanSettings, Error> {
        eprintln!("requesting scan settings from scanner");

        self.write(&[0x02, b'I', 0x03, 0x9b])?;

        loop {
            let mut buffer = [0; 15];
            let read = self.read(&mut buffer)?;
            let input = &buffer[..read];

            let (input, packet_type) = PacketType::parse(input)?;

            if let Ok((_, unsolicited_message)) = UnsolicitedStatusMessage::parse(input) {
                eprintln!("get_scan_settings: got unsolicited message: {unsolicited_message:?}");
                continue;
            }

            if !matches!(packet_type, PacketType::Ack) {
                return Err(Error::Parse(format!("expected ACK, got {packet_type:?}")));
            }

            let (input, _) = tag("I")(input)?;

            let (input, dots_per_inch) = le_u16(input)?;
            let (input, bits_per_pixel) = le_u16(input)?;
            let (input, total_array_pixel_count) = le_u16(input)?;
            let (input, number_of_arrays) = le_u16(input)?;
            let (input, calibration_status) = le_u16(input)?;
            let (input, number_of_calibration_tables) = le_u16(input)?;
            let (input, packet_type) = PacketType::parse(input)?;

            if !matches!(packet_type, PacketType::Data0) {
                return Err(Error::Parse(format!("expected DATA0, got {packet_type:?}")));
            }

            if !input.is_empty() {
                return Err(Error::Parse(format!("unexpected trailing data: {input:?}")));
            }

            return Ok(ScanSettings::new(
                dots_per_inch,
                bits_per_pixel,
                total_array_pixel_count,
                number_of_arrays,
                calibration_status,
                number_of_calibration_tables,
            ));
        }
    }

    pub fn set_duplex_mode(&mut self, duplex_mode: DuplexMode) -> Result<(), Error> {
        eprintln!("setting duplex mode to {duplex_mode:?}");

        match duplex_mode {
            DuplexMode::SimplexFrontOnly => self.write(&[0x02, b'G', 0x03, 0x9a])?,
            // FIXME: 0x00 is a placeholder. what should this value be?
            DuplexMode::SimplexBackOnly => self.write(&[0x02, b'H', 0x03, 0x00])?,
            DuplexMode::Duplex => self.write(&[0x02, b'J', 0x03, 0xb5])?,
        };

        Ok(())
    }

    pub fn set_scan_delay_interval(&mut self, scan_delay_interval: Duration) -> Result<(), Error> {
        eprintln!("setting scan delay interval to {:?}", scan_delay_interval);

        let millis = scan_delay_interval.as_millis();
        let multiple_of_16ms = (millis / 16) as u16;

        if multiple_of_16ms > 200 {
            return Err(Error::InvalidArgument(format!(
                "scan delay interval must be between 0 and 3.2s, got {scan_delay_interval:?}"
            )));
        }

        self.write(&[0x02, 0x1b, b'j', 0x20 + multiple_of_16ms as u8, 0x03])?;

        Ok(())
    }

    pub fn set_eject_pause(&mut self, eject_pause: EjectPause) -> Result<(), Error> {
        eprintln!("setting eject pause to {eject_pause:?}");

        match eject_pause {
            // FIXME: 0x00 is a placeholder. what should this value be?
            EjectPause::Disabled => self.write(&[0x02, b'N', 0x03, 0x00])?,
            // FIXME: 0x00 is a placeholder. what should this value be?
            EjectPause::WhileInputSensorsCovered => self.write(&[0x02, b'M', 0x03, 0x00])?,
        };

        Ok(())
    }

    pub fn set_feeder_enabled(&mut self, feeder_enabled: bool) -> Result<(), Error> {
        eprintln!("setting feeder enabled to {feeder_enabled:?}");

        if feeder_enabled {
            self.write(&[0x02, b'8', 0x03, 0x04])?;
        } else {
            self.write(&[0x02, b'9', 0x03, 0x93])?;
        }

        Ok(())
    }

    pub fn wait_for_unsolicited_message(
        &mut self,
        timeout: Duration,
    ) -> Result<UnsolicitedStatusMessage, Error> {
        let mut buffer = [0; 100];

        let read = self
            .device
            .read_bulk(self.config.in_endpoint, &mut buffer, timeout)?;

        let input = &buffer[..read];

        let (input, packet_type) = PacketType::parse(input)?;

        if !matches!(packet_type, PacketType::Ack) {
            return Err(Error::Parse(format!("expected ACK, got {packet_type:?}")));
        }

        let (input, message) = UnsolicitedStatusMessage::parse(input)?;
        let (input, packet_type) = PacketType::parse(input)?;

        if !matches!(packet_type, PacketType::Data0) {
            return Err(Error::Parse(format!("expected DATA0, got {packet_type:?}")));
        }

        if !input.is_empty() {
            return Err(Error::Parse(format!("unexpected trailing data: {input:?}")));
        }

        Ok(message)
    }

    fn write(&mut self, data: &[u8]) -> Result<usize, Error> {
        let written =
            self.device
                .write_bulk(self.config.out_endpoint, data, Duration::from_secs(1))?;

        eprintln!("→ {:02x?} ({written} bytes)", &data[..written]);

        Ok(written)
    }

    fn read(&mut self, buffer: &mut [u8]) -> Result<usize, Error> {
        let read =
            self.device
                .read_bulk(self.config.in_endpoint, buffer, Duration::from_secs(1))?;

        eprintln!("← {:02x?} ({read} bytes)", &buffer[..read]);
        eprintln!("↳ as string: {:?}", std::str::from_utf8(&buffer[..read]));

        Ok(read)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Invalid argument: {0}")]
    InvalidArgument(String),
    #[error("USB error: {0}")]
    Usb(#[from] rusb::Error),
    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
    #[error("Parse: {0}")]
    Parse(String),
    #[error("Unsolicited message: {0:?}")]
    UnsolicitedStatusMessage(UnsolicitedStatusMessage),
}

impl From<nom::Err<nom::error::Error<&[u8]>>> for Error {
    fn from(err: nom::Err<nom::error::Error<&[u8]>>) -> Self {
        Self::Parse(format!("{err}"))
    }
}

fn open_device<T: rusb::UsbContext>(
    context: &T,
    vid: u16,
    pid: u16,
) -> rusb::Result<(
    rusb::Device<T>,
    rusb::DeviceDescriptor,
    rusb::DeviceHandle<T>,
)> {
    let devices = context.devices()?;

    for device in devices.iter() {
        let device_desc = match device.device_descriptor() {
            Ok(d) => d,
            Err(_) => continue,
        };

        if device_desc.vendor_id() == vid && device_desc.product_id() == pid {
            let handle = device.open()?;
            return Ok((device, device_desc, handle));
        }
    }

    Err(rusb::Error::NotFound)
}

#[derive(Debug)]
pub struct Version {
    product_id: String,
    major: String,
    minor: String,
    cpld_version: String,
}

impl Version {
    const fn new(product_id: String, major: String, minor: String, cpld_version: String) -> Self {
        Self {
            product_id,
            major,
            minor,
            cpld_version,
        }
    }
}

#[derive(Debug)]
pub struct ScanSettings {
    dots_per_inch: u16,
    bits_per_pixel: u16,
    total_array_pixel_count: u16,
    number_of_arrays: u16,
    calibration_status: u16,
    number_of_calibration_tables: u16,
}

impl ScanSettings {
    const fn new(
        dots_per_inch: u16,
        bits_per_pixel: u16,
        total_array_pixel_count: u16,
        number_of_arrays: u16,
        calibration_status: u16,
        number_of_calibration_tables: u16,
    ) -> Self {
        Self {
            dots_per_inch,
            bits_per_pixel,
            total_array_pixel_count,
            number_of_arrays,
            calibration_status,
            number_of_calibration_tables,
        }
    }
}

#[derive(Debug)]
pub enum DuplexMode {
    SimplexFrontOnly,
    SimplexBackOnly,
    Duplex,
}

#[derive(Debug)]
/// The status of the scanner.
///
/// Note: bit 7 of each byte is always set to 1.
pub struct Status {
    /// Byte 0, Bit 0 (0x01)
    rear_left_sensor_covered: bool,
    /// Byte 0, Bit 1 (0x02) – omitted in UltraScan
    rear_right_sensor_covered: bool,
    /// Byte 0, Bit 2 (0x04)
    brander_position_sensor_covered: bool,
    /// Byte 0, Bit 3 (0x08)
    hi_speed_mode: bool,
    /// Byte 0, Bit 4 (0x10)
    download_needed: bool,
    /// Byte 0, Bit 5 (0x20) – not defined
    /// future_use: bool,
    /// Byte 0, Bit 6 (0x40)
    scanner_enabled: bool,

    /// Byte 1, Bit 0 (0x01)
    front_left_sensor_covered: bool,
    /// Byte 1, Bit 1 (0x02) – omitted in UltraScan
    front_m1_sensor_covered: bool,
    /// Byte 1, Bit 2 (0x04) – omitted in UltraScan
    front_m2_sensor_covered: bool,
    /// Byte 1, Bit 3 (0x08) – omitted in UltraScan
    front_m3_sensor_covered: bool,
    /// Byte 1, Bit 4 (0x10) – omitted in UltraScan
    front_m4_sensor_covered: bool,
    /// Byte 1, Bit 5 (0x20) – omitted in Duplex and UltraScan
    front_m5_sensor_covered: bool,
    /// Byte 1, Bit 6 (0x40) – omitted in Duplex and UltraScan
    front_right_sensor_covered: bool,

    /// Byte 2, Bit 0 (0x01)
    scanner_ready: bool,
    /// Byte 2, Bit 1 (0x02) – com error
    xmt_aborted: bool,
    /// Byte 2, Bit 2 (0x04)
    document_jam: bool,
    /// Byte 2, Bit 3 (0x08)
    scan_array_pixel_error: bool,
    /// Byte 2, Bit 4 (0x10)
    in_diagnostic_mode: bool,
    /// Byte 2, Bit 5 (0x20)
    document_in_scanner: bool,
    /// Byte 2, Bit 6 (0x40)
    calibration_of_unit_needed: bool,
}

impl Status {
    pub const fn new(
        rear_left_sensor_covered: bool,
        rear_right_sensor_covered: bool,
        brander_position_sensor_covered: bool,
        hi_speed_mode: bool,
        download_needed: bool,
        scanner_enabled: bool,
        front_left_sensor_covered: bool,
        front_m1_sensor_covered: bool,
        front_m2_sensor_covered: bool,
        front_m3_sensor_covered: bool,
        front_m4_sensor_covered: bool,
        front_m5_sensor_covered: bool,
        front_right_sensor_covered: bool,
        scanner_ready: bool,
        xmt_aborted: bool,
        document_jam: bool,
        scan_array_pixel_error: bool,
        in_diagnostic_mode: bool,
        document_in_scanner: bool,
        calibration_of_unit_needed: bool,
    ) -> Self {
        Self {
            rear_left_sensor_covered,
            rear_right_sensor_covered,
            brander_position_sensor_covered,
            hi_speed_mode,
            download_needed,
            scanner_enabled,
            front_left_sensor_covered,
            front_m1_sensor_covered,
            front_m2_sensor_covered,
            front_m3_sensor_covered,
            front_m4_sensor_covered,
            front_m5_sensor_covered,
            front_right_sensor_covered,
            scanner_ready,
            xmt_aborted,
            document_jam,
            scan_array_pixel_error,
            in_diagnostic_mode,
            document_in_scanner,
            calibration_of_unit_needed,
        }
    }
}

#[derive(Debug)]
pub enum EjectPause {
    Disabled,
    WhileInputSensorsCovered,
}

#[derive(Debug)]
pub enum UnsolicitedStatusMessage {
    /// Scanner: OK
    ScannerOk,
    /// Scanner: Document Jam
    ScannerDocumentJam,
    /// Scanner: Calibration Needed
    ScannerCalibrationNeeded,
    /// Scanner: Calibration Error
    ScannerCommandError,
    /// Read Error
    ReadError,
    /// MSD Needs Calibration
    MsdNeedsCalibration,
    /// MSD Not Found/Old Firmware
    MsdNotFound,
    /// FIFO overflow (SDRAM overflow)
    FifoOverflow,
    /// Cover Open
    CoverOpen,
    /// Cover Closed
    CoverClosed,
    /// Command Packet CRC Error
    CommandPacketCrcError,
    /// FPGA out of date (bootloader must be updated)
    FpgaOutOfDate,
    /// Calibration: OK (Front Array)
    CalibrationOk,
    /// Calibration: Short Calibration Document
    CalibrationShortCalibrationDocument,
    /// Calibration: Document Removed
    CalibrationDocumentRemoved,
    /// Calibration: Pixel Error(s) (Front Array Black)
    CalibrationPixelErrorFrontArrayBlack,
    /// Calibration: Pixel Error(s) (Front Array White)
    CalibrationPixelErrorFrontArrayWhite,
    /// Calibration: Timeout error
    CalibrationTimeoutError,
    /// Calibration: Speed Value error
    CalibrationSpeedValueError,
    /// Calibration: Speed Box error
    CalibrationSpeedBoxError,
    /// Calibration: DAC Unresponsive
    CalibrationDacUnresponsive,
    /// Calibration: DAC Top can't reach value
    CalibrationDacTopCannotReachValue,
    /// Calibration: DAC Bottom can't reach value
    CalibrationDacBottomCannotReachValue,
    /// Calibration: DAC Top & Bottom can't reach value
    CalibrationDacTopAndBottomCannotReachValue,
    /// Calibration: Out of memory
    CalibrationOutOfMemory,
    /// Image processing: out of memory
    ImageProcessingOutOfMemory,
    /// Begin Scan
    BeginScan,
    /// End Scan
    EndScan,
    /// Double Feed
    DoubleFeed,
    /// Eject Pause
    EjectPause,
    /// Eject Resume
    EjectResume,
    /// Printer/Brander: OK
    PrinterOk,
    /// Printer/Brander: No document in Scanner
    PrinterNoDocumentInScanner,
    /// Brander Data too long
    BranderDataTooLong,
    /// Brander Overheating
    BranderOverheating,
    /// Calibration: Pixel Error(s) (Back Array Black)
    CalibrationPixelErrorBackArrayBlack,
    /// Calibration: Pixel Error(s) (Back Array White)
    CalibrationPixelErrorBackArrayWhite,
    /// Calibration: Short Document (Back Array)
    CalibrationShortDocumentBackArray,
    /// Calibration: Front not enough Light (red)
    CalibrationFrontNotEnoughLightRed,
    /// Calibration: Front too much Light (red)
    CalibrationFrontTooMuchLightRed,
    /// Calibration: Front not enough Light (blue)
    CalibrationFrontNotEnoughLightBlue,
    /// Calibration: Front too much Light (blue)
    CalibrationFrontTooMuchLightBlue,
    /// Calibration: Front not enough Light (green)
    CalibrationFrontNotEnoughLightGreen,
    /// Calibration: Front too much Light (green)
    CalibrationFrontTooMuchLightGreen,
    /// Calibration: Front pixel(s) too high
    CalibrationFrontPixelTooHigh,
    /// Calibration: Front pixel(s) too low
    CalibrationFrontPixelTooLow,
    /// Calibration: Back not enough Light (red)
    CalibrationBackNotEnoughLightRed,
    /// Calibration: Back too much Light (red)
    CalibrationBackTooMuchLightRed,
    /// Calibration: Back not enough Light (blue)
    CalibrationBackNotEnoughLightBlue,
    /// Calibration: Back too much Light (blue)
    CalibrationBackTooMuchLightBlue,
    /// Calibration: Back not enough Light (green)
    CalibrationBackNotEnoughLightGreen,
    /// Calibration: Back too much Light (green)
    CalibrationBackTooMuchLightGreen,
    /// Calibration: Back pixel(s) too high
    CalibrationBackPixelTooHigh,
    /// Calibration: Back pixel(s) too low
    CalibrationBackPixelTooLow,
}

impl UnsolicitedStatusMessage {
    fn parse(input: &[u8]) -> IResult<&[u8], Self> {
        let (input, _) = tag("#")(input)?;
        let (input, type_byte) = le_u8(input)?;
        let (input, id_byte) = le_u8(input)?;

        match (type_byte, id_byte) {
            (b'0', b'0') => Ok((input, Self::ScannerOk)),
            (b'0', b'1') => Ok((input, Self::ScannerDocumentJam)),
            (b'0', b'2') => Ok((input, Self::ScannerCalibrationNeeded)),
            (b'0', b'3') => Ok((input, Self::ScannerCommandError)),
            (b'0', b'6') => Ok((input, Self::ReadError)),
            (b'0', b'7') => Ok((input, Self::MsdNeedsCalibration)),
            (b'0', b'8') => Ok((input, Self::MsdNotFound)),
            (b'0', b'9') => Ok((input, Self::FifoOverflow)),
            (b'0', b'C') => Ok((input, Self::CoverOpen)),
            (b'0', b'D') => Ok((input, Self::CoverClosed)),
            (b'0', b'E') => Ok((input, Self::CommandPacketCrcError)),
            (b'0', b'F') => Ok((input, Self::FpgaOutOfDate)),
            (b'1', b'0') => Ok((input, Self::CalibrationOk)),
            (b'1', b'1') => Ok((input, Self::CalibrationShortCalibrationDocument)),
            (b'1', b'2') => Ok((input, Self::CalibrationDocumentRemoved)),
            (b'1', b'3') => Ok((input, Self::CalibrationPixelErrorFrontArrayBlack)),
            (b'1', b'9') => Ok((input, Self::CalibrationPixelErrorFrontArrayWhite)),
            (b'1', b'A') => Ok((input, Self::CalibrationTimeoutError)),
            (b'1', b'B') => Ok((input, Self::CalibrationSpeedValueError)),
            (b'1', b'C') => Ok((input, Self::CalibrationSpeedBoxError)),
            (b'1', b'D') => Ok((input, Self::CalibrationDacUnresponsive)),
            (b'1', b'E') => Ok((input, Self::CalibrationDacTopCannotReachValue)),
            (b'1', b'F') => Ok((input, Self::CalibrationDacBottomCannotReachValue)),
            (b'1', b'G') => Ok((input, Self::CalibrationDacTopAndBottomCannotReachValue)),
            (b'1', b'M') => Ok((input, Self::CalibrationOutOfMemory)),
            (b'2', b'M') => Ok((input, Self::ImageProcessingOutOfMemory)),
            (b'3', b'0') => Ok((input, Self::BeginScan)),
            (b'3', b'1') => Ok((input, Self::EndScan)),
            (b'3', b'3') => Ok((input, Self::DoubleFeed)),
            (b'3', b'6') => Ok((input, Self::EjectPause)),
            (b'3', b'7') => Ok((input, Self::EjectResume)),
            (b'4', b'0') => Ok((input, Self::PrinterOk)),
            (b'4', b'1') => Ok((input, Self::PrinterNoDocumentInScanner)),
            (b'4', b'2') => Ok((input, Self::BranderDataTooLong)),
            (b'4', b'7') => Ok((input, Self::BranderOverheating)),
            (b'5', b'1') => Ok((input, Self::CalibrationPixelErrorBackArrayBlack)),
            (b'5', b'3') => Ok((input, Self::CalibrationPixelErrorBackArrayWhite)),
            (b'5', b'4') => Ok((input, Self::CalibrationShortDocumentBackArray)),
            (b'7', b'1') => Ok((input, Self::CalibrationFrontNotEnoughLightRed)),
            (b'7', b'2') => Ok((input, Self::CalibrationFrontTooMuchLightRed)),
            (b'7', b'3') => Ok((input, Self::CalibrationFrontNotEnoughLightBlue)),
            (b'7', b'4') => Ok((input, Self::CalibrationFrontTooMuchLightBlue)),
            (b'7', b'5') => Ok((input, Self::CalibrationFrontNotEnoughLightGreen)),
            (b'7', b'6') => Ok((input, Self::CalibrationFrontTooMuchLightGreen)),
            (b'7', b'7') => Ok((input, Self::CalibrationFrontPixelTooHigh)),
            (b'7', b'8') => Ok((input, Self::CalibrationFrontPixelTooLow)),
            (b'8', b'1') => Ok((input, Self::CalibrationBackNotEnoughLightRed)),
            (b'8', b'2') => Ok((input, Self::CalibrationBackTooMuchLightRed)),
            (b'8', b'3') => Ok((input, Self::CalibrationBackNotEnoughLightBlue)),
            (b'8', b'4') => Ok((input, Self::CalibrationBackTooMuchLightBlue)),
            (b'8', b'5') => Ok((input, Self::CalibrationBackNotEnoughLightGreen)),
            (b'8', b'6') => Ok((input, Self::CalibrationBackTooMuchLightGreen)),
            (b'8', b'7') => Ok((input, Self::CalibrationBackPixelTooHigh)),
            (b'8', b'8') => Ok((input, Self::CalibrationBackPixelTooLow)),
            _ => Err(nom::Err::Error(nom::error::Error::new(
                input,
                nom::error::ErrorKind::Tag,
            ))),
        }
    }
}
