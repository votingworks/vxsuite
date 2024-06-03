use std::{str::from_utf8, time::Duration};

use nom::{
    branch::alt,
    bytes::complete::{tag, take, take_until, take_while_m_n},
    character::is_digit,
    combinator::{map, map_res, value},
    multi::many1,
    number::complete::{le_u16, le_u8},
    sequence::{delimited, tuple, Tuple},
    IResult,
};

use super::{
    packets::{crc, Incoming, Packet, PACKET_DATA_END, PACKET_DATA_START},
    types::{
        BitonalAdjustment, ClampedPercentage, Direction, DoubleFeedDetectionCalibrationType,
        Resolution, Side,
    },
    Outgoing, Settings, Status, Version,
};

/// Creates a simple request parser with no payload.
macro_rules! simple_request {
    ($name:ident, $tag:expr) => {
        /// Parses a simple request with no payload.
        ///
        /// # Errors
        ///
        /// Returns an error if the data does not follow the packet format with
        /// the given tag or if the CRC byte is incorrect.
        pub fn $name(input: &[u8]) -> IResult<&[u8], ()> {
            map(packet_with_crc((tag($tag),)), |_| ())(input)
        }
    };
}

/// Creates a simple response parser with no payload.
macro_rules! simple_response {
    ($name:ident, $tag:expr) => {
        /// Parses a simple response with no payload.
        ///
        /// # Errors
        ///
        /// Returns an error if the data does not follow the packet format with
        /// the given tag.
        pub fn $name(input: &[u8]) -> IResult<&[u8], ()> {
            value((), packet((tag($tag),)))(input)
        }
    };
}

/// Parses any packet.
///
/// # Errors
///
/// Returns an error if the input does not match any known packet.
pub fn any_packet(input: &[u8]) -> IResult<&[u8], Packet> {
    alt((
        map(any_outgoing, Packet::Outgoing),
        map(any_incoming, Packet::Incoming),
    ))(input)
}

/// Parses any outgoing packet.
///
/// # Errors
///
/// Returns an error if the input does not match any known outgoing packet.
pub fn any_outgoing(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        any_status_request,
        any_configuration_request,
        alt((
            value(Outgoing::EnableFeederRequest, enable_feeder_request),
            value(Outgoing::DisableFeederRequest, disable_feeder_request),
        )),
        alt((
            value(
                Outgoing::TurnArrayLightSourceOnRequest,
                turn_array_light_source_on_request,
            ),
            value(
                Outgoing::TurnArrayLightSourceOffRequest,
                turn_array_light_source_off_request,
            ),
        )),
        alt((
            value(
                Outgoing::EjectDocumentToRearOfScannerRequest,
                eject_document_to_rear_of_scanner_request,
            ),
            value(
                Outgoing::EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest,
                eject_document_to_front_of_scanner_and_hold_in_input_rollers_request,
            ),
            value(
                Outgoing::EjectDocumentToFrontOfScannerRequest,
                eject_document_to_front_of_scanner_request,
            ),
            value(
                Outgoing::EjectEscrowDocumentRequest,
                eject_escrow_document_request,
            ),
            value(
                Outgoing::RescanDocumentHeldInEscrowPositionRequest,
                rescan_document_held_in_escrow_position_request,
            ),
        )),
    ))(input)
}

/// Parses any request for status information.
///
/// # Errors
///
/// Returns an error if the input does not match any known status request.
fn any_status_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        value(Outgoing::GetTestStringRequest, get_test_string_request),
        value(
            Outgoing::GetFirmwareVersionRequest,
            get_firmware_version_request,
        ),
        value(
            Outgoing::GetCurrentFirmwareBuildVersionString,
            get_current_firmware_build_version_string_request,
        ),
        value(
            Outgoing::GetScannerStatusRequest,
            get_scanner_status_request,
        ),
        value(Outgoing::GetSerialNumberRequest, get_serial_number_request),
        value(
            Outgoing::GetScannerSettingsRequest,
            get_scanner_settings_request,
        ),
        value(
            Outgoing::GetRequiredInputSensorsRequest,
            get_input_sensors_required_request,
        ),
        map(get_calibration_information_request, |resolution| {
            Outgoing::GetCalibrationInformationRequest { resolution }
        }),
    ))(input)
}

