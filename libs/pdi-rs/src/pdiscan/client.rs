use rusb::{Context, Device, UsbContext};
use std::{
    pin::Pin,
    sync::mpsc::RecvTimeoutError,
    time::{Duration, Instant},
};

use crate::pdiscan::transfer::Handler;

use super::{
    protocol::{
        packets::{Command, Incoming},
        parsers,
        types::{
            ColorMode, Direction, EjectMotion, Resolution, ScanSideMode, Settings, Side, Speed,
            Status, Version,
        },
    },
    transfer::Event,
};

/// Vendor ID for the PDI scanner.
const VENDOR_ID: u16 = 0x0bd7;

/// Product ID for the PDI scanner.
const PRODUCT_ID: u16 = 0xa002;

/// The endpoint for sending commands to the scanner.
const ENDPOINT_OUT: u8 = 0x05;

/// The primary endpoint for receiving responses from the scanner.
const ENDPOINT_IN_PRIMARY: u8 = 0x85;

/// The alternate endpoint for receiving responses from the scanner, used to
/// receive image data.
const ENDPOINT_IN_IMAGE_DATA: u8 = 0x86;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("libusb error: {0}")]
    Usb(#[from] rusb::Error),

    #[error("failed to validate request: {0}")]
    ValidateRequest(String),

    #[error("failed to receive response: {0}")]
    RecvTimeout(#[from] RecvTimeoutError),

    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::str::Utf8Error),
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug)]
pub struct PdiClient {
    /// We need to keep the device around so that it doesn't get dropped and
    /// closed, but we don't actually need to do anything with it.
    _device: Device<Context>,

    /// The transfer handler is responsible for managing the libusb transfers
    /// and handling the callbacks. It needs to be pinned because it passes
    /// a pointer to itself to libusb, and we need to ensure that the pointer
    /// remains valid.
    transfer_handler: Pin<Box<Handler>>,

    /// Receiver for events from the transfer handler.
    event_rx: std::sync::mpsc::Receiver<Event>,

    get_test_string_response: Option<String>,
    get_firmware_version_response: Option<Version>,
    get_scanner_status_response: Option<Status>,
    get_scanner_settings_response: Option<Settings>,
    get_serial_number_response: Option<Incoming>,
    get_required_input_sensors_response: Option<Incoming>,
    adjust_bitonal_threshold_by_1_response: Option<Incoming>,

    begin_scan_tx: std::sync::mpsc::Sender<()>,
    pub begin_scan_rx: std::sync::mpsc::Receiver<()>,
    end_scan_tx: std::sync::mpsc::Sender<()>,
    pub end_scan_rx: std::sync::mpsc::Receiver<()>,
}

impl PdiClient {
    pub fn open() -> Result<Self> {
        let ctx = rusb::Context::new()?;
        let Some(device) = ctx.devices()?.iter().find(|device| {
            let device_desc = device.device_descriptor().unwrap();
            device_desc.vendor_id() == VENDOR_ID && device_desc.product_id() == PRODUCT_ID
        }) else {
            return Err(rusb::Error::NotFound.into());
        };

        let mut device_handle = device.open()?;
        device_handle.set_active_configuration(1)?;
        device_handle.claim_interface(0)?;

        let output_endpoint = ENDPOINT_OUT;
        let input_endpoints = &[ENDPOINT_IN_PRIMARY, ENDPOINT_IN_IMAGE_DATA];

        let (tx, rx) = std::sync::mpsc::channel();
        let (begin_scan_tx, begin_scan_rx) = std::sync::mpsc::channel();
        let (end_scan_tx, end_scan_rx) = std::sync::mpsc::channel();
        let mut client = Self {
            _device: device,
            transfer_handler: Box::pin(Handler::new(
                device_handle,
                output_endpoint,
                input_endpoints,
                tx,
            )),
            event_rx: rx,
            get_test_string_response: None,
            get_firmware_version_response: None,
            get_scanner_status_response: None,
            get_scanner_settings_response: None,
            get_serial_number_response: None,
            get_required_input_sensors_response: None,
            adjust_bitonal_threshold_by_1_response: None,
            begin_scan_tx,
            begin_scan_rx,
            end_scan_tx,
            end_scan_rx,
        };

        client.transfer_handler.start_handle_events_thread();

        Ok(client)
    }

