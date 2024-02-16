use std::{
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use rusb::UsbContext;

use crate::{
    pdiscan::protocol::{
        parsers,
        types::{Direction, Side},
    },
    rusb_async,
};

use super::{
    client::{Error, Result, UsbError},
    protocol::{
        packets::{self, Command, Incoming, Outgoing},
        types::{
            BitonalAdjustment, ClampedPercentage, ColorMode, DoubleFeedDetectionCalibrationType,
            EjectMotion, Resolution, ScanSideMode, Settings, Speed, Status, Version,
        },
    },
};

pub struct Client {
    host_to_scanner_tx: mpsc::Sender<Outgoing>,
    scanner_to_host_rx: mpsc::Receiver<Incoming>,
}

impl Client {
    pub fn new(
        host_to_scanner_tx: mpsc::Sender<Outgoing>,
        scanner_to_host_rx: mpsc::Receiver<Incoming>,
    ) -> Self {
        Self {
            scanner_to_host_rx,
            host_to_scanner_tx,
        }
    }

    fn send(&self, packet: Outgoing) -> Result<()> {
        self.host_to_scanner_tx
            .send(packet)
            .map_err(|_| Error::Usb(UsbError::Rusb(rusb::Error::Io)))
    }

    pub fn get_test_string(&self, timeout: Duration) -> Result<String> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetTestStringRequest).unwrap();

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetTestStringResponse(s) => return Ok(s),
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    pub fn get_firmware_version(&self, timeout: Duration) -> Result<Version> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetFirmwareVersionRequest).unwrap();

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetFirmwareVersionResponse(version) => return Ok(version),
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    pub fn get_scanner_status(&self, timeout: Duration) -> Result<Status> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetScannerStatusRequest).unwrap();

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetScannerStatusResponse(status) => return Ok(status),
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    pub fn get_required_input_sensors(&self, timeout: Duration) -> Result<(u8, u8)> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetRequiredInputSensorsRequest).unwrap();

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetSetRequiredInputSensorsResponse {
                    current_sensors_required,
                    total_sensors_available,
                } => return Ok((current_sensors_required, total_sensors_available)),
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    pub fn set_double_feed_detection_enabled(&self, enabled: bool) {
        self.send(if enabled {
            Outgoing::EnableDoubleFeedDetectionRequest
        } else {
            Outgoing::DisableDoubleFeedDetectionRequest
        })
        .unwrap();
    }

    pub fn set_feeder_enabled(&self, enabled: bool) {
        self.send(if enabled {
            Outgoing::EnableFeederRequest
        } else {
            Outgoing::DisableFeederRequest
        })
        .unwrap();
    }

    pub fn get_serial_number(&self, timeout: Duration) -> Result<[u8; 8]> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetSerialNumberRequest).unwrap();

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetSetSerialNumberResponse(serial_number) => return Ok(serial_number),
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    pub fn get_scanner_settings(&self, timeout: Duration) -> Result<Settings> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetScannerSettingsRequest).unwrap();

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetScannerSettingsResponse(settings) => return Ok(settings),
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    /// Ejects the document from the scanner according to the specified motion.
    pub fn eject_document(&self, eject_motion: EjectMotion) {
        match eject_motion {
            EjectMotion::ToRear => self
                .send(Outgoing::EjectDocumentToRearOfScannerRequest)
                .unwrap(),
            EjectMotion::ToFront => self
                .send(Outgoing::EjectDocumentToFrontOfScannerRequest)
                .unwrap(),
            EjectMotion::ToFrontAndHold => self
                .send(Outgoing::EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest)
                .unwrap(),
        }
    }

    /// Adjusts the bitonal threshold by 1. The threshold is a percentage of the
    /// luminosity that must be detected before the scanner will consider a
    /// pixel to be white. The threshold is adjusted separately for the top and
    /// bottom sensors.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn adjust_bitonal_threshold_by_1(
        &self,
        side: Side,
        direction: Direction,
        timeout: Duration,
    ) -> Result<u8> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::AdjustBitonalThresholdBy1Request(
            BitonalAdjustment { side, direction },
        ))
        .unwrap();

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::AdjustBitonalThresholdResponse {
                    side: response_side,
                    percent_white_threshold,
                } if response_side == side => {
                    return Ok(percent_white_threshold);
                }
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    /// Sets the color mode of the scanner to either native or low color. The
    /// native color mode is 24-bit color for color scanners, and 8-bit
    /// grayscale for grayscale scanners. The low color mode is 8-bit color for
    /// color scanners, and 1-bit bitonal for grayscale scanners.
    pub fn set_color_mode(&mut self, color_mode: ColorMode) {
        match color_mode {
            ColorMode::Native => self
                .send(Outgoing::TransmitInNativeBitsPerPixelRequest)
                .unwrap(),
            ColorMode::LowColor => self
                .send(Outgoing::TransmitInLowBitsPerPixelRequest)
                .unwrap(),
        }
    }

    pub fn disable_auto_run_out_at_end_of_scan(&mut self) {
        self.send(Outgoing::DisableAutoRunOutAtEndOfScanRequest)
            .unwrap();
    }

    /// Sets the motor speed to either full or half speed.
    pub fn set_motor_speed(&mut self, speed: Speed) {
        match speed {
            Speed::Full => self
                .send(Outgoing::ConfigureMotorToRunAtFullSpeedRequest)
                .unwrap(),
            Speed::Half => self
                .send(Outgoing::ConfigureMotorToRunAtHalfSpeedRequest)
                .unwrap(),
        }
    }

    /// Sets the bitonal threshold for the top or bottom sensor. The threshold
    /// is a percentage of the luminosity that must be detected before the
    /// scanner will consider a pixel to be white. The threshold is adjusted
    /// separately for the top and bottom sensors.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn set_threshold(
        &mut self,
        side: Side,
        threshold: ClampedPercentage,
        timeout: Duration,
    ) -> Result<u8> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::SetThresholdToANewValueRequest {
            side,
            new_threshold: threshold,
        })
        .unwrap();

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::AdjustBitonalThresholdResponse {
                    side: response_side,
                    percent_white_threshold,
                } if response_side == side => return Ok(percent_white_threshold),
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    /// Sets the number of input sensors that must be covered to initiate
    /// scanning when the feeder is enabled.
    ///
    /// # Errors
    ///
    /// This function will return an error if the sensors is not a valid value.
    pub fn set_required_input_sensors(&mut self, sensors: u8) -> Result<()> {
        self.send(Outgoing::SetRequiredInputSensorsRequest { sensors })
    }

    /// Sets the maximum length of the document to scan. The length is specified
    /// in inches. The scanner will not attempt to scan a document longer than
    /// the specified length, and will consider the document to be jammed if it
    /// is longer than the specified length.
    ///
    /// # Errors
    ///
    /// This function will return an error if the length is not a valid value.
    pub fn set_length_of_document_to_scan(&mut self, length_inches: f32) -> Result<()> {
        const MIN_LENGTH: f32 = 0.0;
        const MAX_LENGTH: f32 = 22.3;

        if !(MIN_LENGTH..=MAX_LENGTH).contains(&length_inches) {
            return Err(Error::ValidateRequest(format!(
                "length of document to scan must be between {MIN_LENGTH} and {MAX_LENGTH} inches: {length_inches}"
            )));
        }

        for unit_byte in b'0'..=b'9' {
            let unit_inches = (f32::from((unit_byte - b'0') * 5 + 10)) / 10.0;
            let length_byte = 32.0 + (10.0 * length_inches) / unit_inches;

            if length_byte <= f32::from(u8::MAX) || length_byte >= f32::from(u8::MIN) {
                return self.send(Outgoing::SetLengthOfDocumentToScanRequest {
                    length_byte: length_byte as u8,
                    unit_byte: if unit_byte == b'0' {
                        None
                    } else {
                        Some(unit_byte)
                    },
                });
            }
        }

        Err(Error::ValidateRequest(format!(
            "unable to find a valid unit byte value for length of document to scan: {length_inches} inches"
        )))
    }

    /// Sets the delay interval for the document feed. The delay interval is the
    /// amount of time the scanner will wait after detecting the required input
    /// sensors before attempting to scan the document.
    ///
    /// # Errors
    ///
    /// This function will return an error if the duration is not a valid value.
    pub fn set_scan_delay_interval_for_document_feed(
        &mut self,
        delay_interval: Duration,
    ) -> Result<()> {
        const MIN_MILLIS: u128 = 0;
        const MAX_MILLIS: u128 = 3200;

        let MIN_MILLIS..=MAX_MILLIS = delay_interval.as_millis() else {
            return Err(Error::ValidateRequest(format!(
                "scan delay interval must be between {MIN_MILLIS} and {MAX_MILLIS} milliseconds: {delay_interval:?}"
            )));
        };

        self.send(Outgoing::SetScanDelayIntervalForDocumentFeedRequest { delay_interval })
    }

    /// Validate that a command can be properly validated by the associated
    /// parser and then send it to the scanner. This differs from [`Client::validate_and_send_command`]
    /// in that it assumes the command will always validate and does not return a [Result].
    fn validate_and_send_command_unchecked<O>(
        &mut self,
        command_body: &[u8],
        parser: impl Fn(&[u8]) -> nom::IResult<&[u8], O>,
    ) {
        self.validate_and_send_command(&Command::new(command_body), parser)
            .expect("unchecked command should always validate");
    }

    /// Validate that a command can be properly validated by the associated
    /// parser and then send it to the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the command fails to validate.
    fn validate_and_send_command<O>(
        &mut self,
        command: &Command,
        parser: impl Fn(&[u8]) -> nom::IResult<&[u8], O>,
    ) -> Result<()> {
        let Ok(([], _)) = parser(&command.to_bytes()) else {
            return Err(Error::ValidateRequest(format!(
                "command failed to validate: {command:?}"
            )));
        };
        self.send_command(command)?;
        Ok(())
    }

    fn handle_unexpected_packet(&self, packet: Incoming) {
        eprintln!("Unexpected packet: {packet:?}");
    }

    pub fn send_command(&self, command: &Command) -> Result<()> {
        self.send_raw_packet(&command.to_bytes())
    }

    pub fn send_raw_packet(&self, packet: &[u8]) -> Result<()> {
        self.send(Outgoing::RawPacket(packet.to_vec()))
    }

    fn poll_for_matching_response(
        &self,
        timeout: Duration,
        predicate: impl Fn(&[u8]) -> nom::IResult<&[u8], ()>,
    ) -> Result<()> {
        let deadline = Instant::now() + timeout;

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::Unknown(data) => {
                    if let Ok(([], ())) = predicate(&data) {
                        return Ok(());
                    }
                }
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    /// Sets the resolution of the scanner to either half or native. The native
    /// resolution for the Pagescan 5 is 400 DPI, and the half resolution is 200
    /// DPI.
    pub fn set_scan_resolution(&mut self, resolution: Resolution) {
        match resolution {
            Resolution::Half => self
                .send(Outgoing::SetScannerImageDensityToHalfNativeResolutionRequest)
                .unwrap(),
            Resolution::Medium => todo!("not implemented for PageScan 6"),
            Resolution::Native => self
                .send(Outgoing::SetScannerImageDensityToNativeResolutionRequest)
                .unwrap(),
        }
    }

    /// Sets the scanner to either duplex mode, top-only simplex mode, or
    /// bottom-only simplex mode.
    pub fn set_scan_side_mode(&mut self, scan_side_mode: ScanSideMode) {
        match scan_side_mode {
            ScanSideMode::Duplex => self.send(Outgoing::SetScannerToDuplexModeRequest).unwrap(),
            ScanSideMode::SimplexTopOnly => self
                .send(Outgoing::SetScannerToTopOnlySimplexModeRequest)
                .unwrap(),
            ScanSideMode::SimplexBottomOnly => self
                .send(Outgoing::SetScannerToBottomOnlySimplexModeRequest)
                .unwrap(),
        }
    }

    pub fn disable_pick_on_command_mode(&mut self) {
        self.send(Outgoing::DisablePickOnCommandModeRequest)
            .unwrap();
    }

    pub fn disable_eject_pause(&mut self) {
        self.send(Outgoing::DisableEjectPauseRequest).unwrap();
    }

    /// Sets the sensitivity of the double feed detection. The percentage
    /// parameter is a value from 0 to 100, where 0 is the least sensitive and
    /// 100 is the most sensitive.
    ///
    /// # Errors
    ///
    /// This function will return an error if the percentage is not between 0
    /// and 100.
    pub fn set_double_feed_sensitivity(&mut self, percentage: ClampedPercentage) -> Result<()> {
        self.send(Outgoing::SetDoubleFeedDetectionSensitivityRequest { percentage })
    }

    /// Sets the minimum length to scan before double feed detection is
    /// triggered. The length is in hundredths of an inch.
    ///
    /// # Example
    ///
    /// ```no_run
    /// use pdi_rs::pdiscan::client::Client;
    ///
    /// let mut client = Client::open().unwrap();
    /// // set the minimum document length to 0.5"
    /// client.set_double_feed_detection_minimum_document_length(50).unwrap();
    /// ```
    ///
    /// # Errors
    ///
    /// This function will return an error if the length is not a valid value.
    pub fn set_double_feed_detection_minimum_document_length(
        &mut self,
        length_in_hundredths_of_an_inch: u8,
    ) -> Result<()> {
        self.send(
            Outgoing::SetDoubleFeedDetectionMinimumDocumentLengthRequest {
                length_in_hundredths_of_an_inch,
            },
        )
    }

    /// Calibrates the double feed detection. The calibration type parameter
    /// specifies the type of calibration to perform.
    ///
    /// The scanner will send an
    /// [`Incoming::DoubleFeedCalibrationCompleteEvent`] event when the
    /// calibration is complete. If the calibration times out, the scanner will
    /// send an [`Incoming::DoubleFeedCalibrationTimedOutEvent`] event. Note
    /// that the timeout is not configurable.
    pub fn calibrate_double_feed_detection(
        &mut self,
        calibration_type: DoubleFeedDetectionCalibrationType,
    ) -> Result<()> {
        self.send(Outgoing::CalibrateDoubleFeedDetectionRequest(
            calibration_type,
        ))
    }

    /// Gets the intensity of the double feed detection LED.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn get_double_feed_detection_led_intensity(&mut self, timeout: Duration) -> Result<u16> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetDoubleFeedDetectionLedIntensityRequest)?;

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetDoubleFeedDetectionLedIntensityResponse(intensity) => {
                    return Ok(intensity);
                }
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    /// Gets the double sheet detection calibration value for a single sheet of paper. This value
    /// should be lower than the value for two sheets of paper.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within the timeout.
    pub fn get_double_feed_detection_single_sheet_calibration_value(
        &mut self,
        timeout: Duration,
    ) -> Result<u16> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetDoubleFeedDetectionSingleSheetCalibrationValueRequest)?;

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetDoubleFeedDetectionSingleSheetCalibrationValueResponse(value) => {
                    return Ok(value);
                }
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    /// Gets the double sheet detection calibration value for two sheets of paper. This value
    /// should be higher than the value for a single sheet of paper.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within the timeout.
    pub fn get_double_feed_detection_double_sheet_calibration_value(
        &mut self,
        timeout: Duration,
    ) -> Result<u16> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetDoubleFeedDetectionDoubleSheetCalibrationValueRequest)?;

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetDoubleFeedDetectionDoubleSheetCalibrationValueResponse(value) => {
                    return Ok(value);
                }
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    /// Gets the double sheet detection threshold value. Values above this threshold are considered
    /// to be double feeds.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within the timeout.
    pub fn get_double_feed_detection_double_sheet_threshold_value(
        &mut self,
        timeout: Duration,
    ) -> Result<u16> {
        let deadline = Instant::now() + timeout;

        self.send(Outgoing::GetDoubleFeedDetectionDoubleSheetThresholdValueRequest)?;

        loop {
            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                Incoming::GetDoubleFeedDetectionDoubleSheetThresholdValueResponse(value) => {
                    return Ok(value);
                }
                packet => self.handle_unexpected_packet(packet),
            }
        }
    }

    /// Enables or disables the array light source.
    pub fn set_array_light_source_enabled(&mut self, enabled: bool) -> Result<()> {
        self.send(if enabled {
            Outgoing::TurnArrayLightSourceOnRequest
        } else {
            Outgoing::TurnArrayLightSourceOffRequest
        })
    }

    /// Connects to the scanner using the same commands that were captured by
    /// wireshark from the `scan_demo` program. Some of them may not be
    /// necessary, but they're included for now.
    ///
    /// # Errors
    ///
    /// This function will return an error if any of the commands fail to
    /// validate or if the response is not received within the timeout.
    pub fn send_connect(&mut self) -> Result<()> {
        use nom::bytes::complete::{tag, take_while};

        let timeout = Duration::from_secs(5);
        let deadline = Instant::now() + timeout;

        fn match_unknown_packet_starting_with<'a>(
            prefix: &'a [u8],
        ) -> impl Fn(&'a [u8]) -> nom::IResult<&'a [u8], ()> {
            move |input| {
                let (input, _) = tag(prefix)(input)?;
                let (input, _) = take_while(|_| true)(input)?;
                Ok((input, ()))
            }
        }

        // OUT DisableFeederRequest
        self.set_feeder_enabled(false);
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 4f 03 c7> } (string: "\u{2}O\u{3}�") (length: 4)
        self.send_command(&Command::new(b"O"))?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 1b 55 03 a0> } (string: "\u{2}\u{1b}U\u{3}�") (length: 5)
        self.send_command(&Command::new(b"\x1bU"))?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 1b 4b 03 1b> } (string: "\u{2}\u{1b}K\u{3}\u{1b}") (length: 5)
        self.send_command(&Command::new(b"\x1bK"))?;
        // OUT GetFirmwareVersionRequest
        // IN GetFirmwareVersionResponse(Version { product_id: "9072", major: "20", minor: "28", cpld_version: "X" })
        self.get_firmware_version(timeout)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 30 38 03 29> } (string: "\u{2}<008\u{3})") (length: 7)
        self.send_command(&Command::new(b"<008"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 30 38 30 30 30 30 38 30 32 32 03> } (string: "\u{2}<00800008022\u{3}") (length: 14)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02<")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 33 38 03 cb> } (string: "\u{2}<038\u{3}�") (length: 7)
        self.send_command(&Command::new(b"<038"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 33 38 30 30 30 36 38 44 38 30 03> } (string: "\u{2}<03800068D80\u{3}") (length: 14)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02<")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 31 34 03 42> } (string: "\u{2}<014\u{3}B") (length: 7)
        self.send_command(&Command::new(b"<014"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 31 34 30 30 30 30 30 30 30 30 03> } (string: "\u{2}<01400000000\u{3}") (length: 14)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02<")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 30 37 03 bf> } (string: "\u{2}<007\u{3}�") (length: 7)
        self.send_command(&Command::new(b"<007"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 30 37 33 33 33 33 33 33 33 33 03> } (string: "\u{2}<00733333333\u{3}") (length: 14)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02<")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 30 39 03 be> } (string: "\u{2}<009\u{3}�") (length: 7)
        self.send_command(&Command::new(b"<009"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 30 39 30 30 30 30 30 30 30 38 03> } (string: "\u{2}<00900000008\u{3}") (length: 14)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02<")(input),
        )?;
        // OUT GetSerialNumberRequest
        // IN GetSetSerialNumberResponse([48, 48, 48, 48, 48, 48, 48, 48])
        self.get_serial_number(timeout)?;
        // OUT GetScannerSettingsRequest
        // IN GetScannerSettingsResponse(Settings { dpi_setting: 406, bits_per_pixel: 1, total_array_pixels: 6912, num_of_arrays: 3, calibration_status: CalibrationOk, number_of_calibration_tables: Some(2) })
        self.get_scanner_settings(timeout)?;
        // OUT GetCalibrationInformationRequest { resolution: Some(Native) }
        self.validate_and_send_command_unchecked(
            b"W0",
            parsers::get_calibration_information_request,
        );
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 80 0d 08 bf bf b8 bb ba bf b9 b5 b4 b7 bb b7 b5 b4 b8 bb b5 b8 b6 b9 bb b7 b7 b6 ba bb b7 b6 b5 bc ba b7 b8 b6 bb bb b6 b9 b8 bf ba b9 b8 b8 bf bb b9 ba bb bf bc b9 ba bb bf bd bd ba be c2 bb bd ba bf c0 bd be bc c2 c0 bb bd bc c1 c2 bc bd be c4 c1 bd bc be c2 c1 bd bf bf c4 c1 bf c0 c0 c4 bf …> } (string: "\u{2}W�\r\u{8}�����������������������������������������������������������»�������������¼�����������������Ŀ") (length: 6922)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02W")(input),
        )?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 80 0d 18 a3 a3 a3 a3 a3 a5 a4 ab af aa ac ad b4 b6 b2 b4 b4 b9 b7 b3 b5 b5 b8 b9 b5 b6 b7 bd b9 b8 b7 bb bf bd b9 ba bb c0 bb bc bb bf c0 bc bb ba be c1 bb bb ba bf c0 ba bb bd c1 c1 bb be bf c3 c0 bc c0 bf c3 c2 be bf be c3 be be bb c0 c3 c0 bf be c1 c4 bd bd bd c2 c2 be bf bd c0 c1 bd bf bd …> } (string: "\u{2}W�\r\u{18}�������������������������������������������������������������������¾��þ��������Ľ���¾�������") (length: 6922)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02W")(input),
        )?;
        // OUT GetCalibrationInformationRequest { resolution: Some(Half) }
        self.validate_and_send_command_unchecked(
            b"W1",
            parsers::get_calibration_information_request,
        );
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 c0 06 08 b0 b0 b0 af b4 af b4 b1 b2 b6 b3 b7 b2 b6 b5 b5 b8 b5 b9 b6 b4 bb b7 ba b7 b8 bc b9 bf ba ba bc ba bf b9 bd bc bc c1 bc bf be be c0 be c0 bc be be bc c2 bd be c0 bf c1 be c0 c0 c0 c3 c0 c3 bf c2 c2 c1 c4 c0 c4 c5 c2 c8 c2 c4 c4 c3 c6 c2 c6 c3 c3 c8 c3 c6 c6 c3 c8 c4 c8 c3 c5 c6 c3 c9 …> } (string: "\u{2}W�\u{6}\u{8}��������������������������������������������������½����������ÿ�������������������������������") (length: 3466)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02W")(input),
        )?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 c0 06 18 a9 a9 a9 a9 a9 af ae b2 b1 af b5 b0 b6 b3 b4 b9 b6 b8 b7 b8 b9 b4 bb b6 b7 b8 b7 bc b8 ba b8 ba be b8 bb b9 b8 bb bb be ba bb bd bb bf bb be be bc c0 bc bd bd bb bf bb be bb bd bd bc bf be bf c1 bf c2 c0 c1 bf be c2 be c0 c1 bf c2 bd c2 c1 c0 c2 be c4 bf be c1 be c3 bf c1 c0 c1 c2 bf …> } (string: "\u{2}W�\u{6}\u{18}�����������������������������������������������������������������������¾���½���¾Ŀ���ÿ���¿") (length: 3466)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02W")(input),
        )?;
        // OUT GetScannerStatusRequest
        // IN GetScannerStatusResponse(Status { rear_left_sensor_covered: false, rear_right_sensor_covered: false, brander_position_sensor_covered: false, hi_speed_mode: true, download_needed: false, scanner_enabled: false, front_left_sensor_covered: false, front_m1_sensor_covered: false, front_m2_sensor_covered: false, front_m3_sensor_covered: false, front_m4_sensor_covered: false, front_m5_sensor_covered: false, front_right_sensor_covered: false, scanner_ready: true, xmt_aborted: false, document_jam: false, scan_array_pixel_error: false, in_diagnostic_mode: false, document_in_scanner: false, calibration_of_unit_needed: false })
        self.get_scanner_status(timeout)?;
        // OUT GetRequiredInputSensorsRequest
        // IN GetSetRequiredInputSensorsResponse { current_sensors_required: 2, total_sensors_available: 5 }
        self.get_required_input_sensors(timeout)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 33 61 31 30 30 03 7a> } (string: "\u{2}n3a100\u{3}z") (length: 9)
        self.send_command(&Command::new(b"n3a100"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 6e 33 61 31 30 30 3d 35 30 03> } (string: "\u{2}n3a100=50\u{3}") (length: 11)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02n")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 33 61 31 30 31 03 ed> } (string: "\u{2}n3a101\u{3}�") (length: 9)
        self.send_command(&Command::new(b"n3a101"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 6e 33 61 31 30 31 3d 34 30 03> } (string: "\u{2}n3a101=40\u{3}") (length: 11)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02n")(input),
        )?;
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
        self.send_command(&Command::new(b"#4"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 32 30 32 38 03> } (string: "\u{2}X2028\u{3}") (length: 7)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02X")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 35 03 f7> } (string: "\u{2}#5\u{3}�") (length: 5)
        self.send_command(&Command::new(b"#5"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 36 35 38 35 36 31 35 37 03> } (string: "\u{2}X65856157\u{3}") (length: 11)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02X")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 33 03 ab> } (string: "\u{2}#3\u{3}�") (length: 5)
        self.send_command(&Command::new(b"#3"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 31 30 30 35 03> } (string: "\u{2}X1005\u{3}") (length: 7)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02X")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 30 03 85> } (string: "\u{2}#0\u{3}�") (length: 5)
        self.send_command(&Command::new(b"#0"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 35 38 03> } (string: "\u{2}X58\u{3}") (length: 5)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02X")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 31 03 12> } (string: "\u{2}#1\u{3}\u{12}") (length: 5)
        self.send_command(&Command::new(b"#1"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 43 03> } (string: "\u{2}XC\u{3}") (length: 4)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02X")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 32 03 3c> } (string: "\u{2}#2\u{3}<") (length: 5)
        self.send_command(&Command::new(b"#2"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 34 34 39 39 35 03> } (string: "\u{2}X44995\u{3}") (length: 8)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02X")(input),
        )?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 36 03 d9> } (string: "\u{2}#6\u{3}�") (length: 5)
        self.send_command(&Command::new(b"#6"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 34 03> } (string: "\u{2}X4\u{3}") (length: 4)
        self.poll_for_matching_response(
            deadline.saturating_duration_since(Instant::now()),
            |input| match_unknown_packet_starting_with(b"\x02X")(input),
        )?;

        Ok(())
    }

    /// Sends the same commands to enable scanning that were captured by
    /// wireshark from the `scan_demo` program. Some of them may not be
    /// necessary, but they're included for now.
    ///
    /// # Errors
    ///
    /// This function will return an error if any of the commands fail to
    /// validate or if the response is not received within the timeout.
    pub fn send_enable_scan_commands(&mut self) -> Result<()> {
        let timeout = Duration::from_secs(5);

        // OUT SetScannerImageDensityToHalfNativeResolutionRequest
        self.set_scan_resolution(Resolution::Half);
        // OUT SetScannerToDuplexModeRequest
        self.set_scan_side_mode(ScanSideMode::Duplex);
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 67 03 79> } (string: "\u{2}g\u{3}y") (length: 4)
        self.send_command(&Command::new(b"g"));
        // OUT DisablePickOnCommandModeRequest
        self.disable_pick_on_command_mode();
        // OUT DisableDoubleFeedDetectionRequest
        // self.set_double_feed_detection_enabled(false);
        // OUT SetDoubleFeedDetectionSensitivityRequest { percentage: 50 }
        self.set_double_feed_sensitivity(ClampedPercentage::new_unchecked(50))?;
        // OUT SetDoubleFeedDetectionMinimumDocumentLengthRequest { length_in_hundredths_of_an_inch: 40 }
        self.set_double_feed_detection_minimum_document_length(40)?;
        // OUT EnableDoubleFeedDetectionRequest
        // self.set_double_feed_detection_enabled(true);
        // OUT DisableEjectPauseRequest
        self.disable_eject_pause();
        // OUT TransmitInLowBitsPerPixelRequest
        self.set_color_mode(ColorMode::LowColor);
        // OUT DisableAutoRunOutAtEndOfScanRequest
        self.disable_auto_run_out_at_end_of_scan();
        // OUT ConfigureMotorToRunAtFullSpeedRequest
        self.set_motor_speed(Speed::Full);
        // OUT SetThresholdToANewValueRequest { side: Top, new_threshold: 75 }
        // IN AdjustTopCISSensorThresholdResponse { percent_white_threshold: 75 }
        self.set_threshold(Side::Top, ClampedPercentage::new_unchecked(75), timeout)?;
        // OUT SetThresholdToANewValueRequest { side: Bottom, new_threshold: 75 }
        // IN AdjustBottomCISSensorThresholdResponse { percent_white_threshold: 75 }
        self.set_threshold(Side::Bottom, ClampedPercentage::new_unchecked(75), timeout)?;
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
        self.set_feeder_enabled(true);

        Ok(())
    }
}

pub struct Scanner {
    device_handle: Arc<rusb::DeviceHandle<rusb::Context>>,
    default_timeout: Duration,
    stop_tx: Option<mpsc::Sender<()>>,
    thread_handle: Option<thread::JoinHandle<()>>,
}

impl Scanner {
    pub fn open() -> Result<Self> {
        /// Vendor ID for the PDI scanner.
        const VENDOR_ID: u16 = 0x0bd7;

        /// Product ID for the PDI scanner.
        const PRODUCT_ID: u16 = 0xa002;

        let ctx = rusb::Context::new()?;
        let Some(device) = ctx.devices()?.iter().find(|device| {
            device.device_descriptor().map_or(false, |device_desc| {
                device_desc.vendor_id() == VENDOR_ID && device_desc.product_id() == PRODUCT_ID
            })
        }) else {
            return Err(rusb::Error::NotFound.into());
        };

        let mut device_handle = device.open()?;
        device_handle.set_active_configuration(1)?;
        device_handle.claim_interface(0)?;

        let device_handle = Arc::new(device_handle);

        Ok(Self {
            device_handle,
            default_timeout: Duration::from_secs(1),
            stop_tx: None,
            thread_handle: None,
        })
    }

    pub fn set_default_timeout(&mut self, timeout: Duration) {
        self.default_timeout = timeout;
    }

    pub fn start(&mut self) -> (Sender<packets::Outgoing>, Receiver<packets::Incoming>) {
        /// The endpoint for sending commands to the scanner.
        const ENDPOINT_OUT: u8 = 0x05;

        /// The primary endpoint for receiving responses from the scanner.
        const ENDPOINT_IN_PRIMARY: u8 = 0x85;

        /// The alternate endpoint for receiving responses from the scanner, used to
        /// receive image data.
        const ENDPOINT_IN_IMAGE_DATA: u8 = 0x86;

        const BUFFER_SIZE: usize = 16_384;

        let (host_to_scanner_tx, host_to_scanner_rx) = mpsc::channel::<packets::Outgoing>();
        let (scanner_to_host_tx, scanner_to_host_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();

        self.stop_tx = Some(stop_tx);

        let mut transfer_pool = rusb_async::TransferPool::new(self.device_handle.clone()).unwrap();
        let default_timeout = self.default_timeout;

        self.thread_handle = Some(thread::spawn({
            move || {
                transfer_pool
                    .submit_bulk(ENDPOINT_IN_PRIMARY, vec![0; BUFFER_SIZE])
                    .unwrap();

                transfer_pool
                    .submit_bulk(ENDPOINT_IN_IMAGE_DATA, vec![0; BUFFER_SIZE])
                    .unwrap();

                loop {
                    if stop_rx.try_recv().is_ok() {
                        transfer_pool.cancel_all();
                        break;
                    }

                    match host_to_scanner_rx.try_recv() {
                        Ok(packet) => {
                            let bytes = packet.to_bytes();
                            eprintln!(
                                "sending packet: {packet:?} (data: {data:?})",
                                data = String::from_utf8_lossy(&bytes),
                                packet = packet
                            );

                            transfer_pool.submit_bulk(ENDPOINT_OUT, bytes).unwrap();

                            // wait for submit_bulk to complete
                            transfer_pool
                                .poll_endpoint(ENDPOINT_OUT, default_timeout)
                                .unwrap();
                        }
                        Err(mpsc::TryRecvError::Empty) => {}
                        Err(e) => {
                            eprintln!("Error receiving outgoing packet: {e}");
                            break;
                        }
                    }

                    match transfer_pool.poll_endpoint(ENDPOINT_IN_PRIMARY, Duration::from_millis(1))
                    {
                        Ok(data) => {
                            eprintln!(
                                "Received primary data: {len} bytes: {data:?}",
                                len = data.len(),
                                data = String::from_utf8_lossy(&data)
                            );
                            match parsers::any_incoming(&data) {
                                Ok(([], packet)) => {
                                    eprintln!("Received packet: {packet:?}");
                                    scanner_to_host_tx.send(packet).unwrap();
                                }
                                Ok((remaining, packet)) => {
                                    eprintln!(
                                        "Received packet: {packet:?} with {} bytes remaining: {}",
                                        remaining.len(),
                                        String::from_utf8_lossy(remaining)
                                    );
                                    scanner_to_host_tx
                                        .send(Incoming::Unknown(data.to_vec()))
                                        .unwrap();
                                }
                                Err(err) => {
                                    eprintln!("Error parsing packet: {err}");
                                    scanner_to_host_tx
                                        .send(Incoming::Unknown(data.to_vec()))
                                        .unwrap();
                                }
                            }

                            // resubmit the transfer to receive more data
                            transfer_pool
                                .submit_bulk(ENDPOINT_IN_PRIMARY, data)
                                .unwrap();
                        }
                        Err(rusb_async::Error::PollTimeout) => {}
                        Err(err) => {
                            eprintln!("Error: {err}");
                            break;
                        }
                    }

                    match transfer_pool
                        .poll_endpoint(ENDPOINT_IN_IMAGE_DATA, Duration::from_millis(1))
                    {
                        Ok(data) => {
                            eprintln!("Received image data: {len} bytes", len = data.len());
                            scanner_to_host_tx
                                .send(packets::Incoming::ImageData(data.clone()))
                                .unwrap();

                            // resubmit the transfer to receive more data
                            transfer_pool
                                .submit_bulk(ENDPOINT_IN_IMAGE_DATA, data)
                                .unwrap();
                        }
                        Err(rusb_async::Error::PollTimeout) => {}
                        Err(err) => {
                            eprintln!("Error: {err}");
                            break;
                        }
                    }
                }
            }
        }));

        (host_to_scanner_tx, scanner_to_host_rx)
    }

    /// Stop the scanner. Blocks until cleanup is complete.
    pub fn stop(&mut self) {
        if let Some(stop_tx) = self.stop_tx.take() {
            stop_tx.send(()).unwrap();
        }

        if let Some(thread_handle) = self.thread_handle.take() {
            thread_handle.join().unwrap();
        }
    }
}