/// Parses any request to configure the scanner.
///
/// # Errors
///
/// Returns an error if the input does not match any known configuration request.
fn any_configuration_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        any_double_feed_detection_configuration_request,
        any_threshold_configuration_request,
        value(
            Outgoing::DisableMomentaryReverseOnFeedAtInputRequest,
            disable_momentary_reverse_on_feed_at_input_request,
        ),
        map(set_serial_number_request, |serial_number| {
            Outgoing::SetSerialNumberRequest(*serial_number)
        }),
        map(set_input_sensors_required_request, |sensors| {
            Outgoing::SetRequiredInputSensorsRequest { sensors }
        }),
        value(
            Outgoing::SetScannerImageDensityToHalfNativeResolutionRequest,
            set_scanner_image_density_to_half_native_resolution_request,
        ),
        value(
            Outgoing::SetScannerImageDensityToNativeResolutionRequest,
            set_scanner_image_density_to_native_resolution_request,
        ),
        value(
            Outgoing::SetScannerToDuplexModeRequest,
            set_scanner_to_duplex_mode_request,
        ),
        value(
            Outgoing::SetScannerToTopOnlySimplexModeRequest,
            set_scanner_to_top_only_simplex_mode_request,
        ),
        value(
            Outgoing::SetScannerToBottomOnlySimplexModeRequest,
            set_scanner_to_bottom_only_simplex_mode_request,
        ),
        value(
            Outgoing::DisablePickOnCommandModeRequest,
            disable_pick_on_command_mode_request,
        ),
        value(
            Outgoing::DisableEjectPauseRequest,
            disable_eject_pause_request,
        ),
        value(
            Outgoing::TransmitInLowBitsPerPixelRequest,
            transmit_in_low_bits_per_pixel_request,
        ),
        value(
            Outgoing::DisableAutoRunOutAtEndOfScanRequest,
            disable_auto_run_out_at_end_of_scan_request,
        ),
        value(
            Outgoing::ConfigureMotorToRunAtHalfSpeedRequest,
            configure_motor_to_run_at_half_speed_request,
        ),
        value(
            Outgoing::ConfigureMotorToRunAtFullSpeedRequest,
            configure_motor_to_run_at_full_speed_request,
        ),
        map(
            set_length_of_document_to_scan_request,
            |(length_byte, unit_byte)| Outgoing::SetLengthOfDocumentToScanRequest {
                length_byte,
                unit_byte,
            },
        ),
        map(
            set_scan_delay_interval_for_document_feed_request,
            |delay_interval| Outgoing::SetScanDelayIntervalForDocumentFeedRequest {
                delay_interval,
            },
        ),
    ))(input)
}

/// Parses any requests to adjust the bitonal threshold.
///
/// # Errors
///
/// Returns an error if the input does not match any known bitonal threshold
/// adjustment request.
fn any_threshold_configuration_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        map(adjust_bitonal_threshold_by_1_request, |adjustment| {
            Outgoing::AdjustBitonalThresholdBy1Request(adjustment)
        }),
        map(set_bitonal_threshold_request, |(side, new_threshold)| {
            Outgoing::SetThresholdToANewValueRequest {
                side,
                new_threshold,
            }
        }),
    ))(input)
}

/// Parses any requests to configure double feed detection (DFD/MSD).
///
/// # Errors
///
/// Returns an error if the input does not match any known double feed detection
/// configuration request.
fn any_double_feed_detection_configuration_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        value(
            Outgoing::EnableDoubleFeedDetectionRequest,
            enable_double_feed_detection_request,
        ),
        value(
            Outgoing::DisableDoubleFeedDetectionRequest,
            disable_double_feed_detection_request,
        ),
        value(
            Outgoing::GetDoubleFeedDetectionLedIntensityRequest,
            get_double_feed_detection_led_intensity_request,
        ),
        value(
            Outgoing::GetDoubleFeedDetectionSingleSheetCalibrationValueRequest,
            get_double_feed_detection_single_sheet_calibration_value_request,
        ),
        value(
            Outgoing::GetDoubleFeedDetectionDoubleSheetCalibrationValueRequest,
            get_double_feed_detection_double_sheet_calibration_value_request,
        ),
        value(
            Outgoing::GetDoubleFeedDetectionDoubleSheetThresholdValueRequest,
            get_double_feed_detection_double_sheet_threshold_value_request,
        ),
        map(
            calibrate_double_feed_detection_request,
            Outgoing::CalibrateDoubleFeedDetectionRequest,
        ),
        map(
            set_double_feed_detection_sensitivity_request,
            |percentage| Outgoing::SetDoubleFeedDetectionSensitivityRequest { percentage },
        ),
        map(
            set_double_feed_detection_minimum_document_length_request,
            |length_in_hundredths_of_an_inch| {
                Outgoing::SetDoubleFeedDetectionMinimumDocumentLengthRequest {
                    length_in_hundredths_of_an_inch,
                }
            },
        ),
    ))(input)
}

/// Parses any incoming packet.
///
/// # Errors
///
/// Returns an error if the input does not match any known incoming packet.
pub fn any_incoming(input: &[u8]) -> IResult<&[u8], Incoming> {
    alt((any_event, any_response))(input)
}