    /// Connects to the scanner using the same commands that were captured by
    /// wireshark from the `scan_demo` program. Some of them may not be
    /// necessary, but they're included for now.
    pub fn send_connect(&mut self) -> Result<()> {
        let timeout = Duration::from_secs(5);
        let deadline = Instant::now() + timeout;

        // OUT DisableFeederRequest
        self.set_feeder_enabled(false)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 4f 03 c7> } (string: "\u{2}O\u{3}�") (length: 4)
        self.send_command(Command::new(b"O"));
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 1b 55 03 a0> } (string: "\u{2}\u{1b}U\u{3}�") (length: 5)
        self.send_command(Command::new(b"\x1bU"));
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 1b 4b 03 1b> } (string: "\u{2}\u{1b}K\u{3}\u{1b}") (length: 5)
        self.send_command(Command::new(b"\x1bK"));
        // OUT GetFirmwareVersionRequest
        // IN GetFirmwareVersionResponse(Version { product_id: "9072", major: "20", minor: "28", cpld_version: "X" })
        self.get_firmware_version(timeout)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 30 38 03 29> } (string: "\u{2}<008\u{3})") (length: 7)
        self.send_command(Command::new(b"<008"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 30 38 30 30 30 30 38 30 32 32 03> } (string: "\u{2}<00800008022\u{3}") (length: 14)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 33 38 03 cb> } (string: "\u{2}<038\u{3}�") (length: 7)
        self.send_command(Command::new(b"<038"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 33 38 30 30 30 36 38 44 38 30 03> } (string: "\u{2}<03800068D80\u{3}") (length: 14)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 31 34 03 42> } (string: "\u{2}<014\u{3}B") (length: 7)
        self.send_command(Command::new(b"<014"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 31 34 30 30 30 30 30 30 30 30 03> } (string: "\u{2}<01400000000\u{3}") (length: 14)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 30 37 03 bf> } (string: "\u{2}<007\u{3}�") (length: 7)
        self.send_command(Command::new(b"<007"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 30 37 33 33 33 33 33 33 33 33 03> } (string: "\u{2}<00733333333\u{3}") (length: 14)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 30 39 03 be> } (string: "\u{2}<009\u{3}�") (length: 7)
        self.send_command(Command::new(b"<009"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 30 39 30 30 30 30 30 30 30 38 03> } (string: "\u{2}<00900000008\u{3}") (length: 14)
        self.await_event(deadline)?;
        // OUT GetSerialNumberRequest
        // IN GetSetSerialNumberResponse([48, 48, 48, 48, 48, 48, 48, 48])
        self.get_serial_number(timeout)?;
        // OUT GetScannerSettingsRequest
        self.validate_and_send_command(Command::new(b"I"), parsers::get_scanner_settings_request)?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 49 96 01 01 00 00 1b 03 00 00 00 02 00 03> } (string: "\u{2}I�\u{1}\u{1}\0\0\u{1b}\u{3}\0\0\0\u{2}\0\u{3}") (length: 15)
        self.await_event(deadline)?;
        // OUT GetCalibrationInformationRequest { resolution: Some(Native) }
        self.validate_and_send_command(
            Command::new(b"W0"),
            parsers::get_calibration_information_request,
        )?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 80 0d 08 bf bf b8 bb ba bf b9 b5 b4 b7 bb b7 b5 b4 b8 bb b5 b8 b6 b9 bb b7 b7 b6 ba bb b7 b6 b5 bc ba b7 b8 b6 bb bb b6 b9 b8 bf ba b9 b8 b8 bf bb b9 ba bb bf bc b9 ba bb bf bd bd ba be c2 bb bd ba bf c0 bd be bc c2 c0 bb bd bc c1 c2 bc bd be c4 c1 bd bc be c2 c1 bd bf bf c4 c1 bf c0 c0 c4 bf …> } (string: "\u{2}W�\r\u{8}�����������������������������������������������������������»�������������¼�����������������Ŀ") (length: 6922)
        self.await_event(deadline)?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 80 0d 18 a3 a3 a3 a3 a3 a5 a4 ab af aa ac ad b4 b6 b2 b4 b4 b9 b7 b3 b5 b5 b8 b9 b5 b6 b7 bd b9 b8 b7 bb bf bd b9 ba bb c0 bb bc bb bf c0 bc bb ba be c1 bb bb ba bf c0 ba bb bd c1 c1 bb be bf c3 c0 bc c0 bf c3 c2 be bf be c3 be be bb c0 c3 c0 bf be c1 c4 bd bd bd c2 c2 be bf bd c0 c1 bd bf bd …> } (string: "\u{2}W�\r\u{18}�������������������������������������������������������������������¾��þ��������Ľ���¾�������") (length: 6922)
        self.await_event(deadline)?;
        // OUT GetCalibrationInformationRequest { resolution: Some(Half) }
        self.validate_and_send_command(
            Command::new(b"W1"),
            parsers::get_calibration_information_request,
        )?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 c0 06 08 b0 b0 b0 af b4 af b4 b1 b2 b6 b3 b7 b2 b6 b5 b5 b8 b5 b9 b6 b4 bb b7 ba b7 b8 bc b9 bf ba ba bc ba bf b9 bd bc bc c1 bc bf be be c0 be c0 bc be be bc c2 bd be c0 bf c1 be c0 c0 c0 c3 c0 c3 bf c2 c2 c1 c4 c0 c4 c5 c2 c8 c2 c4 c4 c3 c6 c2 c6 c3 c3 c8 c3 c6 c6 c3 c8 c4 c8 c3 c5 c6 c3 c9 …> } (string: "\u{2}W�\u{6}\u{8}��������������������������������������������������½����������ÿ�������������������������������") (length: 3466)
        self.await_event(deadline)?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 c0 06 18 a9 a9 a9 a9 a9 af ae b2 b1 af b5 b0 b6 b3 b4 b9 b6 b8 b7 b8 b9 b4 bb b6 b7 b8 b7 bc b8 ba b8 ba be b8 bb b9 b8 bb bb be ba bb bd bb bf bb be be bc c0 bc bd bd bb bf bb be bb bd bd bc bf be bf c1 bf c2 c0 c1 bf be c2 be c0 c1 bf c2 bd c2 c1 c0 c2 be c4 bf be c1 be c3 bf c1 c0 c1 c2 bf …> } (string: "\u{2}W�\u{6}\u{18}�����������������������������������������������������������������������¾���½���¾Ŀ���ÿ���¿") (length: 3466)
        self.await_event(deadline)?;
        // OUT GetScannerStatusRequest
        // IN GetScannerStatusResponse(Status { rear_left_sensor_covered: false, rear_right_sensor_covered: false, brander_position_sensor_covered: false, hi_speed_mode: true, download_needed: false, scanner_enabled: false, front_left_sensor_covered: false, front_m1_sensor_covered: false, front_m2_sensor_covered: false, front_m3_sensor_covered: false, front_m4_sensor_covered: false, front_m5_sensor_covered: false, front_right_sensor_covered: false, scanner_ready: true, xmt_aborted: false, document_jam: false, scan_array_pixel_error: false, in_diagnostic_mode: false, document_in_scanner: false, calibration_of_unit_needed: false })
        self.get_scanner_status(timeout)?;
        // OUT GetRequiredInputSensorsRequest
        // IN GetSetRequiredInputSensorsResponse { current_sensors_required: 2, total_sensors_available: 5 }
        self.get_required_input_sensors(timeout)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 33 61 31 30 30 03 7a> } (string: "\u{2}n3a100\u{3}z") (length: 9)
        self.send_command(Command::new(b"n3a100"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 6e 33 61 31 30 30 3d 35 30 03> } (string: "\u{2}n3a100=50\u{3}") (length: 11)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 33 61 31 30 31 03 ed> } (string: "\u{2}n3a101\u{3}�") (length: 9)
        self.send_command(Command::new(b"n3a101"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 6e 33 61 31 30 31 3d 34 30 03> } (string: "\u{2}n3a101=40\u{3}") (length: 11)
        self.await_event(deadline)?;
        // OUT IncreaseTopCISSensorThresholdBy1Request
        // IN AdjustTopCISSensorThresholdResponse { percent_white_threshold: 76 }
        self.adjust_bitonal_threshold_by_1(Side::Top, Direction::Increase, timeout)?;
        // OUT DecreaseTopCISSensorThresholdBy1Request
        // IN AdjustTopCISSensorThresholdResponse { percent_white_threshold: 75 }
        self.adjust_bitonal_threshold_by_1(Side::Top, Direction::Decrease, timeout)?;
        // OUT IncreaseBottomCISSensorThresholdBy1Request
        // IN AdjustBottomCISSensorThresholdResponse { percent_white_threshold: 76 }
        self.adjust_bitonal_threshold_by_1(Side::Bottom, Direction::Increase, timeout)?;
        // OUT DecreaseBottomCISSensorThresholdBy1Request
        // IN AdjustBottomCISSensorThresholdResponse { percent_white_threshold: 75 }
        self.adjust_bitonal_threshold_by_1(Side::Bottom, Direction::Decrease, timeout)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 34 03 60> } (string: "\u{2}#4\u{3}`") (length: 5)
        self.send_command(Command::new(b"#4"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 32 30 32 38 03> } (string: "\u{2}X2028\u{3}") (length: 7)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 35 03 f7> } (string: "\u{2}#5\u{3}�") (length: 5)
        self.send_command(Command::new(b"#5"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 36 35 38 35 36 31 35 37 03> } (string: "\u{2}X65856157\u{3}") (length: 11)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 33 03 ab> } (string: "\u{2}#3\u{3}�") (length: 5)
        self.send_command(Command::new(b"#3"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 31 30 30 35 03> } (string: "\u{2}X1005\u{3}") (length: 7)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 30 03 85> } (string: "\u{2}#0\u{3}�") (length: 5)
        self.send_command(Command::new(b"#0"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 35 38 03> } (string: "\u{2}X58\u{3}") (length: 5)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 31 03 12> } (string: "\u{2}#1\u{3}\u{12}") (length: 5)
        self.send_command(Command::new(b"#1"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 43 03> } (string: "\u{2}XC\u{3}") (length: 4)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 32 03 3c> } (string: "\u{2}#2\u{3}<") (length: 5)
        self.send_command(Command::new(b"#2"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 34 34 39 39 35 03> } (string: "\u{2}X44995\u{3}") (length: 8)
        self.await_event(deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 36 03 d9> } (string: "\u{2}#6\u{3}�") (length: 5)
        self.send_command(Command::new(b"#6"));
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 34 03> } (string: "\u{2}X4\u{3}") (length: 4)
        self.await_event(deadline)?;

        Ok(())
    }

    /// Sends the same commands to enable scanning that were captured by
    /// wireshark from the `scan_demo` program. Some of them may not be
    /// necessary, but they're included for now.
    pub fn send_enable_scan_commands(&mut self) -> Result<()> {
        let timeout = Duration::from_secs(5);

        // OUT SetScannerImageDensityToHalfNativeResolutionRequest
        self.set_scan_resolution(Resolution::Half)?;
        // OUT SetScannerToDuplexModeRequest
        self.set_scan_side_mode(ScanSideMode::Duplex)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 67 03 79> } (string: "\u{2}g\u{3}y") (length: 4)
        self.send_command(Command::new(b"g"));
        // OUT DisablePickOnCommandModeRequest
        self.disable_pick_on_command_mode()?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6f 03 24> } (string: "\u{2}o\u{3}$") (length: 4)
        self.send_command(Command::new(b"o"));
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 33 41 35 30 03 7f> } (string: "\u{2}n3A50\u{3}\u{7f}") (length: 8)
        self.send_command(Command::new(b"n3A50"));
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 33 42 34 30 03 05> } (string: "\u{2}n3B40\u{3}\u{5}") (length: 8)
        self.send_command(Command::new(b"n3B40"));
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 03 b3> } (string: "\u{2}n\u{3}�") (length: 4)
        self.send_command(Command::new(b"n"));
        // OUT DisableEjectPauseRequest
        self.disable_eject_pause()?;
        // OUT TransmitInLowBitsPerPixelRequest
        self.set_color_mode(ColorMode::LowColor)?;
        // OUT DisableAutoRunOutAtEndOfScanRequest
        self.disable_auto_run_out_at_end_of_scan()?;
        // OUT ConfigureMotorToRunAtFullSpeedRequest
        self.set_motor_speed(Speed::Full)?;
        // OUT SetThresholdToANewValueRequest { side: Top, new_threshold: 75 }
        // IN AdjustTopCISSensorThresholdResponse { percent_white_threshold: 75 }
        self.set_threshold(Side::Top, 75, timeout)?;
        // OUT SetThresholdToANewValueRequest { side: Bottom, new_threshold: 75 }
        // IN AdjustBottomCISSensorThresholdResponse { percent_white_threshold: 75 }
        self.set_threshold(Side::Bottom, 75, timeout)?;
        // OUT SetRequiredInputSensorsRequest { sensors: 2 }
        self.set_required_input_sensors(2)?;
        // OUT SetLengthOfDocumentToScanRequest { length_byte: 32, unit_byte: None }
        self.set_length_of_document_to_scan(0.0)?;
        // OUT SetScanDelayIntervalForDocumentFeedRequest { delay_interval: 0ns }
        self.set_scan_delay_interval_for_document_feed(Duration::ZERO)?;
        // OUT SetLengthOfDocumentToScanRequest { length_byte: 203, unit_byte: Some(49) }
        self.set_length_of_document_to_scan(0.0)?;
        // OUT GetTestStringRequest
        // IN GetTestStringResponse(" Test Message USB 1.1/2.0 Communication")
        self.get_test_string(timeout)?;
        // OUT EnableFeederRequest
        self.set_feeder_enabled(true)?;

        Ok(())
    }

    /// Send a command to the scanner, but don't wait for a response.
    fn send_command(&mut self, command: Command) {
        self.transfer_handler.submit_transfer(&command.to_bytes());
    }

    /// Validate that a command can be properly validated by the associated
    /// parser and then send it to the scanner.
    fn validate_and_send_command<O>(
        &mut self,
        command: Command,
        parser: impl Fn(&[u8]) -> nom::IResult<&[u8], O>,
    ) -> Result<()> {
        let Ok(([], _)) = parser(&command.to_bytes()) else {
            return Err(Error::ValidateRequest(format!(
                "command failed to validate: {command:?}"
            )));
        };
        self.send_command(command);
        Ok(())
    }

    /// Gets a hardcoded test string from the scanner. It should always return
    /// " Test Message USB 1.1/2.0 Communication".
    ///
    /// If a timeout is provided, the function will return an error if the
    /// response is not received within the timeout. Pass `None` to wait
    /// indefinitely.
    pub fn get_test_string(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<String> {
        if let Some(test_string) = self.get_test_string_response.take() {
            tracing::warn!("get_test_string: found a cached response: {test_string:?}");
        }

        self.validate_and_send_command(Command::new(b"D"), parsers::get_test_string_request)?;

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(test_string) = self.get_test_string_response.take() {
                return Ok(test_string);
            }
        }
    }

    /// Get the firmware version from the scanner.
    ///
    /// If a timeout is provided, the function will return an error if the
    /// response is not received within the timeout. Pass `None` to wait
    /// indefinitely.
    pub fn get_firmware_version(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<Version> {
        if let Some(version) = self.get_firmware_version_response.take() {
            tracing::warn!("get_firmware_version: found a cached response: {version:?}");
        }

        self.validate_and_send_command(Command::new(b"V"), parsers::get_firmware_version_request)?;

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(version) = self.get_firmware_version_response.take() {
                return Ok(version);
            }
        }
    }

    /// Get the scanner status, such as whether the sensors detect paper.
    ///
    /// If a timeout is provided, the function will return an error if the
    /// response is not received within the timeout. Pass `None` to wait
    /// indefinitely.
    pub fn get_scanner_status(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<Status> {
        if let Some(status) = self.get_scanner_status_response.take() {
            tracing::warn!("get_scanner_status: found a cached response: {status:?}");
        }

        self.validate_and_send_command(Command::new(b"Q"), parsers::get_scanner_status_request)?;

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(status) = self.get_scanner_status_response.take() {
                return Ok(status);
            }
        }
    }

    /// Get the scanner settings, pixels per inch and bits per pixel.
    ///
    /// If a timeout is provided, the function will return an error if the
    /// response is not received within the timeout. Pass `None` to wait
    /// indefinitely.
    pub fn get_scanner_settings(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<Settings> {
        if let Some(settings) = self.get_scanner_settings_response.take() {
            tracing::warn!("get_scanner_settings: found a cached response: {settings:?}");
        }

        self.validate_and_send_command(Command::new(b"I"), parsers::get_scanner_settings_request)?;

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(settings) = self.get_scanner_settings_response.take() {
                return Ok(settings);
            }
        }
    }

    /// Gets the number of input sensors that must be covered to initiate
    /// scanning when the feeder is enabled.
    ///
    /// If a timeout is provided, the function will return an error if the
    /// response is not received within the timeout. Pass `None` to wait
    /// indefinitely.
    pub fn get_required_input_sensors(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<(u8, u8)> {
        self.validate_and_send_command(
            Command::new(b"\x1bs"),
            parsers::get_input_sensors_required_request,
        )?;

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(Incoming::GetSetRequiredInputSensorsResponse {
                current_sensors_required,
                total_sensors_available,
            }) = self.get_required_input_sensors_response.take()
            {
                return Ok((current_sensors_required, total_sensors_available));
            }
        }
    }

    /// Sets the number of input sensors that must be covered to initiate
    /// scanning when the feeder is enabled.
    pub fn set_required_input_sensors(&mut self, sensors: u8) -> Result<()> {
        let mut body = b"\x1bs".to_vec();
        body.push(sensors + b'0');
        self.validate_and_send_command(
            Command::new(body.as_slice()),
            parsers::set_input_sensors_required_request,
        )
    }

    /// Enables or disables the feeder. When the feeder is disabled, the scanner
    /// will not attempt to scan documents. When the feeder is enabled, the
    /// scanner will attempt to scan documents when the required number of input
    /// sensors are covered.
    pub fn set_feeder_enabled(&mut self, enabled: bool) -> Result<()> {
        if enabled {
            self.validate_and_send_command(Command::new(b"8"), parsers::enable_feeder_request)
        } else {
            self.validate_and_send_command(Command::new(b"9"), parsers::disable_feeder_request)
        }
    }

    /// Gets the serial number of the scanner.
    pub fn get_serial_number(
        &mut self,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<String> {
        if let Some(response) = self.get_serial_number_response.take() {
            tracing::warn!("get_serial_number: found a cached response: {response:?}");
        }

        self.validate_and_send_command(Command::new(b"*"), parsers::get_serial_number_request)?;

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            if let Some(Incoming::GetSetSerialNumberResponse(serial_number)) =
                self.get_serial_number_response.take()
            {
                return Ok(std::str::from_utf8(&serial_number)?.to_owned());
            }
        }
    }

    /// Sets the resolution of the scanner to either half or native. The native
    /// resolution for the Pagescan 5 is 400 DPI, and the half resolution is 200
    /// DPI.
    pub fn set_scan_resolution(&mut self, resolution: Resolution) -> Result<()> {
        match resolution {
            Resolution::Half => self.validate_and_send_command(
                Command::new(b"A"),
                parsers::set_scanner_image_density_to_half_native_resolution_request,
            ),
            Resolution::Medium => self.validate_and_send_command(
                Command::new(b"@"),
                parsers::set_scanner_image_density_to_medium_resolution_request,
            ),
            Resolution::Native => self.validate_and_send_command(
                Command::new(b"B"),
                parsers::set_scanner_image_density_to_native_resolution_request,
            ),
        }
    }

    /// Sets the scanner to either duplex mode, top-only simplex mode, or
    /// bottom-only simplex mode.
    pub fn set_scan_side_mode(&mut self, scan_side_mode: ScanSideMode) -> Result<()> {
        match scan_side_mode {
            ScanSideMode::Duplex => self.validate_and_send_command(
                Command::new(b"J"),
                parsers::set_scanner_to_duplex_mode_request,
            ),
            ScanSideMode::SimplexTopOnly => self.validate_and_send_command(
                Command::new(b"G"),
                parsers::set_scanner_to_top_only_simplex_mode_request,
            ),
            ScanSideMode::SimplexBottomOnly => self.validate_and_send_command(
                Command::new(b"H"),
                parsers::set_scanner_to_bottom_only_simplex_mode_request,
            ),
        }
    }

    pub fn disable_pick_on_command_mode(&mut self) -> Result<()> {
        self.validate_and_send_command(
            Command::new(b"\x1bY"),
            parsers::disable_pick_on_command_mode_request,
        )
    }

    pub fn disable_eject_pause(&mut self) -> Result<()> {
        self.validate_and_send_command(Command::new(b"N"), parsers::disable_eject_pause_request)
    }

    /// Sets the color mode of the scanner to either native or low color. The
    /// native color mode is 24-bit color for color scanners, and 8-bit
    /// grayscale for grayscale scanners. The low color mode is 8-bit color for
    /// color scanners, and 1-bit bitonal for grayscale scanners.
    pub fn set_color_mode(&mut self, color_mode: ColorMode) -> Result<()> {
        match color_mode {
            ColorMode::Native => self.validate_and_send_command(
                Command::new(b"y"),
                parsers::transmit_in_native_bits_per_pixel_request,
            ),
            ColorMode::LowColor => self.validate_and_send_command(
                Command::new(b"z"),
                parsers::transmit_in_low_bits_per_pixel_request,
            ),
        }
    }

    pub fn disable_auto_run_out_at_end_of_scan(&mut self) -> Result<()> {
        self.validate_and_send_command(
            Command::new(b"\x1bd"),
            parsers::disable_auto_run_out_at_end_of_scan_request,
        )
    }

    /// Sets the motor speed to either full or half speed.
    pub fn set_motor_speed(&mut self, speed: Speed) -> Result<()> {
        match speed {
            Speed::Full => self.validate_and_send_command(
                Command::new(b"k"),
                parsers::configure_motor_to_run_at_full_speed_request,
            ),
            Speed::Half => self.validate_and_send_command(
                Command::new(b"j"),
                parsers::configure_motor_to_run_at_half_speed_request,
            ),
        }
    }

    /// Adjusts the bitonal threshold by 1. The threshold is a percentage of the
    /// luminosity that must be detected before the scanner will consider a
    /// pixel to be white. The threshold is adjusted separately for the top and
    /// bottom sensors.
    pub fn adjust_bitonal_threshold_by_1(
        &mut self,
        side: Side,
        adjustment: Direction,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<u8> {
        let command = match (side, adjustment) {
            (Side::Top, Direction::Increase) => Command::new(b"\x1b+"),
            (Side::Top, Direction::Decrease) => Command::new(b"\x1b-"),
            (Side::Bottom, Direction::Increase) => Command::new(b"\x1b>"),
            (Side::Bottom, Direction::Decrease) => Command::new(b"\x1b<"),
        };

        self.validate_and_send_command(command, parsers::adjust_bitonal_threshold_by_1_request)?;

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            match self.adjust_bitonal_threshold_by_1_response.take() {
                Some(Incoming::AdjustBitonalThresholdResponse {
                    side: side_response,
                    percent_white_threshold,
                }) if side_response == side => return Ok(percent_white_threshold),
                Some(response) => {
                    self.adjust_bitonal_threshold_by_1_response = Some(response);
                }
                None => {}
            }
        }
    }

    /// Sets the bitonal threshold for the top or bottom sensor. The threshold
    /// is a percentage of the luminosity that must be detected before the
    /// scanner will consider a pixel to be white. The threshold is adjusted
    /// separately for the top and bottom sensors.
    pub fn set_threshold(
        &mut self,
        side: Side,
        threshold: u8,
        timeout: impl Into<Option<std::time::Duration>>,
    ) -> Result<u8> {
        if let Some(response) = self.adjust_bitonal_threshold_by_1_response.take() {
            tracing::warn!("set_threshold: found a cached response: {response:?}");
        }

        let mut body = b"\x1b%".to_vec();
        body.push(side.into());
        body.push(threshold);
        self.validate_and_send_command(
            Command::new(body.as_slice()),
            parsers::set_bitonal_threshold_request,
        )?;

        let timeout = timeout.into();
        let deadline = timeout.map(|timeout| Instant::now() + timeout);

        loop {
            self.await_event(deadline)?;

            match self.adjust_bitonal_threshold_by_1_response.take() {
                Some(Incoming::AdjustBitonalThresholdResponse {
                    side: side_response,
                    percent_white_threshold,
                }) if side_response == side => return Ok(percent_white_threshold),
                Some(response) => {
                    self.adjust_bitonal_threshold_by_1_response = Some(response);
                }
                None => {}
            }
        }
    }

    /// Sets the maximum length of the document to scan. The length is specified
    /// in inches. The scanner will not attempt to scan a document longer than
    /// the specified length, and will consider the document to be jammed if it
    /// is longer than the specified length.
    pub fn set_length_of_document_to_scan(&mut self, length_inches: f32) -> Result<()> {
        const MIN_LENGTH: f32 = 0.0;
        const MAX_LENGTH: f32 = 22.3;

        if !(MIN_LENGTH..=MAX_LENGTH).contains(&length_inches) {
            return Err(Error::ValidateRequest(format!(
                "length of document to scan must be between {MIN_LENGTH} and {MAX_LENGTH} inches: {length_inches}"
            )));
        }

        for unit_byte in b'0'..=b'9' {
            let unit_inches = (((unit_byte - b'0') * 5 + 10) as f32) / 10.0;
            let length_byte = 0x20 as f32 + (10.0 * length_inches) / unit_inches;

            if length_byte <= u8::MAX as f32 || length_byte >= u8::MIN as f32 {
                let mut body = b"\x1bD".to_vec();
                body.push(length_byte as u8);
                if unit_byte != b'0' {
                    body.push(unit_byte);
                }
                return self.validate_and_send_command(
                    Command::new(body.as_slice()),
                    parsers::set_length_of_document_to_scan_request,
                );
            }
        }

        Err(Error::ValidateRequest(format!(
            "unable to find a valid unit byte value for length of document to scan: {length_inches} inches"
        )))
    }

    pub fn set_scan_delay_interval_for_document_feed(&mut self, duration: Duration) -> Result<()> {
        const MIN_MILLIS: u128 = 0;
        const MAX_MILLIS: u128 = 3200;

        let duration_ms = match duration.as_millis() {
            millis @ MIN_MILLIS..=MAX_MILLIS => millis,
            _ => return Err(Error::ValidateRequest(format!(
                "scan delay interval must be between {MIN_MILLIS} and {MAX_MILLIS} milliseconds: {duration:?}"
            ))),
        };

        let mut body = b"\x1bj".to_vec();
        body.push((duration_ms / 16) as u8 + 0x20);
        self.validate_and_send_command(
            Command::new(body.as_slice()),
            parsers::set_scan_delay_interval_for_document_feed_request,
        )
    }

    /// Ejects the document from the scanner according to the specified motion.
    pub fn eject_document(&mut self, eject_motion: EjectMotion) -> Result<()> {
        match eject_motion {
            EjectMotion::ToRear => self.validate_and_send_command(
                Command::new(b"3"),
                parsers::eject_document_to_rear_of_scanner_request,
            ),
            EjectMotion::ToFront => self.validate_and_send_command(
                Command::new(b"4"),
                parsers::eject_document_to_front_of_scanner_request,
            ),
            EjectMotion::ToFrontAndHold => self.validate_and_send_command(
                Command::new(b"1"),
                parsers::eject_document_to_front_of_scanner_and_hold_in_input_rollers_request,
            ),
        }
    }

    pub fn await_event(&mut self, deadline: impl Into<Option<std::time::Instant>>) -> Result<()> {
        let event = match deadline.into() {
            Some(deadline) => self.event_rx.recv_timeout(
                deadline
                    .checked_duration_since(Instant::now())
                    .unwrap_or_default(),
            )?,
            None => self.event_rx.recv().unwrap(),
        };

        if event.is_out() {
            return Ok(());
        }

        match event {
            Event::Completed { endpoint, data } => {
                if endpoint == ENDPOINT_IN_IMAGE_DATA {
                    // image data
                    tracing::debug!("receiving image data: {} bytes", data.len());
                } else {
                    match parsers::any_incoming(&data) {
                        Ok(([], incoming)) => {
                            self.handle_incoming(incoming)?;
                        }
                        Ok((remaining, _)) => {
                            tracing::warn!("unexpected remaining data: {remaining:?}");
                        }
                        Err(e) => {
                            tracing::warn!("failed to parse incoming data: {e:?}");
                        }
                    }
                }
            }
            Event::Cancelled { endpoint } => {
                tracing::debug!("received cancelled event: {endpoint:02x}");
            }
        }

        Ok(())
    }

    fn handle_incoming(&mut self, incoming: Incoming) -> Result<()> {
        tracing::debug!("incoming message: {incoming:?}");
        match incoming {
            Incoming::BeginScanEvent => {
                self.begin_scan_tx.send(()).unwrap();
            }
            Incoming::EndScanEvent => {
                self.end_scan_tx.send(()).unwrap();
            }
            Incoming::GetTestStringResponse(test_string) => {
                self.get_test_string_response = Some(test_string.to_owned());
            }
            Incoming::GetFirmwareVersionResponse(version) => {
                self.get_firmware_version_response = Some(version);
            }
            Incoming::GetScannerStatusResponse(status) => {
                self.get_scanner_status_response = Some(status);
            }
            Incoming::GetScannerSettingsResponse(settings) => {
                self.get_scanner_settings_response = Some(settings);
            }
            response @ Incoming::GetSetSerialNumberResponse(..) => {
                self.get_serial_number_response = Some(response);
            }
            response @ Incoming::GetSetRequiredInputSensorsResponse { .. } => {
                self.get_required_input_sensors_response = Some(response);
            }
            response @ Incoming::AdjustBitonalThresholdResponse { .. } => {
                self.adjust_bitonal_threshold_by_1_response = Some(response);
            }
            _ => {
                tracing::warn!("unhandled incoming: {incoming:?}");
            }
        }

        Ok(())
    }
}

impl Drop for PdiClient {
    fn drop(&mut self) {
        tracing::trace!("PdiClient::drop: calling stop_handle_events_thread");
        self.transfer_handler.stop_handle_events_thread();
    }
}
