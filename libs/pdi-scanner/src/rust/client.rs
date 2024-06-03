use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    sync::mpsc,
    time::{Duration, Instant},
};

use crate::{
    protocol::types::{
        AutoRunOutAtEndOfScanBehavior, Direction, DoubleFeedDetectionMode, EjectPauseMode,
        FeederMode, PickOnCommandMode, Side,
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

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoubleFeedDetectionCalibrationConfig {
    led_intensity: u16,
    single_sheet_calibration_value: u16,
    double_sheet_calibration_value: u16,
    threshold_value: u16,
}

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
        $client.clear_unhandled_packets_except_events();
        $client.send($outgoing)?;
        recv!($client, $pattern $(if $guard)? => $consequent, Instant::now() + $timeout)
    }};
}

pub struct Client<T> {
    id: usize,
    unhandled_packets: VecDeque<Incoming>,
    host_to_scanner_tx: mpsc::Sender<(usize, Outgoing)>,
    host_to_scanner_ack_rx: mpsc::Receiver<usize>,
    scanner_to_host_rx: mpsc::Receiver<Result<Incoming>>,

    // we only hold on to the scanner handle so that it doesn't get dropped
    #[allow(dead_code)]
    scanner_handle: Option<T>,
}

impl<T> Client<T> {
    #[must_use]
    pub fn new(
        host_to_scanner_tx: mpsc::Sender<(usize, Outgoing)>,
        host_to_scanner_ack_rx: mpsc::Receiver<usize>,
        scanner_to_host_rx: mpsc::Receiver<Result<Incoming>>,
        scanner_handle: Option<T>,
    ) -> Self {
        Self {
            id: 0,
            unhandled_packets: VecDeque::new(),
            scanner_to_host_rx,
            host_to_scanner_tx,
            host_to_scanner_ack_rx,
            scanner_handle,
        }
    }