/// Parses any incoming response to a request.
///
/// # Errors
///
/// Returns an error if the input does not match any known response packet.
fn any_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    alt((
        map(get_test_string_response, |test_string| {
            Incoming::GetTestStringResponse(test_string.to_owned())
        }),
        map(
            get_firmware_version_response,
            Incoming::GetFirmwareVersionResponse,
        ),
        map(
            get_current_firmware_build_version_string_response,
            |version| Incoming::GetCurrentFirmwareBuildVersionStringResponse(version.to_owned()),
        ),
        map(
            get_scanner_status_response,
            Incoming::GetScannerStatusResponse,
        ),
        map(
            get_scanner_settings_response,
            Incoming::GetScannerSettingsResponse,
        ),
        map(
            get_set_serial_number_response,
            Incoming::GetSetSerialNumberResponse,
        ),
        map(
            get_set_input_sensors_required_response,
            |(current_sensors_required, total_sensors_available)| {
                Incoming::GetSetRequiredInputSensorsResponse {
                    current_sensors_required,
                    total_sensors_available,
                }
            },
        ),
        map(
            adjust_bitonal_threshold_response,
            |(side, percent_white_threshold)| Incoming::AdjustBitonalThresholdResponse {
                side,
                percent_white_threshold,
            },
        ),
        map(
            get_calibration_information_response,
            |(white_calibration_table, black_calibration_table)| {
                Incoming::GetCalibrationInformationResponse {
                    white_calibration_table,
                    black_calibration_table,
                }
            },
        ),
        map(
            get_double_feed_detection_led_intensity_response,
            Incoming::GetDoubleFeedDetectionLedIntensityResponse,
        ),
        map(
            get_double_feed_detection_single_sheet_calibration_value_response,
            Incoming::GetDoubleFeedDetectionSingleSheetCalibrationValueResponse,
        ),
        map(
            get_double_feed_detection_double_sheet_calibration_value_response,
            Incoming::GetDoubleFeedDetectionDoubleSheetCalibrationValueResponse,
        ),
        map(
            get_double_feed_detection_threshold_value_response,
            Incoming::GetDoubleFeedDetectionDoubleSheetThresholdValueResponse,
        ),
    ))(input)
}

/// Parses any event, aka an "unsolicited message".
///
/// # Errors
///
/// Returns an error if the input does not match any known event packet.
fn any_event(input: &[u8]) -> IResult<&[u8], Incoming> {
    alt((
        alt((
            value(Incoming::ScannerOkayEvent, scanner_okay_event),
            value(Incoming::DocumentJamEvent, document_jam_event),
            value(Incoming::CalibrationNeededEvent, calibration_needed_event),
            value(
                Incoming::ScannerCommandErrorEvent,
                scanner_command_error_event,
            ),
            value(Incoming::ReadErrorEvent, read_error_event),
            value(
                Incoming::MsdNeedsCalibrationEvent,
                msd_needs_calibration_event,
            ),
            value(
                Incoming::MsdNotFoundOrOldFirmwareEvent,
                msd_not_found_or_old_firmware_event,
            ),
            value(Incoming::FifoOverflowEvent, fifo_overflow_event),
            value(Incoming::CoverOpenEvent, cover_open_event),
            value(Incoming::CoverClosedEvent, cover_closed_event),
            value(
                Incoming::CommandPacketCrcErrorEvent,
                command_packet_crc_error_event,
            ),
        )),
        alt((
            value(Incoming::FpgaOutOfDateEvent, fpga_out_of_date_event),
            value(Incoming::CalibrationOkEvent, calibration_ok_event),
            value(
                Incoming::CalibrationShortCalibrationDocumentEvent,
                calibration_short_calibration_document_event,
            ),
            value(
                Incoming::CalibrationDocumentRemovedEvent,
                calibration_document_removed_event,
            ),
            value(
                Incoming::CalibrationPixelErrorFrontArrayBlack,
                calibration_pixel_error_front_array_black,
            ),
            value(
                Incoming::CalibrationPixelErrorFrontArrayWhite,
                calibration_pixel_error_front_array_white,
            ),
            value(Incoming::CalibrationTimeoutError, calibration_timeout_error),
            value(
                Incoming::CalibrationSpeedValueError,
                calibration_speed_value_error,
            ),
            value(
                Incoming::CalibrationSpeedBoxError,
                calibration_speed_box_error,
            ),
            value(Incoming::BeginScanEvent, begin_scan_event),
            value(Incoming::EndScanEvent, end_scan_event),
            value(Incoming::DoubleFeedEvent, double_feed_event),
            value(Incoming::EjectPauseEvent, eject_pause_event),
            value(Incoming::EjectResumeEvent, eject_resume_event),
        )),
        alt((
            value(Incoming::CoverOpenEvent, cover_open_event_alternate),
            value(Incoming::CoverClosedEvent, cover_closed_event_alternate),
        )),
        alt((
            value(
                Incoming::DoubleFeedCalibrationCompleteEvent,
                double_feed_calibration_complete_event,
            ),
            value(
                Incoming::DoubleFeedCalibrationTimedOutEvent,
                double_feed_calibration_timed_out_event,
            ),
        )),
    ))(input)
}

/// Parses the start marker of a packet.
///
/// # Errors
///
/// Returns an error if the input does not start with the packet start marker.
fn packet_start(input: &[u8]) -> IResult<&[u8], &[u8]> {
    tag(PACKET_DATA_START)(input)
}

/// Parses until the end marker of a packet.
///
/// # Errors
///
/// Returns an error if the input does not contain the end marker of a packet.
fn packet_body(input: &[u8]) -> IResult<&[u8], &[u8]> {
    take_until(PACKET_DATA_END)(input)
}

/// Parses the end marker of a packet.
///
/// # Errors
///
/// Returns an error if the input does not end with the packet end marker.
fn packet_end(input: &[u8]) -> IResult<&[u8], &[u8]> {
    tag(PACKET_DATA_END)(input)
}

