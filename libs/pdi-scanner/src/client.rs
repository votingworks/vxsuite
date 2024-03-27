use std::{
    collections::VecDeque,
    sync::mpsc,
    time::{Duration, Instant},
};

use crate::{
    protocol::{
        parsers,
        types::{
            AutoRunOutAtEndOfScanBehavior, Direction, DoubleFeedDetectionMode, EjectPauseMode,
            FeederMode, PickOnCommandMode, Side,
        },
    },
    types::UsbError,
    Error, Result,
};

use super::protocol::{
    packets::{Command, Incoming, Outgoing},
    types::{
        BitonalAdjustment, ClampedPercentage, ColorMode, DoubleFeedDetectionCalibrationType,
        EjectMotion, Resolution, ScanSideMode, Settings, Speed, Status, Version,
    },
};

macro_rules! recv {
    ($client:expr, $pattern:pat $(if $guard:expr)? => $consequent:expr, $deadline:expr $(,)?) => {{
        #[allow(unused_variables)]
        if let Ok($pattern) = $client.recv_matching_timeout(
            #[allow(unused_variables)]
            |incoming| matches!(incoming, $pattern $(if $guard)?),
            $deadline.saturating_duration_since(Instant::now()),
        ) {
            Ok($consequent)
        } else {
            Err(Error::RecvTimeout(mpsc::RecvTimeoutError::Timeout))
        }
    }};
}

macro_rules! send_and_recv {
    ($client:expr => $outgoing:expr, $pattern:pat $(if $guard:expr)? => $consequent:expr, $timeout:expr $(,)?) => {{
        $client.send($outgoing)?;
        recv!($client, $pattern $(if $guard)? => $consequent, Instant::now() + $timeout)
    }};
}

macro_rules! expect_response_with_prefix {
    ($client:expr, $prefix:expr, $deadline:expr $(,)?) => {
        recv!($client, Incoming::Unknown(data) if data.starts_with($prefix) => (), $deadline)
    };
}

pub struct Client {
    id: usize,
    unhandled_packets: VecDeque<Incoming>,
    host_to_scanner_tx: mpsc::Sender<(usize, Outgoing)>,
    host_to_scanner_ack_rx: mpsc::Receiver<usize>,
    scanner_to_host_rx: mpsc::Receiver<Incoming>,
}

impl Client {
    #[must_use]
    pub fn new(
        host_to_scanner_tx: mpsc::Sender<(usize, Outgoing)>,
        host_to_scanner_ack_rx: mpsc::Receiver<usize>,
        scanner_to_host_rx: mpsc::Receiver<Incoming>,
    ) -> Self {
        Self {
            id: 0,
            unhandled_packets: VecDeque::new(),
            scanner_to_host_rx,
            host_to_scanner_tx,
            host_to_scanner_ack_rx,
        }
    }

    fn send(&mut self, packet: Outgoing) -> Result<()> {
        let id = self.id;
        self.id = self.id.wrapping_add(1);
        self.host_to_scanner_tx
            .send((id, packet))
            .map_err(|_| Error::Usb(UsbError::Rusb(rusb::Error::Io)))?;
        let ack_id = self
            .host_to_scanner_ack_rx
            .recv()
            .map_err(|_| Error::Usb(UsbError::Rusb(rusb::Error::Io)))?;
        assert_eq!(id, ack_id);
        Ok(())
    }