    // There should only be one command/response occurring at a time, so before
    // we send a command that expects a response, we should clear out any old
    // responses. This ensures we don't get an outdated response (e.g. a previous scanner
    // status that didn't get received when its command was sent). Thus, this
    // method is called in the send_and_recv! macro.
    //
    // This accounts for the fact that there are cases where the scanner will
    // delay sending a response to a command (e.g. when the "eject pause"
    // feature pauses the scanner, it will queue commands received during that
    // time).
    fn clear_unhandled_packets_except_events(&mut self) {
        let unhandled_non_event_packets = self
            .unhandled_packets
            .iter()
            .filter(|packet| !packet.is_event())
            .collect::<Vec<_>>();
        if !unhandled_non_event_packets.is_empty() {
            tracing::debug!("clearing unhandled packets: {unhandled_non_event_packets:?}");
            self.unhandled_packets.retain(Incoming::is_event);
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
    /// Disables the feeder afterwards to protect against a second document
    /// sneaking in.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub fn eject_document(&mut self, eject_motion: EjectMotion) -> Result<()> {
        // The feeder needs to be enabled for the eject command to work.
        self.set_feeder_mode(FeederMode::AutoScanSheets)?;
        self.set_eject_pause_mode(match eject_motion {
            EjectMotion::ToRear => EjectPauseMode::PauseWhileInputPaperDetected,
            _ => EjectPauseMode::DoNotCheckForInputPaper,
        })?;
        self.send(match eject_motion {
            EjectMotion::ToRear => Outgoing::EjectDocumentToRearOfScannerRequest,
            EjectMotion::ToFront => Outgoing::EjectDocumentToFrontOfScannerRequest,
            EjectMotion::ToFrontAndHold => {
                Outgoing::EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest
            }
            EjectMotion::ToFrontAndRescan => Outgoing::RescanDocumentHeldInEscrowPositionRequest,
        })?;
        // It's safest to always disable the feeder after ejecting a document to
        // protect against a second document sneaking in.
        self.set_feeder_mode(FeederMode::Disabled)
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
            Ok(packet) if predicate(&packet) => Ok(packet),
            Ok(packet) => {
                self.unhandled_packets.push_back(packet);
                Err(Error::TryRecvError(mpsc::TryRecvError::Empty))
            }
            err => err,
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
                Ok(packet) if predicate(&packet) => return Ok(packet),
                Ok(packet) => self.unhandled_packets.push_back(packet),
                err => return err,
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
    /// ```ignore
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
        self.set_double_feed_detection_mode(DoubleFeedDetectionMode::Disabled)?;
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

    pub fn get_double_feed_detection_calibration_config(
        &mut self,
        timeout: Duration,
    ) -> Result<DoubleFeedDetectionCalibrationConfig> {
        let led_intensity = self.get_double_feed_detection_led_intensity(timeout)?;
        let single_sheet_calibration_value =
            self.get_double_feed_detection_single_sheet_calibration_value(timeout)?;
        let double_sheet_calibration_value =
            self.get_double_feed_detection_double_sheet_calibration_value(timeout)?;
        let threshold_value =
            self.get_double_feed_detection_double_sheet_threshold_value(timeout)?;

        Ok(DoubleFeedDetectionCalibrationConfig {
            led_intensity,
            single_sheet_calibration_value,
            double_sheet_calibration_value,
            threshold_value,
        })
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

    /// Sends commands to make sure the scanner starts in the correct state after connecting.
    ///
    /// # Errors
    ///
    /// This function will return an error if any of the commands fail to
    /// validate or if the response is not received within the timeout.
    pub fn send_initial_commands_after_connect(&mut self, timeout: Duration) -> Result<()> {
        self.get_test_string(timeout)?;
        self.set_feeder_mode(FeederMode::Disabled)?;

        // This command enables "flow control" on the scanner
        // // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 1b 55 03 a0> } (string: "\u{2}\u{1b}U\u{3}�") (length: 5)
        // self.send_command(&Command::new(b"\x1bU"))?;

        // Turn on CRC checking on the scanner
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 1b 4b 03 1b> } (string: "\u{2}\u{1b}K\u{3}\u{1b}") (length: 5)
        self.send_command(&Command::new(b"\x1bK"))?;

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
    pub fn send_enable_scan_commands(
        &mut self,
        double_feed_detection_mode: DoubleFeedDetectionMode,
        paper_length_inches: f32,
    ) -> Result<()> {
        let timeout = Duration::from_secs(5);

        // OUT SetScannerImageDensityToHalfNativeResolutionRequest
        self.set_scan_resolution(Resolution::Half)?;
        // OUT SetScannerToDuplexModeRequest
        self.set_scan_side_mode(ScanSideMode::Duplex)?;
        // OUT Enable AutoScanStart
        self.send_command(&Command::new(b"g"))?;
        // OUT DisablePickOnCommandModeRequest
        self.set_pick_on_command_mode(PickOnCommandMode::FeederStaysEnabledBetweenScans)?;
        // OUT SetDoubleFeedDetectionSensitivityRequest { percentage: 50 }
        self.set_double_feed_sensitivity(ClampedPercentage::new_unchecked(50))?;
        // OUT SetDoubleFeedDetectionMinimumDocumentLengthRequest { length_in_hundredths_of_an_inch: 100 }
        // From the docs:
        //      The higher the value in this tag, the longer the overlap needs to be
        //      before a double feed is detected. If horizontal black lines are
        //      present on the documents, an appropriate setting of this tag will
        //      allow you to skip those lines.
        // Since our ballots have thick black areas (timing marks, illustrations),
        // we set this to a full inch to be safe.
        self.set_double_feed_detection_minimum_document_length(100)?;
        // OUT DisableDoubleFeedDetectionRequest
        self.set_double_feed_detection_mode(double_feed_detection_mode)?;
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

        // Set the max length of the document to scan to 0.5" less than the
        // paper length. Experimentally, this seems to result in the scanner
        // successfully scanning paper of the given length but rejecting two
        // pieces of paper inserted back to back. Crucially, it stops the motors
        // quickly enough to avoid the first piece of paper being ejected out of
        // the rear accidentally. If you set the max length to the exact paper
        // length, the scanner will not stop quickly enough.
        // OUT SetLengthOfDocumentToScanRequest
        self.set_length_of_document_to_scan(paper_length_inches - 0.5)?;
        // OUT SetScanDelayIntervalForDocumentFeedRequest { delay_interval: 0ns }
        self.set_scan_delay_interval_for_document_feed(Duration::ZERO)?;
        // OUT EnableFeederRequest
        self.set_feeder_mode(FeederMode::AutoScanSheets)?;

        Ok(())
    }
}