fn packet<'a, O, List: Tuple<&'a [u8], O, nom::error::Error<&'a [u8]>>>(
    mut list: List,
) -> impl FnMut(&'a [u8]) -> IResult<&'a [u8], O> {
    move |input: &[u8]| delimited(packet_start, |input| list.parse(input), packet_end)(input)
}

/// Extracts the body of a packet, i.e. the data between the start and end
/// markers. Assumes that there is no CRC byte at the end.
fn extract_packet_body(input: &[u8]) -> Option<&[u8]> {
    if input.len() >= PACKET_DATA_START.len() + PACKET_DATA_END.len() {
        let start = PACKET_DATA_START.len();
        let end = input.len() - PACKET_DATA_END.len();
        Some(&input[start..end])
    } else {
        None
    }
}

/// Parses a packet with a CRC byte at the end.
///
/// ```plaintext
/// <STX>...<ETX><CRC>
/// ```
fn packet_with_crc<'a, O, List: Tuple<&'a [u8], O, nom::error::Error<&'a [u8]>>>(
    list: List,
) -> impl FnMut(&'a [u8]) -> IResult<&'a [u8], O> {
    let mut parse_packet = packet(list);

    move |input: &[u8]| {
        let Some(packet_body) = extract_packet_body(&input[..input.len() - 1]) else {
            return Err(nom::Err::Failure(nom::error::Error::new(
                input,
                nom::error::ErrorKind::Eof,
            )));
        };

        let (input, packet) = parse_packet(input)?;
        let (input, actual_crc) = le_u8(input)?;
        if actual_crc == crc(packet_body) {
            Ok((input, packet))
        } else {
            Err(nom::Err::Failure(nom::error::Error::new(
                input,
                nom::error::ErrorKind::Verify,
            )))
        }
    }
}

/// Parses a single decimal digit.
///
/// # Example
///
/// ```
/// use pdi_scanner::protocol::parsers::decimal_digit;
///
/// assert_eq!(decimal_digit(b"0"), Ok((&b""[..], 0)));
/// assert_eq!(decimal_digit(b"9"), Ok((&b""[..], 9)));
/// ```
///
/// # Errors
///
/// Returns an error if the input does not start with a decimal digit.
pub fn decimal_digit(input: &[u8]) -> IResult<&[u8], u8> {
    map_res(take(1usize), |bytes: &[u8]| {
        if let [byte, ..] = bytes {
            if is_digit(*byte) {
                return Ok(*byte - b'0');
            }
        }

        Err(nom::Err::Failure(nom::error::Error::new(
            bytes,
            nom::error::ErrorKind::Digit,
        )))
    })(input)
}

/// Parses a sequence of decimal digits as a single number.
///
/// # Example
///
/// ```
/// use pdi_scanner::protocol::parsers::decimal_number;
///
/// assert_eq!(decimal_number(b"0"), Ok((&b""[..], 0)));
/// assert_eq!(decimal_number(b"123"), Ok((&b""[..], 123)));
/// ```
///
/// # Errors
///
/// Returns an error if the input does not start with a decimal digit.
pub fn decimal_number(input: &[u8]) -> IResult<&[u8], u16> {
    let (input, digits) = many1(decimal_digit)(input)?;

    let mut number = 0;
    for digit in digits {
        number = number * 10 + u16::from(digit);
    }

    Ok((input, number))
}

/// Parses a sequence of decimal digits as a single number, and verifies that
/// the number is less than or equal to 100.
///
/// # Example
///
/// ```
/// use pdi_scanner::protocol::parsers::decimal_percentage;
/// use pdi_scanner::protocol::types::ClampedPercentage;
///
/// assert_eq!(decimal_percentage(b"0"), Ok((&b""[..], ClampedPercentage::new(0).unwrap())));
/// assert_eq!(decimal_percentage(b"100"), Ok((&b""[..], ClampedPercentage::new(100).unwrap())));
/// assert_eq!(decimal_percentage(b"101"), Err(nom::Err::Error(nom::error::Error::new(
///    &b"101"[..],
///   nom::error::ErrorKind::MapRes,
/// ))));
/// ```
///
/// # Errors
///
/// Returns an error if the input does not start with a decimal digit, or if the
/// number is an invalid percentage.
pub fn decimal_percentage(input: &[u8]) -> IResult<&[u8], ClampedPercentage> {
    map_res(decimal_number, |number| {
        if let Ok(number) = u8::try_from(number) {
            if let Some(percentage) = ClampedPercentage::new(number) {
                return Ok(percentage);
            }
        }

        Err(nom::Err::Failure(nom::error::Error::new(
            input,
            nom::error::ErrorKind::Verify,
        )))
    })(input)
}

/// Parses a single byte of input as a single digit in hexadecimal notation.
///
/// # Example
///
/// ```
/// use pdi_scanner::protocol::parsers::hex_digit;
///
/// assert_eq!(hex_digit(b"0"), Ok((&b""[..], 0)));
/// assert_eq!(hex_digit(b"f"), Ok((&b""[..], 15)));
/// assert_eq!(hex_digit(b"F"), Ok((&b""[..], 15)));
/// ```
///
/// # Errors
///
/// Returns an error if the input does not start with a hexadecimal digit.
pub fn hex_digit(input: &[u8]) -> IResult<&[u8], u8> {
    map_res(take(1usize), |bytes: &[u8]| {
        if let [byte, ..] = bytes {
            if is_digit(*byte) {
                Ok(*byte - b'0')
            } else if b'a' <= *byte && *byte <= b'f' {
                Ok(*byte - b'a' + 10)
            } else if b'A' <= *byte && *byte <= b'F' {
                Ok(*byte - b'A' + 10)
            } else {
                Err(nom::Err::Failure(nom::error::Error::new(
                    bytes,
                    nom::error::ErrorKind::Digit,
                )))
            }
        } else {
            Err(nom::Err::Failure(nom::error::Error::new(
                bytes,
                nom::error::ErrorKind::Digit,
            )))
        }
    })(input)
}

/// Parses two bytes of input as a single byte in hexadecimal notation.
///
/// # Example
///
/// ```
/// use pdi_scanner::protocol::parsers::hex_byte;
///
/// assert_eq!(hex_byte(b"00"), Ok((&b""[..], 0)));
/// assert_eq!(hex_byte(b"0f"), Ok((&b""[..], 15)));
/// assert_eq!(hex_byte(b"ff"), Ok((&b""[..], 255)));
/// ```
///
/// # Errors
///
/// Returns an error if the input does not start with two hexadecimal digits.
pub fn hex_byte(input: &[u8]) -> IResult<&[u8], u8> {
    map(tuple((hex_digit, hex_digit)), |(hi, lo)| (hi << 4) | lo)(input)
}

simple_request!(get_test_string_request, b"D");

/// Parses the response to a test string request. In practice, the test string
/// is always "D Test Message USB 1.1/2.0 Communication".
///
/// # Example
///
/// ```
/// use pdi_scanner::protocol::parsers::get_test_string_response;
///
/// assert_eq!(get_test_string_response(b"\x02D\x03"), Ok((&b""[..], "")));
/// assert_eq!(get_test_string_response(b"\x02DHello, World!\x03"), Ok((&b""[..], "Hello, World!")));
/// ```
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_test_string_response(input: &[u8]) -> IResult<&[u8], &str> {
    map_res(packet((tag(b"D"), packet_body)), |(_, test_string)| {
        from_utf8(test_string)
    })(input)
}

simple_request!(get_firmware_version_request, b"V");

/// Parses the response to a firmware version request.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_firmware_version_response(input: &[u8]) -> IResult<&[u8], Version> {
    map(
        packet((
            tag(b"V"),
            map_res(take(4usize), |bytes| from_utf8(bytes)),
            map_res(take(2usize), |bytes| from_utf8(bytes)),
            map_res(take(2usize), |bytes| from_utf8(bytes)),
            map_res(take(1usize), |bytes| from_utf8(bytes)),
        )),
        |(_, product_id, major, minor, cpld_version)| {
            Version::new(
                product_id.to_owned(),
                major.to_owned(),
                minor.to_owned(),
                cpld_version.to_owned(),
            )
        },
    )(input)
}