    /// Gets a test string from the scanner. This is useful for testing the
    /// connection to the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn get_test_string(&mut self, timeout: Duration) -> Result<String> {
        send_and_recv!(
            self => Outgoing::GetTestStringRequest,
            Incoming::GetTestStringResponse(s) => s,
            timeout
        )
    }

    /// Gets the firmware version of the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn get_firmware_version(&mut self, timeout: Duration) -> Result<Version> {
        send_and_recv!(
            self => Outgoing::GetFirmwareVersionRequest,
            Incoming::GetFirmwareVersionResponse(version) => version,
            timeout
        )
    }

    /// Gets the status of the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn get_scanner_status(&mut self, timeout: Duration) -> Result<Status> {
        send_and_recv!(
            self => Outgoing::GetScannerStatusRequest,
            Incoming::GetScannerStatusResponse(status) => status,
            timeout
        )
    }

    /// Gets the number of input sensors that must be covered to initiate
    /// scanning when the feeder is enabled as well as the total number of input
    /// sensors available.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn get_required_input_sensors(&mut self, timeout: Duration) -> Result<(u8, u8)> {
        send_and_recv!(
            self => Outgoing::GetRequiredInputSensorsRequest,
            Incoming::GetSetRequiredInputSensorsResponse {
                current_sensors_required,
                total_sensors_available,
            } => (current_sensors_required, total_sensors_available),
            timeout
        )
    }

    /// Enables or disables the double feed detection. When double feed detection
    /// is enabled, the scanner will attempt to detect when two or more sheets of
    /// paper are fed into the scanner at the same time.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn set_double_feed_detection_mode(&mut self, mode: DoubleFeedDetectionMode) -> Result<()> {
        self.send(match mode {
            DoubleFeedDetectionMode::RejectDoubleFeeds => {
                Outgoing::EnableDoubleFeedDetectionRequest
            }
            DoubleFeedDetectionMode::Disabled => Outgoing::DisableDoubleFeedDetectionRequest,
        })
    }

    /// Enables or disables the feeder. When the feeder is enabled, the scanner
    /// will attempt to scan documents when the required input sensors are
    /// covered.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn set_feeder_mode(&mut self, mode: FeederMode) -> Result<()> {
        self.send(match mode {
            FeederMode::Disabled => Outgoing::DisableFeederRequest,
            FeederMode::AutoScanSheets => Outgoing::EnableFeederRequest,
        })
    }

    /// Gets the serial number of the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn get_serial_number(&mut self, timeout: Duration) -> Result<[u8; 8]> {
        send_and_recv!(
            self => Outgoing::GetSerialNumberRequest,
            Incoming::GetSetSerialNumberResponse(serial_number) => serial_number,
            timeout
        )
    }

    /// Gets the scanner settings.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    pub fn get_scanner_settings(&mut self, timeout: Duration) -> Result<Settings> {
        send_and_recv!(
            self => Outgoing::GetScannerSettingsRequest,
            Incoming::GetScannerSettingsResponse(settings) => settings,
            timeout
        )
    }

    /// Ejects the document from the scanner according to the specified motion.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn eject_document(&mut self, eject_motion: EjectMotion) -> Result<()> {
        self.send(match eject_motion {
            EjectMotion::ToRear => Outgoing::EjectDocumentToRearOfScannerRequest,
            EjectMotion::ToFront => Outgoing::EjectDocumentToFrontOfScannerRequest,
            EjectMotion::ToFrontAndHold => {
                Outgoing::EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest
            }
        })
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
        &mut self,
        side: Side,
        direction: Direction,
        timeout: Duration,
    ) -> Result<u8> {
        send_and_recv!(
            self => Outgoing::AdjustBitonalThresholdBy1Request(
                BitonalAdjustment { side, direction }
            ),
            Incoming::AdjustBitonalThresholdResponse {
                side: response_side,
                percent_white_threshold
            } if side == *response_side => percent_white_threshold,
            timeout
        )
    }

    /// Sets the color mode of the scanner to either native or low color. The
    /// native color mode is 24-bit color for color scanners, and 8-bit
    /// grayscale for grayscale scanners. The low color mode is 8-bit color for
    /// color scanners, and 1-bit bitonal for grayscale scanners.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn set_color_mode(&mut self, color_mode: ColorMode) -> Result<()> {
        self.send(match color_mode {
            ColorMode::Native => Outgoing::TransmitInNativeBitsPerPixelRequest,
            ColorMode::LowColor => Outgoing::TransmitInLowBitsPerPixelRequest,
        })
    }

    /// Sets whether to hold the paper after scanning (default), requiring an
    /// explicit eject command to release it, or to just keep the motors running
    /// and let the paper fall out the back of the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn set_auto_run_out_at_end_of_scan_behavior(
        &mut self,
        behavior: AutoRunOutAtEndOfScanBehavior,
    ) -> Result<()> {
        self.send(match behavior {
            AutoRunOutAtEndOfScanBehavior::HoldPaperInEscrow => {
                Outgoing::DisableAutoRunOutAtEndOfScanRequest
            }
            AutoRunOutAtEndOfScanBehavior::ContinueMotorsToEjectFromRear => {
                Outgoing::EnableAutoRunOutAtEndOfScanRequest
            }
        })
    }

    /// Sets the motor speed to either full or half speed.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn set_motor_speed(&mut self, speed: Speed) -> Result<()> {
        self.send(match speed {
            Speed::Full => Outgoing::ConfigureMotorToRunAtFullSpeedRequest,
            Speed::Half => Outgoing::ConfigureMotorToRunAtHalfSpeedRequest,
        })
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
        send_and_recv!(
            self => Outgoing::SetThresholdToANewValueRequest {
                side,
                new_threshold: threshold
            },
            Incoming::AdjustBitonalThresholdResponse {
                side: response_side,
                percent_white_threshold
            } if side == *response_side => percent_white_threshold,
            timeout
        )
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

    /// Calls `predicate` on each unhandled packet and returns the first packet
    /// for which `predicate` returns `true`.
    ///
    /// # Errors
    ///
    /// If no packet matches, this function will return [`Error::TryRecvError`] with
    /// [`std::sync::mpsc::TryRecvError::Empty`].
    #[allow(clippy::missing_panics_doc)]
    pub fn try_recv_matching(&mut self, predicate: impl Fn(&Incoming) -> bool) -> Result<Incoming> {
        for (i, packet) in self.unhandled_packets.iter().enumerate() {
            if predicate(packet) {
                return Ok(self
                    .unhandled_packets
                    .remove(i)
                    .expect("packet should exist"));
            }
        }

        match self.scanner_to_host_rx.try_recv()? {
            packet if predicate(&packet) => Ok(packet),
            packet => {
                self.unhandled_packets.push_back(packet);
                Err(Error::TryRecvError(mpsc::TryRecvError::Empty))
            }
        }
    }

    /// Receives the next packet from the scanner and returns it if it matches
    /// the predicate. If the packet does not match, it is added to the list of
    /// unhandled packets and the next packet is received.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received within
    /// the timeout.
    #[allow(clippy::missing_panics_doc)]
    fn recv_matching_timeout(
        &mut self,
        predicate: impl Fn(&Incoming) -> bool,
        timeout: Duration,
    ) -> Result<Incoming> {
        let deadline = Instant::now() + timeout;

        for (i, packet) in self.unhandled_packets.iter().enumerate() {
            if predicate(packet) {
                return Ok(self
                    .unhandled_packets
                    .remove(i)
                    .expect("packet should exist"));
            }
        }

        loop {
            if deadline <= Instant::now() {
                return Err(Error::RecvTimeout(mpsc::RecvTimeoutError::Timeout));
            }

            match self
                .scanner_to_host_rx
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))?
            {
                packet if predicate(&packet) => return Ok(packet),
                packet => self.unhandled_packets.push_back(packet),
            }
        }
    }

    /// Sends a command to the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    fn send_command(&mut self, command: &Command) -> Result<()> {
        self.send_raw_packet(&command.to_bytes())
    }

    /// Sends raw packet data to the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn send_raw_packet(&mut self, packet: &[u8]) -> Result<()> {
        self.send(Outgoing::RawPacket(packet.to_vec()))
    }

    /// Sets the resolution of the scanner to either half or native. The native
    /// resolution for the Pagescan 5 is 400 DPI, and the half resolution is 200
    /// DPI.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn set_scan_resolution(&mut self, resolution: Resolution) -> Result<()> {
        match resolution {
            Resolution::Half => {
                self.send(Outgoing::SetScannerImageDensityToHalfNativeResolutionRequest)
            }
            Resolution::Medium => todo!("not implemented for PageScan 5/6"),
            Resolution::Native => {
                self.send(Outgoing::SetScannerImageDensityToNativeResolutionRequest)
            }
        }
    }

    /// Sets the scanner to either duplex mode, top-only simplex mode, or
    /// bottom-only simplex mode.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn set_scan_side_mode(&mut self, scan_side_mode: ScanSideMode) -> Result<()> {
        self.send(match scan_side_mode {
            ScanSideMode::Duplex => Outgoing::SetScannerToDuplexModeRequest,
            ScanSideMode::SimplexTopOnly => Outgoing::SetScannerToTopOnlySimplexModeRequest,
            ScanSideMode::SimplexBottomOnly => Outgoing::SetScannerToBottomOnlySimplexModeRequest,
        })
    }

    /// Enables or disables "pick-on-command" mode. When pick-on-command mode is
    /// enabled, the scanner will not attempt to scan a document until the
    /// [`Outgoing::EnableFeedRequest`] command is received.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn set_pick_on_command_mode(&mut self, mode: PickOnCommandMode) -> Result<()> {
        self.send(match mode {
            PickOnCommandMode::FeederStaysEnabledBetweenScans => {
                Outgoing::DisablePickOnCommandModeRequest
            }
            PickOnCommandMode::FeederMustBeReenabledBetweenScans => {
                Outgoing::EnablePickOnCommandModeRequest
            }
        })
    }

    /// Enables or disables pausing before ejecting a document if the input
    /// sensors detect paper.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn set_eject_pause_mode(&mut self, mode: EjectPauseMode) -> Result<()> {
        self.send(match mode {
            EjectPauseMode::DoNotCheckForInputPaper => Outgoing::DisableEjectPauseRequest,
            EjectPauseMode::PauseWhileInputPaperDetected => Outgoing::EnableEjectPauseRequest,
        })
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
    /// use pdi_scanner::client::Client;
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

    /// Triggers calibration of the double feed detection. The calibration type
    /// parameter specifies the type of calibration to perform. This method
    /// does not wait for the calibration to complete.
    ///
    /// The scanner will send an
    /// [`Incoming::DoubleFeedCalibrationCompleteEvent`] event when the
    /// calibration is complete. If the calibration times out, the scanner will
    /// send an [`Incoming::DoubleFeedCalibrationTimedOutEvent`] event. Note
    /// that the timeout is not configurable.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
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
        send_and_recv!(
            self => Outgoing::GetDoubleFeedDetectionLedIntensityRequest,
            Incoming::GetDoubleFeedDetectionLedIntensityResponse(intensity) => intensity,
            timeout
        )
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
        send_and_recv!(
            self => Outgoing::GetDoubleFeedDetectionSingleSheetCalibrationValueRequest,
            Incoming::GetDoubleFeedDetectionSingleSheetCalibrationValueResponse(value) => value,
            timeout
        )
    }

    /// Gets the double sheet detection calibration value for two sheets of
    /// paper. This value should be higher than the value for a single sheet of
    /// paper.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received
    /// within the timeout.
    pub fn get_double_feed_detection_double_sheet_calibration_value(
        &mut self,
        timeout: Duration,
    ) -> Result<u16> {
        send_and_recv!(
            self => Outgoing::GetDoubleFeedDetectionDoubleSheetCalibrationValueRequest,
            Incoming::GetDoubleFeedDetectionDoubleSheetCalibrationValueResponse(value) => value,
            timeout
        )
    }

    /// Gets the double sheet detection threshold value. Values above this
    /// threshold are considered to be double feeds.
    ///
    /// # Errors
    ///
    /// This function will return an error if the response is not received
    /// within the timeout.
    pub fn get_double_feed_detection_double_sheet_threshold_value(
        &mut self,
        timeout: Duration,
    ) -> Result<u16> {
        send_and_recv!(
            self => Outgoing::GetDoubleFeedDetectionDoubleSheetThresholdValueRequest,
            Incoming::GetDoubleFeedDetectionDoubleSheetThresholdValueResponse(value) => value,
            timeout
        )
    }

    /// Enables or disables the array light source.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
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
        let timeout = Duration::from_secs(5);
        let deadline = Instant::now() + timeout;

        // OUT DisableFeederRequest
        self.set_feeder_mode(FeederMode::Disabled)?;
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
        expect_response_with_prefix!(self, b"\x02<008", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 33 38 03 cb> } (string: "\u{2}<038\u{3}�") (length: 7)
        self.send_command(&Command::new(b"<038"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 33 38 30 30 30 36 38 44 38 30 03> } (string: "\u{2}<03800068D80\u{3}") (length: 14)
        expect_response_with_prefix!(self, b"\x02<", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 31 34 03 42> } (string: "\u{2}<014\u{3}B") (length: 7)
        self.send_command(&Command::new(b"<014"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 31 34 30 30 30 30 30 30 30 30 03> } (string: "\u{2}<01400000000\u{3}") (length: 14)
        expect_response_with_prefix!(self, b"\x02<", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 30 37 03 bf> } (string: "\u{2}<007\u{3}�") (length: 7)
        self.send_command(&Command::new(b"<007"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 30 37 33 33 33 33 33 33 33 33 03> } (string: "\u{2}<00733333333\u{3}") (length: 14)
        expect_response_with_prefix!(self, b"\x02<", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 3c 30 30 39 03 be> } (string: "\u{2}<009\u{3}�") (length: 7)
        self.send_command(&Command::new(b"<009"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 3c 30 30 39 30 30 30 30 30 30 30 38 03> } (string: "\u{2}<00900000008\u{3}") (length: 14)
        expect_response_with_prefix!(self, b"\x02<", deadline)?;
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
        expect_response_with_prefix!(self, b"\x02W", deadline)?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 80 0d 18 a3 a3 a3 a3 a3 a5 a4 ab af aa ac ad b4 b6 b2 b4 b4 b9 b7 b3 b5 b5 b8 b9 b5 b6 b7 bd b9 b8 b7 bb bf bd b9 ba bb c0 bb bc bb bf c0 bc bb ba be c1 bb bb ba bf c0 ba bb bd c1 c1 bb be bf c3 c0 bc c0 bf c3 c2 be bf be c3 be be bb c0 c3 c0 bf be c1 c4 bd bd bd c2 c2 be bf bd c0 c1 bd bf bd …> } (string: "\u{2}W�\r\u{18}�������������������������������������������������������������������¾��þ��������Ľ���¾�������") (length: 6922)
        expect_response_with_prefix!(self, b"\x02W", deadline)?;
        // OUT GetCalibrationInformationRequest { resolution: Some(Half) }
        self.validate_and_send_command_unchecked(
            b"W1",
            parsers::get_calibration_information_request,
        );
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 c0 06 08 b0 b0 b0 af b4 af b4 b1 b2 b6 b3 b7 b2 b6 b5 b5 b8 b5 b9 b6 b4 bb b7 ba b7 b8 bc b9 bf ba ba bc ba bf b9 bd bc bc c1 bc bf be be c0 be c0 bc be be bc c2 bd be c0 bf c1 be c0 c0 c0 c3 c0 c3 bf c2 c2 c1 c4 c0 c4 c5 c2 c8 c2 c4 c4 c3 c6 c2 c6 c3 c3 c8 c3 c6 c6 c3 c8 c4 c8 c3 c5 c6 c3 c9 …> } (string: "\u{2}W�\u{6}\u{8}��������������������������������������������������½����������ÿ�������������������������������") (length: 3466)
        expect_response_with_prefix!(self, b"\x02W", deadline)?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 57 c0 06 18 a9 a9 a9 a9 a9 af ae b2 b1 af b5 b0 b6 b3 b4 b9 b6 b8 b7 b8 b9 b4 bb b6 b7 b8 b7 bc b8 ba b8 ba be b8 bb b9 b8 bb bb be ba bb bd bb bf bb be be bc c0 bc bd bd bb bf bb be bb bd bd bc bf be bf c1 bf c2 c0 c1 bf be c2 be c0 c1 bf c2 bd c2 c1 c0 c2 be c4 bf be c1 be c3 bf c1 c0 c1 c2 bf …> } (string: "\u{2}W�\u{6}\u{18}�����������������������������������������������������������������������¾���½���¾Ŀ���ÿ���¿") (length: 3466)
        expect_response_with_prefix!(self, b"\x02W", deadline)?;
        // OUT GetScannerStatusRequest
        // IN GetScannerStatusResponse(Status { rear_left_sensor_covered: false, rear_right_sensor_covered: false, brander_position_sensor_covered: false, hi_speed_mode: true, download_needed: false, scanner_enabled: false, front_left_sensor_covered: false, front_m1_sensor_covered: false, front_m2_sensor_covered: false, front_m3_sensor_covered: false, front_m4_sensor_covered: false, front_m5_sensor_covered: false, front_right_sensor_covered: false, scanner_ready: true, xmt_aborted: false, document_jam: false, scan_array_pixel_error: false, in_diagnostic_mode: false, document_in_scanner: false, calibration_of_unit_needed: false })
        self.get_scanner_status(timeout)?;
        // OUT GetRequiredInputSensorsRequest
        // IN GetSetRequiredInputSensorsResponse { current_sensors_required: 2, total_sensors_available: 5 }
        self.get_required_input_sensors(timeout)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 33 61 31 30 30 03 7a> } (string: "\u{2}n3a100\u{3}z") (length: 9)
        self.send_command(&Command::new(b"n3a100"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 6e 33 61 31 30 30 3d 35 30 03> } (string: "\u{2}n3a100=50\u{3}") (length: 11)
        expect_response_with_prefix!(self, b"\x02n", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 6e 33 61 31 30 31 03 ed> } (string: "\u{2}n3a101\u{3}�") (length: 9)
        self.send_command(&Command::new(b"n3a101"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 6e 33 61 31 30 31 3d 34 30 03> } (string: "\u{2}n3a101=40\u{3}") (length: 11)
        expect_response_with_prefix!(self, b"\x02n", deadline)?;
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
        expect_response_with_prefix!(self, b"\x02X", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 35 03 f7> } (string: "\u{2}#5\u{3}�") (length: 5)
        self.send_command(&Command::new(b"#5"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 36 35 38 35 36 31 35 37 03> } (string: "\u{2}X65856157\u{3}") (length: 11)
        expect_response_with_prefix!(self, b"\x02X", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 33 03 ab> } (string: "\u{2}#3\u{3}�") (length: 5)
        self.send_command(&Command::new(b"#3"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 31 30 30 35 03> } (string: "\u{2}X1005\u{3}") (length: 7)
        expect_response_with_prefix!(self, b"\x02X", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 30 03 85> } (string: "\u{2}#0\u{3}�") (length: 5)
        self.send_command(&Command::new(b"#0"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 35 38 03> } (string: "\u{2}X58\u{3}") (length: 5)
        expect_response_with_prefix!(self, b"\x02X", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 31 03 12> } (string: "\u{2}#1\u{3}\u{12}") (length: 5)
        self.send_command(&Command::new(b"#1"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 43 03> } (string: "\u{2}XC\u{3}") (length: 4)
        expect_response_with_prefix!(self, b"\x02X", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 32 03 3c> } (string: "\u{2}#2\u{3}<") (length: 5)
        self.send_command(&Command::new(b"#2"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 34 34 39 39 35 03> } (string: "\u{2}X44995\u{3}") (length: 8)
        expect_response_with_prefix!(self, b"\x02X", deadline)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 23 36 03 d9> } (string: "\u{2}#6\u{3}�") (length: 5)
        self.send_command(&Command::new(b"#6"))?;
        // IN UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x85, data: <02 58 34 03> } (string: "\u{2}X4\u{3}") (length: 4)
        expect_response_with_prefix!(self, b"\x02X", deadline)?;

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
        self.set_scan_resolution(Resolution::Half)?;
        // OUT SetScannerToDuplexModeRequest
        self.set_scan_side_mode(ScanSideMode::Duplex)?;
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 67 03 79> } (string: "\u{2}g\u{3}y") (length: 4)
        self.send_command(&Command::new(b"g"))?;
        // OUT DisablePickOnCommandModeRequest
        self.set_pick_on_command_mode(PickOnCommandMode::FeederStaysEnabledBetweenScans)?;
        // OUT DisableDoubleFeedDetectionRequest
        // self.set_double_feed_detection_enabled(false);
        // OUT SetDoubleFeedDetectionSensitivityRequest { percentage: 50 }
        self.set_double_feed_sensitivity(ClampedPercentage::new_unchecked(50))?;
        // OUT SetDoubleFeedDetectionMinimumDocumentLengthRequest { length_in_hundredths_of_an_inch: 40 }
        self.set_double_feed_detection_minimum_document_length(40)?;
        // OUT EnableDoubleFeedDetectionRequest
        // self.set_double_feed_detection_enabled(true);
        // OUT DisableEjectPauseRequest
        self.set_eject_pause_mode(EjectPauseMode::DoNotCheckForInputPaper)?;
        // OUT TransmitInLowBitsPerPixelRequest
        self.set_color_mode(ColorMode::LowColor)?;
        // OUT DisableAutoRunOutAtEndOfScanRequest
        self.set_auto_run_out_at_end_of_scan_behavior(
            AutoRunOutAtEndOfScanBehavior::HoldPaperInEscrow,
        )?;
        // OUT ConfigureMotorToRunAtFullSpeedRequest
        self.set_motor_speed(Speed::Full)?;
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
        self.set_feeder_mode(FeederMode::AutoScanSheets)?;

        Ok(())
    }
}
