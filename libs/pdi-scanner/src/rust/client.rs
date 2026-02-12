use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, io, time::Duration};
use tokio::sync::mpsc::error::TryRecvError;

use crate::{
    protocol::types::{
        AutoRunOutAtEndOfScanBehavior, Direction, DoubleFeedDetectionMode, EjectPauseMode,
        FeederMode, PickOnCommandMode, Side,
    },
    Error, Result,
};

use super::protocol::{
    packets::{Command, Incoming, Outgoing},
    types::{
        BitonalAdjustment, ClampedPercentage, ColorMode, DoubleFeedDetectionCalibrationType,
        EjectMotion, Resolution, ScanSideMode, Settings, Speed, Status, Version,
    },
};

const DEFAULT_RESOLUTION: Resolution = Resolution::Half;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DoubleFeedDetectionCalibrationConfig {
    led_intensity: u16,
    single_sheet_calibration_value: u16,
    double_sheet_calibration_value: u16,
    threshold_value: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImageCalibrationTables {
    pub front_white: Vec<u8>,
    pub front_black: Vec<u8>,
    pub back_white: Vec<u8>,
    pub back_black: Vec<u8>,
}

pub struct Client<T> {
    id: usize,
    unhandled_packets: VecDeque<Incoming>,
    host_to_scanner_tx: tokio::sync::mpsc::UnboundedSender<(usize, Outgoing)>,
    host_to_scanner_ack_rx: tokio::sync::mpsc::UnboundedReceiver<usize>,
    scanner_to_host_rx: tokio::sync::mpsc::UnboundedReceiver<Result<Incoming>>,

    // we only hold on to the scanner handle so that it doesn't get dropped
    #[allow(dead_code)]
    scanner_handle: Option<T>,
}

impl<T> Client<T> {
    #[must_use]
    pub fn new(
        host_to_scanner_tx: tokio::sync::mpsc::UnboundedSender<(usize, Outgoing)>,
        host_to_scanner_ack_rx: tokio::sync::mpsc::UnboundedReceiver<usize>,
        scanner_to_host_rx: tokio::sync::mpsc::UnboundedReceiver<Result<Incoming>>,
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

    async fn send(&mut self, packet: Outgoing) -> Result<()> {
        self.clear_unhandled_solicited_packets();

        let id = self.id;
        self.id = self.id.wrapping_add(1);
        self.host_to_scanner_tx.send((id, packet)).map_err(|_| {
            Error::from(nusb::Error::new(
                io::ErrorKind::ConnectionAborted,
                "failed to send packet to scanner (host to scanner channel closed)",
            ))
        })?;
        let Some(ack_id) = self.host_to_scanner_ack_rx.recv().await else {
            return Err(nusb::Error::new(
                io::ErrorKind::ConnectionAborted,
                "failed to receive ack from scanner (host to scanner ack channel closed)",
            )
            .into());
        };
        assert_eq!(id, ack_id);
        Ok(())
    }

    // There should only be one command/response occurring at a time, so before
    // we send a command that expects a response, we should clear out any old
    // responses. This ensures we don't get an outdated response (e.g. a previous scanner
    // status that didn't get received when its command was sent).
    //
    // This accounts for the fact that there are cases where the scanner will
    // delay sending a response to a command (e.g. when the "eject pause"
    // feature pauses the scanner, it will queue commands received during that
    // time).
    fn clear_unhandled_solicited_packets(&mut self) {
        let mut unhandled_packets = VecDeque::with_capacity(self.unhandled_packets.len());
        std::mem::swap(&mut unhandled_packets, &mut self.unhandled_packets);

        let (unsolicited_packets, solicited_packets): (Vec<_>, Vec<_>) = unhandled_packets
            .into_iter()
            .partition(|packet| packet.message_type().is_unsolicited());

        if !solicited_packets.is_empty() {
            tracing::debug!("clearing unhandled solicited packets: {solicited_packets:?}");
        }

        self.unhandled_packets.extend(unsolicited_packets);
    }

    /// Gets a test string from the scanner. This is useful for testing the
    /// connection to the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_test_string(&mut self) -> Result<String> {
        self.send(Outgoing::GetTestStringRequest).await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetTestStringResponse(s) => Ok(s),
            packet => Err(packet),
        })
        .await
    }

    /// Gets the firmware version of the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_firmware_version(&mut self) -> Result<Version> {
        self.send(Outgoing::GetFirmwareVersionRequest).await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetFirmwareVersionResponse(version) => Ok(version),
            packet => Err(packet),
        })
        .await
    }

    /// Gets the status of the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_scanner_status(&mut self) -> Result<Status> {
        self.send(Outgoing::GetScannerStatusRequest).await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetScannerStatusResponse(status) => Ok(status),
            packet => Err(packet),
        })
        .await
    }

    /// Gets the number of input sensors that must be covered to initiate
    /// scanning when the feeder is enabled as well as the total number of input
    /// sensors available.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_required_input_sensors(&mut self) -> Result<(u8, u8)> {
        self.send(Outgoing::GetRequiredInputSensorsRequest).await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetSetRequiredInputSensorsResponse {
                current_sensors_required,
                total_sensors_available,
            } => Ok((current_sensors_required, total_sensors_available)),
            packet => Err(packet),
        })
        .await
    }

    /// Enables or disables the double feed detection. When double feed detection
    /// is enabled, the scanner will attempt to detect when two or more sheets of
    /// paper are fed into the scanner at the same time.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn set_double_feed_detection_mode(
        &mut self,
        mode: DoubleFeedDetectionMode,
    ) -> Result<()> {
        self.send(match mode {
            DoubleFeedDetectionMode::RejectDoubleFeeds => {
                Outgoing::EnableDoubleFeedDetectionRequest
            }
            DoubleFeedDetectionMode::Disabled => Outgoing::DisableDoubleFeedDetectionRequest,
        })
        .await
    }

    /// Enables or disables the feeder. When the feeder is enabled, the scanner
    /// will attempt to scan documents when the required input sensors are
    /// covered.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn set_feeder_mode(&mut self, mode: FeederMode) -> Result<()> {
        self.send(match mode {
            FeederMode::Disabled => Outgoing::DisableFeederRequest,
            FeederMode::AutoScanSheets => Outgoing::EnableFeederRequest,
        })
        .await
    }

    /// Gets the serial number of the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_serial_number(&mut self) -> Result<[u8; 8]> {
        self.send(Outgoing::GetSerialNumberRequest).await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetSetSerialNumberResponse(serial_number) => Ok(serial_number),
            packet => Err(packet),
        })
        .await
    }

    /// Gets the scanner settings.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_scanner_settings(&mut self) -> Result<Settings> {
        self.send(Outgoing::GetScannerSettingsRequest).await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetScannerSettingsResponse(settings) => Ok(settings),
            packet => Err(packet),
        })
        .await
    }

    /// Ejects the document from the scanner according to the specified motion.
    /// Disables the feeder afterwards to protect against a second document
    /// sneaking in.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn eject_document(&mut self, eject_motion: EjectMotion) -> Result<()> {
        self.set_eject_pause_mode(match eject_motion {
            EjectMotion::ToRear => EjectPauseMode::PauseWhileInputPaperDetected,
            _ => EjectPauseMode::DoNotCheckForInputPaper,
        })
        .await?;
        // The feeder needs to be enabled for the eject command to work.
        self.set_feeder_mode(FeederMode::AutoScanSheets).await?;
        self.send(match eject_motion {
            EjectMotion::ToRear => Outgoing::EjectDocumentToRearOfScannerRequest,
            EjectMotion::ToFront => Outgoing::EjectDocumentToFrontOfScannerRequest,
            EjectMotion::ToFrontAndHold => {
                Outgoing::EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest
            }
            EjectMotion::ToFrontAndRescan => Outgoing::RescanDocumentHeldInEscrowPositionRequest,
        })
        .await?;
        // It's safest to always disable the feeder after ejecting a document to
        // protect against a second document sneaking in.
        self.set_feeder_mode(FeederMode::Disabled).await
    }

    /// Adjusts the bitonal threshold by 1. The threshold is a percentage of the
    /// luminosity that must be detected before the scanner will consider a
    /// pixel to be white. The threshold is adjusted separately for the top and
    /// bottom sensors.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn adjust_bitonal_threshold_by_1(
        &mut self,
        side: Side,
        direction: Direction,
    ) -> Result<u8> {
        self.send(Outgoing::AdjustBitonalThresholdBy1Request(
            BitonalAdjustment { side, direction },
        ))
        .await?;
        self.recv_matching(|packet| match packet {
            Incoming::AdjustBitonalThresholdResponse {
                side: response_side,
                percent_white_threshold,
            } if side == response_side => Ok(percent_white_threshold),
            packet => Err(packet),
        })
        .await
    }

    /// Sets the color mode of the scanner to either native or low color. The
    /// native color mode is 24-bit color for color scanners, and 8-bit
    /// grayscale for grayscale scanners. The low color mode is 8-bit color for
    /// color scanners, and 1-bit bitonal for grayscale scanners.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn set_color_mode(&mut self, color_mode: ColorMode) -> Result<()> {
        self.send(match color_mode {
            ColorMode::Native => Outgoing::TransmitInNativeBitsPerPixelRequest,
            ColorMode::LowColor => Outgoing::TransmitInLowBitsPerPixelRequest,
        })
        .await
    }

    /// Sets whether to hold the paper after scanning (default), requiring an
    /// explicit eject command to release it, or to just keep the motors running
    /// and let the paper fall out the back of the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn set_auto_run_out_at_end_of_scan_behavior(
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
        .await
    }

    /// Sets the motor speed to either full or half speed.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn set_motor_speed(&mut self, speed: Speed) -> Result<()> {
        self.send(match speed {
            Speed::Full => Outgoing::ConfigureMotorToRunAtFullSpeedRequest,
            Speed::Half => Outgoing::ConfigureMotorToRunAtHalfSpeedRequest,
        })
        .await
    }

    /// Sets the bitonal threshold for the top or bottom sensor. The threshold
    /// is a percentage of the luminosity that must be detected before the
    /// scanner will consider a pixel to be white. The threshold is adjusted
    /// separately for the top and bottom sensors.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn set_threshold(&mut self, side: Side, threshold: ClampedPercentage) -> Result<u8> {
        self.send(Outgoing::SetThresholdToANewValueRequest {
            side,
            new_threshold: threshold,
        })
        .await?;
        self.recv_matching(|packet| match packet {
            Incoming::AdjustBitonalThresholdResponse {
                side: response_side,
                percent_white_threshold,
            } if side == response_side => Ok(percent_white_threshold),
            packet => Err(packet),
        })
        .await
    }

    /// Sets the number of input sensors that must be covered to initiate
    /// scanning when the feeder is enabled.
    ///
    /// # Errors
    ///
    /// This function will return an error if the sensors is not a valid value.
    pub async fn set_required_input_sensors(&mut self, sensors: u8) -> Result<()> {
        self.send(Outgoing::SetRequiredInputSensorsRequest { sensors })
            .await
    }

    /// Sets the maximum length of the document to scan. The length is specified
    /// in inches. The scanner will not attempt to scan a document longer than
    /// the specified length, and will consider the document to be jammed if it
    /// is longer than the specified length.
    ///
    /// # Errors
    ///
    /// This function will return an error if the length is not a valid value.
    pub async fn set_length_of_document_to_scan(&mut self, length_inches: f32) -> Result<()> {
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
                return self
                    .send(Outgoing::SetLengthOfDocumentToScanRequest {
                        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
                        length_byte: length_byte as u8,
                        unit_byte: if unit_byte == b'0' {
                            None
                        } else {
                            Some(unit_byte)
                        },
                    })
                    .await;
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
    pub async fn set_scan_delay_interval_for_document_feed(
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
            .await
    }

    /// Returns the next unhandled packet from the internal queue or awaits
    /// a packet from the scanner if the internal queue is empty.
    ///
    /// # Errors
    ///
    /// If the channel to the scanner has closed, this function will return
    /// [`Error::TryRecvError`].
    pub async fn recv(&mut self) -> Result<Incoming> {
        if let Some(packet) = self.unhandled_packets.pop_front() {
            tracing::debug!("returning unhandled packet: {packet:?}");
            return Ok(packet);
        }

        match self.scanner_to_host_rx.recv().await {
            Some(result) => result,
            None => Err(Error::TryRecvError(TryRecvError::Disconnected)),
        }
    }

    /// Receives packets from the scanner until a call to the provided function
    /// returns [`Ok`] with the data to return from this call. If the packet does
    /// not match it should be returned from the function using [`Err`], and it
    /// will be added to the list of unhandled packets to be tried on subsequent
    /// calls to [`Self::recv_matching`].
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    #[allow(clippy::missing_panics_doc)]
    async fn recv_matching<P>(
        &mut self,
        filter_map: impl Fn(Incoming) -> Result<P, Incoming>,
    ) -> Result<P> {
        let mut unhandled_packets = VecDeque::with_capacity(self.unhandled_packets.len());
        std::mem::swap(&mut unhandled_packets, &mut self.unhandled_packets);

        let mut received_value = None;

        for packet in unhandled_packets {
            if received_value.is_some() {
                self.unhandled_packets.push_back(packet);
            } else {
                match filter_map(packet) {
                    Ok(value) => {
                        received_value = Some(value);
                    }
                    Err(packet) => {
                        self.unhandled_packets.push_back(packet);
                    }
                }
            }
        }

        if let Some(value) = received_value {
            return Ok(value);
        }

        loop {
            match self.scanner_to_host_rx.recv().await {
                Some(Ok(packet)) => match filter_map(packet) {
                    Ok(value) => return Ok(value),
                    Err(packet) => self.unhandled_packets.push_back(packet),
                },
                Some(Err(error)) => return Err(error),
                None => return Err(Error::TryRecvError(TryRecvError::Disconnected)),
            }
        }
    }

    /// Sends a command to the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    async fn send_command(&mut self, command: &Command) -> Result<()> {
        self.send_raw_packet(&command.to_bytes()).await
    }

    /// Sends raw packet data to the scanner.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub async fn send_raw_packet(&mut self, packet: &[u8]) -> Result<()> {
        self.send(Outgoing::RawPacket(packet.to_vec())).await
    }

    /// Sets the resolution of the scanner to either half or native. The native
    /// resolution for the Pagescan 5 is 400 DPI, and the half resolution is 200
    /// DPI.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub async fn set_scan_resolution(&mut self, resolution: Resolution) -> Result<()> {
        match resolution {
            Resolution::Half => {
                self.send(Outgoing::SetScannerImageDensityToHalfNativeResolutionRequest)
                    .await
            }
            Resolution::Medium => todo!("not implemented for PageScan 5/6"),
            Resolution::Native => {
                self.send(Outgoing::SetScannerImageDensityToNativeResolutionRequest)
                    .await
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
    pub async fn set_scan_side_mode(&mut self, scan_side_mode: ScanSideMode) -> Result<()> {
        self.send(match scan_side_mode {
            ScanSideMode::Duplex => Outgoing::SetScannerToDuplexModeRequest,
            ScanSideMode::SimplexTopOnly => Outgoing::SetScannerToTopOnlySimplexModeRequest,
            ScanSideMode::SimplexBottomOnly => Outgoing::SetScannerToBottomOnlySimplexModeRequest,
        })
        .await
    }

    /// Enables or disables "pick-on-command" mode. When pick-on-command mode is
    /// enabled, the scanner will not attempt to scan a document until the
    /// [`Outgoing::EnableFeedRequest`] command is received.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub async fn set_pick_on_command_mode(&mut self, mode: PickOnCommandMode) -> Result<()> {
        self.send(match mode {
            PickOnCommandMode::FeederStaysEnabledBetweenScans => {
                Outgoing::DisablePickOnCommandModeRequest
            }
            PickOnCommandMode::FeederMustBeReenabledBetweenScans => {
                Outgoing::EnablePickOnCommandModeRequest
            }
        })
        .await
    }

    /// Enables or disables pausing before ejecting a document if the input
    /// sensors detect paper.
    ///
    /// # Errors
    ///
    /// This function will return an error if the connection to the scanner is
    /// lost.
    pub async fn set_eject_pause_mode(&mut self, mode: EjectPauseMode) -> Result<()> {
        self.send(match mode {
            EjectPauseMode::DoNotCheckForInputPaper => Outgoing::DisableEjectPauseRequest,
            EjectPauseMode::PauseWhileInputPaperDetected => Outgoing::EnableEjectPauseRequest,
        })
        .await
    }

    /// Sets the sensitivity of the double feed detection. The percentage
    /// parameter is a value from 0 to 100, where 0 is the least sensitive and
    /// 100 is the most sensitive.
    ///
    /// # Errors
    ///
    /// This function will return an error if the percentage is not between 0
    /// and 100.
    pub async fn set_double_feed_sensitivity(
        &mut self,
        percentage: ClampedPercentage,
    ) -> Result<()> {
        self.send(Outgoing::SetDoubleFeedDetectionSensitivityRequest { percentage })
            .await
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
    pub async fn set_double_feed_detection_minimum_document_length(
        &mut self,
        length_in_hundredths_of_an_inch: u8,
    ) -> Result<()> {
        self.send(
            Outgoing::SetDoubleFeedDetectionMinimumDocumentLengthRequest {
                length_in_hundredths_of_an_inch,
            },
        )
        .await
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
    pub async fn calibrate_double_feed_detection(
        &mut self,
        calibration_type: DoubleFeedDetectionCalibrationType,
    ) -> Result<()> {
        self.set_double_feed_detection_mode(DoubleFeedDetectionMode::Disabled)
            .await?;
        self.send(Outgoing::CalibrateDoubleFeedDetectionRequest(
            calibration_type,
        ))
        .await
    }

    /// Gets the intensity of the double feed detection LED.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_double_feed_detection_led_intensity(&mut self) -> Result<u16> {
        self.send(Outgoing::GetDoubleFeedDetectionLedIntensityRequest)
            .await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetDoubleFeedDetectionLedIntensityResponse(intensity) => Ok(intensity),
            packet => Err(packet),
        })
        .await
    }

    /// Gets the double sheet detection calibration value for a single sheet of paper. This value
    /// should be lower than the value for two sheets of paper.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_double_feed_detection_single_sheet_calibration_value(
        &mut self,
    ) -> Result<u16> {
        self.send(Outgoing::GetDoubleFeedDetectionSingleSheetCalibrationValueRequest)
            .await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetDoubleFeedDetectionSingleSheetCalibrationValueResponse(value) => Ok(value),
            packet => Err(packet),
        })
        .await
    }

    /// Gets the double sheet detection calibration value for two sheets of
    /// paper. This value should be higher than the value for a single sheet of
    /// paper.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_double_feed_detection_double_sheet_calibration_value(
        &mut self,
    ) -> Result<u16> {
        self.send(Outgoing::GetDoubleFeedDetectionDoubleSheetCalibrationValueRequest)
            .await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetDoubleFeedDetectionDoubleSheetCalibrationValueResponse(value) => Ok(value),
            packet => Err(packet),
        })
        .await
    }

    /// Gets the double sheet detection threshold value. Values above this
    /// threshold are considered to be double feeds.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn get_double_feed_detection_double_sheet_threshold_value(&mut self) -> Result<u16> {
        self.send(Outgoing::GetDoubleFeedDetectionDoubleSheetThresholdValueRequest)
            .await?;
        self.recv_matching(|packet| match packet {
            Incoming::GetDoubleFeedDetectionDoubleSheetThresholdValueResponse(value) => Ok(value),
            packet => Err(packet),
        })
        .await
    }

    /// Gets the double feed detection calibration configuration.
    ///
    /// # Errors
    ///
    /// Fails if any of the underlying config requests for the double feed
    /// detection configuration properties fail.
    pub async fn get_double_feed_detection_calibration_config(
        &mut self,
    ) -> Result<DoubleFeedDetectionCalibrationConfig> {
        let led_intensity = self.get_double_feed_detection_led_intensity().await?;
        let single_sheet_calibration_value = self
            .get_double_feed_detection_single_sheet_calibration_value()
            .await?;
        let double_sheet_calibration_value = self
            .get_double_feed_detection_double_sheet_calibration_value()
            .await?;
        let threshold_value = self
            .get_double_feed_detection_double_sheet_threshold_value()
            .await?;

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
    pub async fn set_array_light_source_enabled(&mut self, enabled: bool) -> Result<()> {
        self.send(if enabled {
            Outgoing::TurnArrayLightSourceOnRequest
        } else {
            Outgoing::TurnArrayLightSourceOffRequest
        })
        .await
    }

    /// Gets the image calibration tables. They're used to adjust the luminosity
    /// of the returned images.
    ///
    /// # Errors
    ///
    /// Fails if we cannot parse the incoming calibration tables.
    pub async fn get_image_calibration_tables(&mut self) -> Result<ImageCalibrationTables> {
        // Since we're using a duplex scanner, the request is followed by two
        // responses, one for the front sensors and one for the back sensors.
        self.send(Outgoing::GetCalibrationInformationRequest {
            resolution: Some(DEFAULT_RESOLUTION),
        })
        .await?;
        let (front_white, front_black) = self
            .recv_matching(|packet| match packet {
                Incoming::GetCalibrationInformationResponse {
                    white_calibration_table,
                    black_calibration_table,
                } => Ok((white_calibration_table, black_calibration_table)),
                packet => Err(packet),
            })
            .await?;
        let (mut back_white, mut back_black) = self
            .recv_matching(|packet| match packet {
                Incoming::GetCalibrationInformationResponse {
                    white_calibration_table,
                    black_calibration_table,
                } => Ok((white_calibration_table, black_calibration_table)),
                packet => Err(packet),
            })
            .await?;
        // We reverse the back calibration tables because the image pixels are
        // in the opposite order (due to the sensors being flipped upside down).
        back_white.reverse();
        back_black.reverse();
        Ok(ImageCalibrationTables {
            front_white,
            front_black,
            back_white,
            back_black,
        })
    }

    /// Triggers calibration of the image sensors.
    ///
    /// # Errors
    ///
    /// Fails if we're unable to communicate with the scanner.
    pub async fn calibrate_image_sensors(&mut self) -> Result<()> {
        self.send(Outgoing::CalibrateImageSensorsRequest).await
    }

    /// Sends commands to make sure the scanner starts in the correct state after connecting.
    ///
    /// # Errors
    ///
    /// This function will return an error if any of the commands fail to
    /// validate.
    pub async fn send_initial_commands_after_connect(&mut self) -> Result<ImageCalibrationTables> {
        self.get_test_string().await?;
        self.set_feeder_mode(FeederMode::Disabled).await?;

        // This command enables "flow control" on the scanner
        // // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 1b 55 03 a0> } (string: "\u{2}\u{1b}U\u{3}�") (length: 5)
        // self.send_command(&Command::new(b"\x1bU"))?;

        // Turn on CRC checking on the scanner
        // OUT UNKNOWN Packet { transfer_type: 0x03, endpoint_address: 0x05, data: <02 1b 4b 03 1b> } (string: "\u{2}\u{1b}K\u{3}\u{1b}") (length: 5)
        self.send_command(&Command::new(b"\x1bK")).await?;

        self.get_image_calibration_tables().await
    }

    /// Sends the same commands to enable scanning that were captured by
    /// wireshark from the `scan_demo` program. Some of them may not be
    /// necessary, but they're included for now.
    ///
    /// # Errors
    ///
    /// This function will return an error if a communication error occurs.
    pub async fn send_enable_scan_commands(
        &mut self,
        bitonal_threshold: ClampedPercentage,
        double_feed_detection_mode: DoubleFeedDetectionMode,
        paper_length_inches: f32,
    ) -> Result<()> {
        // OUT SetScannerImageDensityToHalfNativeResolutionRequest
        self.set_scan_resolution(DEFAULT_RESOLUTION).await?;
        // OUT SetScannerToDuplexModeRequest
        self.set_scan_side_mode(ScanSideMode::Duplex).await?;
        // OUT Enable AutoScanStart
        self.send_command(&Command::new(b"g")).await?;
        // OUT EnablePickOnCommandModeRequest
        // Ensure the next scan will not start until we explicitly enable the feeder.
        // This ensures we can safely process the results of one scan before another starts.
        self.set_pick_on_command_mode(PickOnCommandMode::FeederMustBeReenabledBetweenScans)
            .await?;
        // OUT SetDoubleFeedDetectionSensitivityRequest { percentage: 50 }
        self.set_double_feed_sensitivity(ClampedPercentage::new_unchecked(50))
            .await?;
        // OUT SetDoubleFeedDetectionMinimumDocumentLengthRequest { length_in_hundredths_of_an_inch: 100 }
        // From the docs:
        //      The higher the value in this tag, the longer the overlap needs to be
        //      before a double feed is detected. If horizontal black lines are
        //      present on the documents, an appropriate setting of this tag will
        //      allow you to skip those lines.
        // Since our ballots have thick black areas (timing marks, illustrations),
        // we set this to a full inch to be safe.
        self.set_double_feed_detection_minimum_document_length(100)
            .await?;
        // OUT DisableDoubleFeedDetectionRequest
        self.set_double_feed_detection_mode(double_feed_detection_mode)
            .await?;
        // OUT TransmitInLowBitsPerPixelRequest
        self.set_color_mode(ColorMode::Native).await?;
        // OUT DisableAutoRunOutAtEndOfScanRequest
        self.set_auto_run_out_at_end_of_scan_behavior(
            AutoRunOutAtEndOfScanBehavior::HoldPaperInEscrow,
        )
        .await?;
        // OUT ConfigureMotorToRunAtFullSpeedRequest
        self.set_motor_speed(Speed::Full).await?;
        // OUT SetThresholdToANewValueRequest { side: Top, new_threshold: 75 }
        // IN AdjustTopCISSensorThresholdResponse { percent_white_threshold: 75 }
        self.set_threshold(Side::Top, bitonal_threshold).await?;
        // OUT SetThresholdToANewValueRequest { side: Bottom, new_threshold: 75 }
        // IN AdjustBottomCISSensorThresholdResponse { percent_white_threshold: 75 }
        self.set_threshold(Side::Bottom, bitonal_threshold).await?;
        // OUT SetRequiredInputSensorsRequest { sensors: 2 }
        self.set_required_input_sensors(2).await?;

        // Set the max length of the document to scan to 0.5" less than the
        // paper length. Experimentally, this seems to result in the scanner
        // successfully scanning paper of the given length but rejecting two
        // pieces of paper inserted back to back. Crucially, it stops the motors
        // quickly enough to avoid the first piece of paper being ejected out of
        // the rear accidentally. If you set the max length to the exact paper
        // length, the scanner will not stop quickly enough.
        // OUT SetLengthOfDocumentToScanRequest
        self.set_length_of_document_to_scan(paper_length_inches - 0.5)
            .await?;
        // OUT SetScanDelayIntervalForDocumentFeedRequest { delay_interval: 0ns }
        self.set_scan_delay_interval_for_document_feed(Duration::ZERO)
            .await?;
        // OUT EnableFeederRequest
        self.set_feeder_mode(FeederMode::AutoScanSheets).await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::time::timeout;

    use crate::protocol::packets::{ImageData, Incoming, Outgoing};

    use super::Client;

    #[tokio::test]
    async fn test_pending_image_data_is_not_dropped_on_new_request() {
        let (host_to_scanner_tx, mut host_to_scanner_rx) = tokio::sync::mpsc::unbounded_channel();
        let (host_to_scanner_ack_tx, host_to_scanner_ack_rx) =
            tokio::sync::mpsc::unbounded_channel();
        let (scanner_to_host_tx, scanner_to_host_rx) = tokio::sync::mpsc::unbounded_channel();
        let mut client = Client::new(
            host_to_scanner_tx,
            host_to_scanner_ack_rx,
            scanner_to_host_rx,
            // dummy value
            Some(()),
        );

        // add some image data to the incoming queue of data
        scanner_to_host_tx
            .send(Ok(Incoming::ImageData(ImageData(vec![0x00]))))
            .unwrap();

        // set up response to `get_test_string`
        scanner_to_host_tx
            .send(Ok(Incoming::GetTestStringResponse("test".to_owned())))
            .unwrap();
        host_to_scanner_ack_tx.send(0).unwrap();

        // make sure the response came through okay, and force the above
        // `Incoming::ImageData` into the `unhandled_packets` queue
        assert_eq!(
            timeout(Duration::from_millis(10), client.get_test_string())
                .await
                .unwrap()
                .unwrap(),
            "test"
        );

        // check the data sent to the scanner
        assert_eq!(
            host_to_scanner_rx.recv().await.unwrap(),
            (0, Outgoing::GetTestStringRequest)
        );

        // make sure the image data is in the queue
        assert_eq!(
            client.unhandled_packets.front().cloned(),
            Some(Incoming::ImageData(ImageData(vec![0x00])))
        );

        // set up another response to `get_test_string`
        scanner_to_host_tx
            .send(Ok(Incoming::GetTestStringResponse("test2".to_owned())))
            .unwrap();
        host_to_scanner_ack_tx.send(1).unwrap();

        // make sure the second response came through and didn't discard
        // the image data as a side effect of this request
        assert_eq!(
            timeout(Duration::from_millis(10), client.get_test_string())
                .await
                .unwrap()
                .unwrap(),
            "test2"
        );

        // make sure the image data was not discarded
        assert_eq!(
            client.unhandled_packets.front().cloned(),
            Some(Incoming::ImageData(ImageData(vec![0x00])))
        );

        // make sure we can retreive the image data
        assert_eq!(
            timeout(
                Duration::from_millis(10),
                client.recv_matching(|packet| match packet {
                    Incoming::ImageData(image_data) => Ok(image_data),
                    packet => Err(packet),
                })
            )
            .await
            .unwrap()
            .unwrap(),
            ImageData(vec![0x00])
        );
    }
}