simple_request!(get_current_firmware_build_version_string_request, b"\x1bV");

/// Parses the response to a current firmware build version string request.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_current_firmware_build_version_string_response(input: &[u8]) -> IResult<&[u8], &str> {
    if let Ok(([], _)) = packet((
        tag(b"X"),
        take(3usize),
        tag(b" "),
        take(2usize),
        tag(b" "),
        take(4usize),
        tag(b"/"),
        take(2usize),
        tag(b":"),
        take(2usize),
        tag(b":"),
        take(2usize),
    ))(input)
    {
        if let Some(body) = extract_packet_body(input) {
            return from_utf8(&input[b"X".len()..])
                .map(|string| (&[] as &[u8], string))
                .map_err(|_| {
                    nom::Err::Failure(nom::error::Error::new(body, nom::error::ErrorKind::Verify))
                });
        }
    }

    Err(nom::Err::Error(nom::error::Error::new(
        input,
        nom::error::ErrorKind::Eof,
    )))
}

simple_request!(get_scanner_status_request, b"Q");

/// Parses the response to a scanner status request.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_scanner_status_response(input: &[u8]) -> IResult<&[u8], Status> {
    map(
        packet((tag(b"Q"), le_u8, le_u8, le_u8)),
        |(_, byte0, byte1, byte2)| {
            Status::new(
                byte0 & 0b0000_0001 != 0,
                byte0 & 0b0000_0010 != 0,
                byte0 & 0b0000_0100 != 0,
                byte0 & 0b0000_1000 != 0,
                byte0 & 0b0001_0000 != 0,
                // 0b0010_0000 is reserved for future use
                byte0 & 0b0100_0000 != 0,
                byte1 & 0b0000_0001 != 0,
                byte1 & 0b0000_0010 != 0,
                byte1 & 0b0000_0100 != 0,
                byte1 & 0b0000_1000 != 0,
                byte1 & 0b0001_0000 != 0,
                byte1 & 0b0010_0000 != 0,
                byte1 & 0b0100_0000 != 0,
                byte2 & 0b0000_0001 != 0,
                byte2 & 0b0000_0010 != 0,
                byte2 & 0b0000_0100 != 0,
                byte2 & 0b0000_1000 != 0,
                byte2 & 0b0001_0000 != 0,
                byte2 & 0b0010_0000 != 0,
                byte2 & 0b0100_0000 != 0,
            )
        },
    )(input)
}

simple_request!(get_scanner_settings_request, b"I");

/// Parses the response to a scanner settings request.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_scanner_settings_response(input: &[u8]) -> IResult<&[u8], Settings> {
    map(
        packet((
            tag(b"I"),
            le_u16,
            le_u16,
            le_u16,
            le_u16,
            map_res(le_u16, TryInto::try_into),
            alt((map(le_u16, Some), map(take(0usize), |_| None))),
        )),
        |(
            _,
            dpi_setting,
            bits_per_pixel,
            total_array_pixels,
            num_of_arrays,
            calibration_status,
            number_of_calibration_tables,
        )| {
            Settings::new(
                dpi_setting,
                bits_per_pixel,
                total_array_pixels,
                num_of_arrays,
                calibration_status,
                number_of_calibration_tables,
            )
        },
    )(input)
}

simple_request!(enable_double_feed_detection_request, b"n");
simple_request!(disable_double_feed_detection_request, b"o");

/// Parses a request to calibrate the double feed detection.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn calibrate_double_feed_detection_request(
    input: &[u8],
) -> IResult<&[u8], DoubleFeedDetectionCalibrationType> {
    map_res(
        packet_with_crc((tag(b"n1"), decimal_digit)),
        |(_, calibration_type)| calibration_type.try_into(),
    )(input)
}

/// Parses a request to set the double feed detection calibration.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_double_feed_detection_sensitivity_request(
    input: &[u8],
) -> IResult<&[u8], ClampedPercentage> {
    map(
        packet_with_crc((tag(b"n3A"), decimal_percentage)),
        |(_, sensitivity)| sensitivity,
    )(input)
}

simple_request!(get_double_feed_detection_led_intensity_request, b"n3a30");

/// Parses a response to a request to get the double feed detection LED intensity.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_led_intensity_response(input: &[u8]) -> IResult<&[u8], u16> {
    map(
        packet((tag(b"n3a30="), decimal_number)),
        |(_, intensity)| intensity,
    )(input)
}

simple_request!(
    get_double_feed_detection_single_sheet_calibration_value_request,
    b"n3a10"
);

/// Parses a response to a request to get the double feed detection LED intensity.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_single_sheet_calibration_value_response(
    input: &[u8],
) -> IResult<&[u8], u16> {
    map(packet((tag(b"n3a10="), decimal_number)), |(_, value)| value)(input)
}

simple_request!(
    get_double_feed_detection_double_sheet_calibration_value_request,
    b"n3a20"
);

/// Parses a response to a request to get the double feed detection double sheet
/// calibration value.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_double_sheet_calibration_value_response(
    input: &[u8],
) -> IResult<&[u8], u16> {
    map(packet((tag(b"n3a20="), decimal_number)), |(_, value)| value)(input)
}

simple_request!(
    get_double_feed_detection_double_sheet_threshold_value_request,
    b"n3a90"
);

/// Parses a response to a request to get the double feed detection threshold
/// value.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_threshold_value_response(input: &[u8]) -> IResult<&[u8], u16> {
    map(packet((tag(b"n3a90="), decimal_number)), |(_, value)| value)(input)
}

simple_request!(get_double_feed_detection_sensors_count_request, b"n3a40");

/// Parses a response to a request to get the double feed detection sensors count.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_sensors_count_response(input: &[u8]) -> IResult<&[u8], u8> {
    map(packet((tag(b"n3a40="), decimal_digit)), |(_, count)| count)(input)
}

/// Parses a request to set the double feed detection minimum document length.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_double_feed_detection_minimum_document_length_request(
    input: &[u8],
) -> IResult<&[u8], u8> {
    map(
        packet_with_crc((
            tag(b"n3B"),
            map_res(decimal_number, |number| {
                if (10..=250).contains(&number) {
                    Ok(number as u8)
                } else {
                    Err(nom::Err::Failure(nom::error::Error::new(
                        input,
                        nom::error::ErrorKind::Verify,
                    )))
                }
            }),
        )),
        |(_, length_in_hundredths_of_an_inch)| length_in_hundredths_of_an_inch,
    )(input)
}

simple_request!(reset_request, b"0");
simple_request!(enable_feeder_request, b"8");
simple_request!(disable_feeder_request, b"9");
simple_request!(disable_momentary_reverse_on_feed_at_input_request, b"\x1bO");
simple_request!(get_serial_number_request, b"*");

/// Parses a request to set the serial number.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_serial_number_request(input: &[u8]) -> IResult<&[u8], &[u8; 8]> {
    map(
        packet_with_crc((tag(b"*"), map_res(take(8usize), TryInto::try_into))),
        |(_, serial_number)| serial_number,
    )(input)
}

/// Parses a response to a request to get or set the serial number.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_set_serial_number_response(input: &[u8]) -> IResult<&[u8], [u8; 8]> {
    map_res(packet((tag(b"*"), take(8usize))), |(_, serial_number)| {
        serial_number.try_into()
    })(input)
}

simple_request!(get_input_sensors_required_request, b"\x1bs");

/// Parses a request to set the input sensors required to initiate a scan.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_input_sensors_required_request(input: &[u8]) -> IResult<&[u8], u8> {
    map(
        packet_with_crc((tag(b"\x1bs"), decimal_digit)),
        |(_, sensors)| sensors,
    )(input)
}

/// Parses a response to a request to get or set the input sensors required to
/// initiate a scan.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_set_input_sensors_required_response(input: &[u8]) -> IResult<&[u8], (u8, u8)> {
    map(
        packet((tag(b"s"), decimal_digit, decimal_digit)),
        |(_, current, total)| (current, total),
    )(input)
}

/// Parses a request to adjust the bitonal threshold by 1.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn adjust_bitonal_threshold_by_1_request(input: &[u8]) -> IResult<&[u8], BitonalAdjustment> {
    map(
        packet_with_crc((
            tag(b"\x1b"),
            alt((
                value((Side::Top, Direction::Increase), tag(b"+")),
                value((Side::Top, Direction::Decrease), tag(b"-")),
                value((Side::Bottom, Direction::Increase), tag(b">")),
                value((Side::Bottom, Direction::Decrease), tag(b"<")),
            )),
        )),
        |(_, (side, direction))| BitonalAdjustment::new(side, direction),
    )(input)
}

/// Parses a response to a request to adjust the bitonal threshold by 1.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn adjust_bitonal_threshold_response(input: &[u8]) -> IResult<&[u8], (Side, u8)> {
    map(
        packet((
            tag(b"X"),
            alt((value(Side::Top, tag(b"T")), value(Side::Bottom, tag(b"B")))),
            tag(b" "),
            hex_byte,
        )),
        |(_, side, _, percent_white_threshold)| (side, percent_white_threshold),
    )(input)
}

/// Parses a request to get the calibration information.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_calibration_information_request(input: &[u8]) -> IResult<&[u8], Option<Resolution>> {
    alt((
        value(None, packet_with_crc((tag(b"W"),))),
        value(Some(Resolution::Native), packet_with_crc((tag(b"W0"),))),
        value(Some(Resolution::Half), packet_with_crc((tag(b"W1"),))),
    ))(input)
}

/// Parses a response to a request to get the calibration information.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_calibration_information_response(input: &[u8]) -> IResult<&[u8], (Vec<u8>, Vec<u8>)> {
    // TODO: This implementation corresponds to the documentation, but it doesn't
    // seem to match the actual behavior of the scanner. The scanner seems to
    // return an extra byte at the end of the packet, which is not accounted for
    // here.
    let (input, _) = packet_start(input)?;
    let (input, _) = tag(b"W")(input)?;
    let (input, pixel_count) = le_u16(input)?;
    let (input, white_calibration_table) = take(pixel_count)(input)?;
    let (input, _white_calibration_table_checksum) = le_u16(input)?;
    // dbg!(
    //     white_calibration_table.len(),
    //     // white_calibration_table,
    //     white_calibration_table_checksum
    // );
    let (input, black_calibration_table) = take(pixel_count)(input)?;
    let (input, _black_calibration_table_checksum) = le_u16(input)?;
    // dbg!(
    //     black_calibration_table.len(),
    //     // black_calibration_table,
    //     black_calibration_table_checksum,
    //     input
    // );
    let (input, _) = packet_end(input)?;

    Ok((
        input,
        (
            white_calibration_table.to_vec(),
            black_calibration_table.to_vec(),
        ),
    ))
}

simple_request!(
    set_scanner_image_density_to_half_native_resolution_request,
    b"A"
);
simple_request!(set_scanner_image_density_to_medium_resolution_request, b"@");
simple_request!(set_scanner_image_density_to_native_resolution_request, b"B");
simple_request!(set_scanner_to_top_only_simplex_mode_request, b"G");
simple_request!(set_scanner_to_bottom_only_simplex_mode_request, b"H");
simple_request!(set_scanner_to_duplex_mode_request, b"J");
simple_request!(enable_pick_on_command_mode_request, b"\x1bX");
simple_request!(disable_pick_on_command_mode_request, b"\x1bY");
simple_request!(enable_eject_pause_request, b"M");
simple_request!(disable_eject_pause_request, b"N");
simple_request!(transmit_in_native_bits_per_pixel_request, b"y");
simple_request!(transmit_in_low_bits_per_pixel_request, b"z");
simple_request!(enable_auto_run_out_at_end_of_scan_request, b"\x1be");
simple_request!(disable_auto_run_out_at_end_of_scan_request, b"\x1bd");
simple_request!(configure_motor_to_run_at_half_speed_request, b"j");
simple_request!(configure_motor_to_run_at_full_speed_request, b"k");

/// Parses a request to set the bitonal threshold to a new value.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_bitonal_threshold_request(input: &[u8]) -> IResult<&[u8], (Side, ClampedPercentage)> {
    map(
        packet_with_crc((
            tag(b"\x1b%"),
            map_res(le_u8, TryInto::try_into),
            map_res(le_u8, TryInto::try_into),
        )),
        |(_, side, new_threshold)| (side, new_threshold),
    )(input)
}

/// Parses a request to set the length of the document to scan.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_length_of_document_to_scan_request(input: &[u8]) -> IResult<&[u8], (u8, Option<u8>)> {
    map(
        packet_with_crc((
            tag(b"\x1bD"),
            le_u8,
            map(
                take_while_m_n(0, 1, |byte| byte != PACKET_DATA_END[0]),
                |bytes: &[u8]| match bytes {
                    [unit_byte] => Some(*unit_byte),
                    [] => None,
                    _ => unreachable!(),
                },
            ),
        )),
        |(_, length_byte, unit_byte)| (length_byte, unit_byte),
    )(input)
}

/// Parses a request to set the scan delay interval for document feed.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_scan_delay_interval_for_document_feed_request(input: &[u8]) -> IResult<&[u8], Duration> {
    map_res(
        packet_with_crc((tag(b"\x1bj"), le_u8)),
        |(_, delay_interval)| {
            if !(0x20..=0xe8).contains(&delay_interval) {
                return Err(nom::Err::Failure(nom::error::Error::new(
                    input,
                    nom::error::ErrorKind::Verify,
                )));
            }

            let delay_interval = delay_interval - 0x20;
            Ok(Duration::from_millis(16) * delay_interval.into())
        },
    )(input)
}

simple_request!(
    eject_document_to_front_of_scanner_and_hold_in_input_rollers_request,
    b"1"
);
simple_request!(eject_document_to_rear_of_scanner_request, b"3");
simple_request!(eject_document_to_front_of_scanner_request, b"4");
simple_request!(turn_array_light_source_on_request, b"5");
simple_request!(turn_array_light_source_off_request, b"6");
simple_request!(eject_escrow_document_request, b"7");
simple_request!(rescan_document_held_in_escrow_position_request, b"[");

/// Parses any outgoing message of one byte or more.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn raw_outgoing(input: &[u8]) -> IResult<&[u8], Outgoing> {
    if input.is_empty() {
        Err(nom::Err::Error(nom::error::Error::new(
            input,
            nom::error::ErrorKind::Eof,
        )))
    } else {
        Ok((&input[0..0], Outgoing::RawPacket(input.to_vec())))
    }
}

//// Unsolicited Messages ///

simple_response!(scanner_okay_event, b"#00");
simple_response!(document_jam_event, b"#01");
simple_response!(calibration_needed_event, b"#02");
simple_response!(scanner_command_error_event, b"#05");
simple_response!(read_error_event, b"#06");
simple_response!(msd_needs_calibration_event, b"#07");
simple_response!(msd_not_found_or_old_firmware_event, b"#08");
simple_response!(fifo_overflow_event, b"#09");
simple_response!(cover_open_event, b"#0C");
simple_response!(cover_closed_event, b"#0D");
simple_response!(command_packet_crc_error_event, b"#0E");
simple_response!(fpga_out_of_date_event, b"#0F");
simple_response!(calibration_ok_event, b"#10");
simple_response!(calibration_short_calibration_document_event, b"#11");
simple_response!(calibration_document_removed_event, b"#12");
simple_response!(calibration_pixel_error_front_array_black, b"#13");
simple_response!(calibration_pixel_error_front_array_white, b"#19");
simple_response!(calibration_timeout_error, b"#1A");
simple_response!(calibration_speed_value_error, b"#1B");
simple_response!(calibration_speed_box_error, b"#1C");
simple_response!(begin_scan_event, b"#30");
simple_response!(end_scan_event, b"#31");
simple_response!(double_feed_event, b"#33");
simple_response!(eject_pause_event, b"#36");
simple_response!(eject_resume_event, b"#37");

// undocumented DFD-related events
simple_response!(double_feed_calibration_complete_event, b"#90");
simple_response!(double_feed_calibration_timed_out_event, b"#9A");

// Some responses don't match the documentation. These are what we've seen in practice.
simple_response!(cover_open_event_alternate, b"#34");
simple_response!(cover_closed_event_alternate, b"#35");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_get_test_string_request() {
        let input = b"\x02D\x03\xb4";
        assert_eq!(get_test_string_request(input), Ok((&b""[..], ())));
    }

    #[test]
    fn test_packet_with_crc() {
        let input = b"\x02D\x03\xb4";
        let (remainder, (tag,)) = packet_with_crc((tag(b"D"),))(input).unwrap();
        assert_eq!(remainder, []);
        assert_eq!(tag, b"D");
    }

    #[test]
    fn test_packet_with_crc_mismatch() {
        let input = b"\x02D\x03\xb5";
        packet_with_crc((tag(b"D"),))(input).unwrap_err();
    }

    #[test]
    fn test_simple_request() {
        simple_request!(simple, b"X");

        simple(b"\x02X\x03\xb6").expect("valid request data");
        simple(b"\x02X\x03\xb5").expect_err("CRC mismatch");
        simple(b"\x02D\x03\xb4").expect_err("tag mismatch");
    }
}
