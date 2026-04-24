use std::{str::from_utf8, time::Duration};

use super::{
    packets::{crc, Incoming, Packet, PACKET_DATA_END, PACKET_DATA_START},
    types::{
        BitonalAdjustment, ClampedPercentage, Direction, Register, RegisterIndex, Resolution, Side,
    },
    Outgoing, Settings, Status, Version,
};
use nom::{
    branch::alt,
    bytes::complete::{tag, take, take_until, take_while_m_n},
    multi::many1,
    number::complete::{le_u16, le_u8},
    sequence::delimited,
    AsChar, IResult, Parser,
};

/// Creates a simple request parser with no payload.
macro_rules! simple_request {
    ($name:ident, $tag:expr, $value:expr) => {
        /// Parses a simple request with no payload.
        ///
        /// # Errors
        ///
        /// Returns an error if the data does not follow the packet format with
        /// the given tag or if the CRC byte is incorrect.
        pub fn $name(input: &[u8]) -> IResult<&[u8], Outgoing> {
            packet_with_crc((tag($tag),)).map(|_| $value).parse(input)
        }
    };
}

/// Creates a simple response parser with no payload.
macro_rules! simple_response {
    ($name:ident, $tag:expr, $value:expr) => {
        /// Parses a simple response with no payload.
        ///
        /// # Errors
        ///
        /// Returns an error if the data does not follow the packet format with
        /// the given tag.
        pub fn $name(input: &[u8]) -> IResult<&[u8], Incoming> {
            packet((tag($tag),)).map(|_| $value).parse(input)
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
        any_outgoing.map(Packet::Outgoing),
        any_incoming.map(Packet::Incoming),
    ))
    .parse(input)
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
        alt((enable_feeder_request, disable_feeder_request)),
        alt((
            turn_array_light_source_on_request,
            turn_array_light_source_off_request,
        )),
        alt((
            eject_document_to_rear_of_scanner_request,
            eject_document_to_front_of_scanner_and_hold_in_input_rollers_request,
            eject_document_to_front_of_scanner_request,
            eject_escrow_document_request,
            rescan_document_held_in_escrow_position_request,
        )),
        alt((
            save_registers_to_flash_request,
            reboot_request,
            get_register_data_request,
            write_data_to_register_request,
        )),
    ))
    .parse(input)
}

/// Parses any request for status information.
///
/// # Errors
///
/// Returns an error if the input does not match any known status request.
fn any_status_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        get_test_string_request,
        get_firmware_version_request,
        get_current_firmware_build_version_string_request,
        get_scanner_status_request,
        get_serial_number_request,
        get_scanner_settings_request,
        get_input_sensors_required_request,
        get_calibration_information_request,
    ))
    .parse(input)
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
        enable_crc_checking_request,
        disable_momentary_reverse_on_feed_at_input_request,
        set_serial_number_request,
        set_input_sensors_required_request,
        set_scanner_image_density_to_half_native_resolution_request,
        set_scanner_image_density_to_native_resolution_request,
        set_scanner_to_duplex_mode_request,
        set_scanner_to_top_only_simplex_mode_request,
        set_scanner_to_bottom_only_simplex_mode_request,
        disable_pick_on_command_mode_request,
        enable_eject_pause_request,
        disable_eject_pause_request,
        transmit_in_low_bits_per_pixel_request,
        disable_auto_run_out_at_end_of_scan_request,
        configure_motor_to_run_at_half_speed_request,
        configure_motor_to_run_at_full_speed_request,
        set_length_of_document_to_scan_request,
        set_scan_delay_interval_for_document_feed_request,
    ))
    .parse(input)
}

/// Parses any requests to adjust the bitonal threshold.
///
/// # Errors
///
/// Returns an error if the input does not match any known bitonal threshold
/// adjustment request.
fn any_threshold_configuration_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    adjust_bitonal_threshold_by_1_request
        .or(set_bitonal_threshold_request)
        .parse(input)
}

/// Parses any requests to configure double feed detection (DFD/MSD).
///
/// # Errors
///
/// Returns an error if the input does not match any known double feed detection
/// configuration request.
fn any_double_feed_detection_configuration_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        enable_double_feed_detection_request,
        disable_double_feed_detection_request,
        get_double_feed_detection_led_intensity_request,
        get_double_feed_detection_single_sheet_calibration_value_request,
        get_double_feed_detection_double_sheet_calibration_value_request,
        get_double_feed_detection_double_sheet_threshold_value_request,
        calibrate_double_feed_detection_request,
        set_double_feed_detection_sensitivity_request,
        set_double_feed_detection_minimum_document_length_request,
    ))
    .parse(input)
}

/// Parses any incoming packet.
///
/// # Errors
///
/// Returns an error if the input does not match any known incoming packet.
pub fn any_incoming(input: &[u8]) -> IResult<&[u8], Incoming> {
    any_event.or(any_response).parse(input)
}

/// Parses any incoming response to a request.
///
/// # Errors
///
/// Returns an error if the input does not match any known response packet.
fn any_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    alt((
        get_test_string_response,
        get_firmware_version_response,
        get_current_firmware_build_version_string_response,
        get_scanner_status_response,
        get_scanner_settings_response,
        get_set_serial_number_response,
        get_set_input_sensors_required_response,
        adjust_bitonal_threshold_response,
        get_calibration_information_response,
        get_double_feed_detection_led_intensity_response,
        get_double_feed_detection_single_sheet_calibration_value_response,
        get_double_feed_detection_double_sheet_calibration_value_response,
        get_double_feed_detection_threshold_value_response,
        read_register_data_response,
        write_register_data_response,
    ))
    .parse(input)
}

/// Parses any event, aka an "unsolicited message".
///
/// # Errors
///
/// Returns an error if the input does not match any known event packet.
#[allow(clippy::too_many_lines)]
fn any_event(input: &[u8]) -> IResult<&[u8], Incoming> {
    alt((
        alt((
            scanner_okay_event,
            document_jam_event,
            calibration_needed_event,
            scanner_command_error_event,
            read_error_event,
            msd_needs_calibration_event,
            msd_not_found_or_old_firmware_event,
            fifo_overflow_event,
            cover_open_event,
            cover_closed_event,
            command_packet_crc_error_event,
        )),
        alt((
            fpga_out_of_date_event,
            calibration_ok_event,
            calibration_short_calibration_document_event,
            calibration_document_removed_event,
            calibration_pixel_error_front_array_black,
            calibration_pixel_error_front_array_white,
            calibration_timeout_error,
            calibration_speed_value_error,
            calibration_speed_box_error,
            image_sensor_calibration_unexpected_output,
            begin_scan_event,
            end_scan_event,
            double_feed_event,
            eject_pause_event,
            eject_resume_event,
        )),
        alt((
            calibration_front_not_enough_light_red_event,
            calibration_front_too_much_light_red_event,
            calibration_front_not_enough_light_blue_event,
            calibration_front_too_much_light_blue_event,
            calibration_front_not_enough_light_green_event,
            calibration_front_too_much_light_green_event,
            calibration_front_pixels_too_high_event,
            calibration_front_pixels_too_low_event,
            calibration_back_not_enough_light_red_event,
            calibration_back_too_much_light_red_event,
            calibration_back_not_enough_light_blue_event,
            calibration_back_too_much_light_blue_event,
            calibration_back_not_enough_light_green_event,
            calibration_back_too_much_light_green_event,
            calibration_back_pixels_too_high_event,
            calibration_back_pixels_too_low_event,
        )),
        alt((cover_open_event_alternate, cover_closed_event_alternate)),
        alt((
            double_feed_calibration_complete_event,
            double_feed_calibration_timed_out_event,
        )),
    ))
    .parse(input)
}

/// Parses the start marker of a packet.
///
/// # Errors
///
/// Returns an error if the input does not start with the packet start marker.
fn packet_start(input: &[u8]) -> IResult<&[u8], &[u8]> {
    tag(PACKET_DATA_START).parse(input)
}

/// Parses until the end marker of a packet.
///
/// # Errors
///
/// Returns an error if the input does not contain the end marker of a packet.
fn packet_body(input: &[u8]) -> IResult<&[u8], &[u8]> {
    take_until(PACKET_DATA_END).parse(input)
}

/// Parses the end marker of a packet.
///
/// # Errors
///
/// Returns an error if the input does not end with the packet end marker.
fn packet_end(input: &[u8]) -> IResult<&[u8], &[u8]> {
    tag(PACKET_DATA_END).parse(input)
}

fn packet<'a, O>(
    list: impl Parser<&'a [u8], Output = O, Error = nom::error::Error<&'a [u8]>>,
) -> impl Parser<&'a [u8], Output = O, Error = nom::error::Error<&'a [u8]>> {
    delimited(packet_start, list, packet_end)
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
fn packet_with_crc<'a, O>(
    list: impl Parser<&'a [u8], Output = O, Error = nom::error::Error<&'a [u8]>>,
) -> impl Parser<&'a [u8], Output = O, Error = nom::error::Error<&'a [u8]>> {
    let mut parse_packet = packet(list);

    move |input: &'a [u8]| {
        let Some(packet_body) = extract_packet_body(&input[..input.len() - 1]) else {
            return Err(nom::Err::Failure(nom::error::Error::new(
                input,
                nom::error::ErrorKind::Eof,
            )));
        };

        let (input, packet) = parse_packet.parse(input)?;
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
    take(1usize)
        .map_res(|bytes: &[u8]| {
            if let [byte, ..] = bytes {
                if byte.is_dec_digit() {
                    return Ok(*byte - b'0');
                }
            }

            Err(nom::error::Error::new(bytes, nom::error::ErrorKind::Digit))
        })
        .parse(input)
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
    many1(decimal_digit)
        .map(|digits| {
            digits
                .iter()
                .fold(0u16, |number, &digit| number * 10 + u16::from(digit))
        })
        .parse(input)
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
    decimal_number
        .map_res(|number| {
            if let Ok(number) = u8::try_from(number) {
                if let Some(percentage) = ClampedPercentage::new(number) {
                    return Ok(percentage);
                }
            }

            Err(nom::error::Error::new(input, nom::error::ErrorKind::Verify))
        })
        .parse(input)
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
    take(1usize)
        .map_res(|bytes: &[u8]| {
            if let [byte, ..] = bytes {
                if byte.is_dec_digit() {
                    Ok(*byte - b'0')
                } else if b'a' <= *byte && *byte <= b'f' {
                    Ok(*byte - b'a' + 10)
                } else if b'A' <= *byte && *byte <= b'F' {
                    Ok(*byte - b'A' + 10)
                } else {
                    Err(nom::error::Error::new(bytes, nom::error::ErrorKind::Digit))
                }
            } else {
                Err(nom::error::Error::new(bytes, nom::error::ErrorKind::Digit))
            }
        })
        .parse(input)
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
    (hex_digit, hex_digit)
        .map(|(hi, lo)| (hi << 4) | lo)
        .parse(input)
}

/// Parses eight bytes of input as a single u32 in hexadecimal notation in big
/// endian order.
///
/// # Example
///
/// ```
/// use pdi_scanner::protocol::parsers::hex_u32_be;
///
/// assert_eq!(hex_u32_be(b"00000000"), Ok((&b""[..], 0)));
/// assert_eq!(hex_u32_be(b"0f000000"), Ok((&b""[..], 0x0f000000)));
/// assert_eq!(hex_u32_be(b"ffffffff"), Ok((&b""[..], 0xffffffff)));
/// ```
///
/// # Errors
///
/// Returns an error if the input does not have 8 hexadecimal characters.
pub fn hex_u32_be(input: &[u8]) -> IResult<&[u8], u32> {
    (hex_byte, hex_byte, hex_byte, hex_byte)
        .map(|(b0, b1, b2, b3)| u32::from_be_bytes([b0, b1, b2, b3]))
        .parse(input)
}

simple_request!(
    enable_crc_checking_request,
    "\x1BK",
    Outgoing::EnableCrcCheckingRequest
);

simple_request!(get_test_string_request, "D", Outgoing::GetTestStringRequest);

/// Parses the response to a test string request. In practice, the test string
/// is always "D Test Message USB 1.1/2.0 Communication".
///
/// # Example
///
/// ```
/// # use pdi_scanner::protocol::packets::Incoming;
/// use pdi_scanner::protocol::parsers::get_test_string_response;
///
/// assert_eq!(get_test_string_response(b"\x02D\x03"), Ok((&b""[..], Incoming::GetTestStringResponse("".to_owned()))));
/// assert_eq!(get_test_string_response(b"\x02DHello, World!\x03"), Ok((&b""[..], Incoming::GetTestStringResponse("Hello, World!".to_owned()))));
/// ```
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_test_string_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((tag("D"), packet_body))
        .map_res(|(_, test_string)| from_utf8(test_string))
        .map(|test_string| Incoming::GetTestStringResponse(test_string.to_owned()))
        .parse(input)
}

simple_request!(
    get_firmware_version_request,
    "V",
    Outgoing::GetFirmwareVersionRequest
);

/// Parses the response to a firmware version request.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_firmware_version_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((
        tag("V"),
        take(4usize).map_res(from_utf8),
        take(2usize).map_res(from_utf8),
        take(2usize).map_res(from_utf8),
        take(1usize).map_res(from_utf8),
    ))
    .map(|(_, product_id, major, minor, cpld_version)| {
        Incoming::GetFirmwareVersionResponse(Version::new(
            product_id.to_owned(),
            major.to_owned(),
            minor.to_owned(),
            cpld_version.to_owned(),
        ))
    })
    .parse(input)
}

simple_request!(
    get_current_firmware_build_version_string_request,
    "\x1bV",
    Outgoing::GetCurrentFirmwareBuildVersionString
);

/// Parses the response to a current firmware build version string request.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_current_firmware_build_version_string_response(
    input: &[u8],
) -> IResult<&[u8], Incoming> {
    if let Ok(([], _)) = packet((
        tag("X"),
        take(3usize),
        tag(" "),
        take(2usize),
        tag(" "),
        take(4usize),
        tag("/"),
        take(2usize),
        tag(":"),
        take(2usize),
        tag(":"),
        take(2usize),
    ))
    .parse(input)
    {
        if let Some(body) = extract_packet_body(input) {
            return from_utf8(&input[b"X".len()..])
                .map(|string| {
                    (
                        &[] as &[u8],
                        Incoming::GetCurrentFirmwareBuildVersionStringResponse(string.to_owned()),
                    )
                })
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

simple_request!(
    get_scanner_status_request,
    "Q",
    Outgoing::GetScannerStatusRequest
);

/// Parses the response to a scanner status request.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_scanner_status_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((tag("Q"), le_u8, le_u8, le_u8))
        .map(|(_, byte0, byte1, byte2)| {
            Incoming::GetScannerStatusResponse(Status::new(
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
            ))
        })
        .parse(input)
}

simple_request!(
    get_scanner_settings_request,
    "I",
    Outgoing::GetScannerSettingsRequest
);

/// Parses the response to a scanner settings request.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_scanner_settings_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((
        tag("I"),
        le_u16,
        le_u16,
        le_u16,
        le_u16,
        le_u16.map_res(TryInto::try_into),
        le_u16.map(Some).or(take(0usize).map(|_| None)),
    ))
    .map(
        |(
            _,
            dpi_setting,
            bits_per_pixel,
            total_array_pixels,
            num_of_arrays,
            calibration_status,
            number_of_calibration_tables,
        )| {
            Incoming::GetScannerSettingsResponse(Settings::new(
                dpi_setting,
                bits_per_pixel,
                total_array_pixels,
                num_of_arrays,
                calibration_status,
                number_of_calibration_tables,
            ))
        },
    )
    .parse(input)
}

simple_request!(
    enable_double_feed_detection_request,
    "n",
    Outgoing::EnableDoubleFeedDetectionRequest
);
simple_request!(
    disable_double_feed_detection_request,
    "o",
    Outgoing::DisableDoubleFeedDetectionRequest
);

/// Parses a request to calibrate the double feed detection.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn calibrate_double_feed_detection_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((tag("n1"), decimal_digit))
        .map_res(|(_, calibration_type)| {
            calibration_type
                .try_into()
                .map(Outgoing::CalibrateDoubleFeedDetectionRequest)
        })
        .parse(input)
}

/// Parses a request to set the double feed detection calibration.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_double_feed_detection_sensitivity_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((tag("n3A"), decimal_percentage))
        .map(|(_, percentage)| Outgoing::SetDoubleFeedDetectionSensitivityRequest { percentage })
        .parse(input)
}

simple_request!(
    get_double_feed_detection_led_intensity_request,
    "n3a30",
    Outgoing::GetDoubleFeedDetectionLedIntensityRequest
);

/// Parses a response to a request to get the double feed detection LED intensity.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_led_intensity_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((tag("n3a30="), decimal_number))
        .map(|(_, intensity)| Incoming::GetDoubleFeedDetectionLedIntensityResponse(intensity))
        .parse(input)
}

simple_request!(
    get_double_feed_detection_single_sheet_calibration_value_request,
    "n3a10",
    Outgoing::GetDoubleFeedDetectionSingleSheetCalibrationValueRequest
);

/// Parses a response to a request to get the double feed detection LED intensity.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_single_sheet_calibration_value_response(
    input: &[u8],
) -> IResult<&[u8], Incoming> {
    packet((tag("n3a10="), decimal_number))
        .map(|(_, value)| {
            Incoming::GetDoubleFeedDetectionSingleSheetCalibrationValueResponse(value)
        })
        .parse(input)
}

simple_request!(
    get_double_feed_detection_double_sheet_calibration_value_request,
    "n3a20",
    Outgoing::GetDoubleFeedDetectionDoubleSheetCalibrationValueRequest
);

/// Parses a response to a request to get the double feed detection double sheet
/// calibration value.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_double_sheet_calibration_value_response(
    input: &[u8],
) -> IResult<&[u8], Incoming> {
    packet((tag("n3a20="), decimal_number))
        .map(|(_, value)| {
            Incoming::GetDoubleFeedDetectionDoubleSheetCalibrationValueResponse(value)
        })
        .parse(input)
}

simple_request!(
    get_double_feed_detection_double_sheet_threshold_value_request,
    "n3a90",
    Outgoing::GetDoubleFeedDetectionDoubleSheetThresholdValueRequest
);

/// Parses a response to a request to get the double feed detection threshold
/// value.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_threshold_value_response(
    input: &[u8],
) -> IResult<&[u8], Incoming> {
    packet((tag("n3a90="), decimal_number))
        .map(|(_, value)| Incoming::GetDoubleFeedDetectionDoubleSheetThresholdValueResponse(value))
        .parse(input)
}

simple_request!(
    get_double_feed_detection_sensors_count_request,
    "n3a40",
    Outgoing::GetDoubleFeedDetectionSensorsCountRequest
);

/// Parses a response to a request to get the double feed detection sensors count.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_double_feed_detection_sensors_count_response(input: &[u8]) -> IResult<&[u8], u8> {
    packet((tag("n3a40="), decimal_digit))
        .map(|(_, count)| count)
        .parse(input)
}

/// Parses a request to set the double feed detection minimum document length.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_double_feed_detection_minimum_document_length_request(
    input: &[u8],
) -> IResult<&[u8], Outgoing> {
    packet_with_crc((
        tag("n3B"),
        decimal_number.map_res(|number| {
            if (10..=250).contains(&number) {
                #[allow(clippy::cast_possible_truncation)]
                Ok(number as u8)
            } else {
                Err(nom::error::Error::new(input, nom::error::ErrorKind::Verify))
            }
        }),
    ))
    .map(|(_, length_in_hundredths_of_an_inch)| {
        Outgoing::SetDoubleFeedDetectionMinimumDocumentLengthRequest {
            length_in_hundredths_of_an_inch,
        }
    })
    .parse(input)
}

simple_request!(enable_feeder_request, "8", Outgoing::EnableFeederRequest);
simple_request!(disable_feeder_request, "9", Outgoing::DisableFeederRequest);
simple_request!(
    disable_momentary_reverse_on_feed_at_input_request,
    "\x1bO",
    Outgoing::DisableMomentaryReverseOnFeedAtInputRequest
);
simple_request!(
    get_serial_number_request,
    "*",
    Outgoing::GetSerialNumberRequest
);

/// Parses a request to set the serial number.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_serial_number_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((tag("*"), take(8usize).map_res(TryInto::try_into)))
        .map(|(_, &serial_number)| Outgoing::SetSerialNumberRequest(serial_number))
        .parse(input)
}

/// Parses a response to a request to get or set the serial number.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_set_serial_number_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((tag("*"), take(8usize)))
        .map_res(|(_, serial_number)| serial_number.try_into())
        .map(Incoming::GetSetSerialNumberResponse)
        .parse(input)
}

simple_request!(
    get_input_sensors_required_request,
    "\x1bs",
    Outgoing::GetRequiredInputSensorsRequest
);

/// Parses a request to set the input sensors required to initiate a scan.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_input_sensors_required_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((tag("\x1bs"), decimal_digit))
        .map(|(_, sensors)| Outgoing::SetRequiredInputSensorsRequest { sensors })
        .parse(input)
}

/// Parses a response to a request to get or set the input sensors required to
/// initiate a scan.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_set_input_sensors_required_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((tag("s"), decimal_digit, decimal_digit))
        .map(|(_, current_sensors_required, total_sensors_available)| {
            Incoming::GetSetRequiredInputSensorsResponse {
                current_sensors_required,
                total_sensors_available,
            }
        })
        .parse(input)
}

/// Parses a request to adjust the bitonal threshold by 1.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn adjust_bitonal_threshold_by_1_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((
        tag("\x1b"),
        alt((
            tag("+").map(|_| (Side::Top, Direction::Increase)),
            tag("-").map(|_| (Side::Top, Direction::Decrease)),
            tag(">").map(|_| (Side::Bottom, Direction::Increase)),
            tag("<").map(|_| (Side::Bottom, Direction::Decrease)),
        )),
    ))
    .map(|(_, (side, direction))| {
        Outgoing::AdjustBitonalThresholdBy1Request(BitonalAdjustment::new(side, direction))
    })
    .parse(input)
}

/// Parses a response to a request to adjust the bitonal threshold by 1.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn adjust_bitonal_threshold_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((
        tag("X"),
        alt((tag("T").map(|_| Side::Top), tag("B").map(|_| Side::Bottom))),
        tag(" "),
        hex_byte,
    ))
    .map(
        |(_, side, _, percent_white_threshold)| Incoming::AdjustBitonalThresholdResponse {
            side,
            percent_white_threshold,
        },
    )
    .parse(input)
}

/// Parses a request to get the calibration information.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_calibration_information_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        packet_with_crc((tag("W"),)).map(|_| None),
        packet_with_crc((tag("W0"),)).map(|_| Some(Resolution::Native)),
        packet_with_crc((tag("W1"),)).map(|_| Some(Resolution::Half)),
    ))
    .map(|resolution| Outgoing::GetCalibrationInformationRequest { resolution })
    .parse(input)
}

/// Parses a response to a request to get the calibration information.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn get_calibration_information_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    let (input, _) = packet_start(input)?;
    let (input, _) = tag("W").parse(input)?;
    let (input, pixel_count) = le_u16(input)?;
    // The first nibble is side (0 for top, 1 for bottom)
    // The second nibble is bits per pixel (e.g. 1 or 8)
    let (input, _side_and_bits_per_pixel_metadata) = take(1usize).parse(input)?;
    let (input, white_calibration_table) = take(pixel_count).parse(input)?;
    let (input, _white_calibration_table_checksum) = le_u16(input)?;
    let (input, black_calibration_table) = take(pixel_count).parse(input)?;
    let (input, _black_calibration_table_checksum) = le_u16(input)?;
    let (input, _) = packet_end(input)?;

    Ok((
        input,
        Incoming::GetCalibrationInformationResponse {
            white_calibration_table: white_calibration_table.to_vec(),
            black_calibration_table: black_calibration_table.to_vec(),
        },
    ))
}

simple_request!(
    set_scanner_image_density_to_half_native_resolution_request,
    "A",
    Outgoing::SetScannerImageDensityToHalfNativeResolutionRequest
);
simple_request!(
    set_scanner_image_density_to_medium_resolution_request,
    "@",
    Outgoing::SetScannerImageDensityToMediumResolutionRequest
);
simple_request!(
    set_scanner_image_density_to_native_resolution_request,
    "B",
    Outgoing::SetScannerImageDensityToNativeResolutionRequest
);
simple_request!(
    set_scanner_to_top_only_simplex_mode_request,
    "G",
    Outgoing::SetScannerToTopOnlySimplexModeRequest
);
simple_request!(
    set_scanner_to_bottom_only_simplex_mode_request,
    "H",
    Outgoing::SetScannerToBottomOnlySimplexModeRequest
);
simple_request!(
    set_scanner_to_duplex_mode_request,
    "J",
    Outgoing::SetScannerToDuplexModeRequest
);
simple_request!(
    enable_pick_on_command_mode_request,
    "\x1bX",
    Outgoing::EnablePickOnCommandModeRequest
);
simple_request!(
    disable_pick_on_command_mode_request,
    "\x1bY",
    Outgoing::DisablePickOnCommandModeRequest
);
simple_request!(
    enable_eject_pause_request,
    "M",
    Outgoing::EnableEjectPauseRequest
);
simple_request!(
    disable_eject_pause_request,
    "N",
    Outgoing::DisableEjectPauseRequest
);
simple_request!(
    transmit_in_native_bits_per_pixel_request,
    "y",
    Outgoing::TransmitInNativeBitsPerPixelRequest
);
simple_request!(
    transmit_in_low_bits_per_pixel_request,
    "z",
    Outgoing::TransmitInLowBitsPerPixelRequest
);
simple_request!(
    enable_auto_run_out_at_end_of_scan_request,
    "\x1be",
    Outgoing::EnableAutoRunOutAtEndOfScanRequest
);
simple_request!(
    disable_auto_run_out_at_end_of_scan_request,
    "\x1bd",
    Outgoing::DisableAutoRunOutAtEndOfScanRequest
);
simple_request!(
    configure_motor_to_run_at_half_speed_request,
    "j",
    Outgoing::ConfigureMotorToRunAtHalfSpeedRequest
);
simple_request!(
    configure_motor_to_run_at_full_speed_request,
    "k",
    Outgoing::ConfigureMotorToRunAtFullSpeedRequest
);
simple_request!(
    calibrate_image_sensors_request,
    "C",
    Outgoing::CalibrateImageSensorsRequest
);

/// Parses a request to set the bitonal threshold to a new value.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_bitonal_threshold_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((
        tag("\x1b%"),
        le_u8.map_res(TryInto::try_into),
        le_u8.map_res(TryInto::try_into),
    ))
    .map(
        |(_, side, new_threshold)| Outgoing::SetThresholdToANewValueRequest {
            side,
            new_threshold,
        },
    )
    .parse(input)
}

/// Parses a request to set the length of the document to scan.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_length_of_document_to_scan_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((
        tag("\x1bD"),
        le_u8,
        take_while_m_n(0, 1, |byte| byte != PACKET_DATA_END[0]).map(|bytes: &[u8]| match bytes {
            [unit_byte] => Some(*unit_byte),
            [] => None,
            _ => unreachable!(),
        }),
    ))
    .map(
        |(_, length_byte, unit_byte)| Outgoing::SetLengthOfDocumentToScanRequest {
            length_byte,
            unit_byte,
        },
    )
    .parse(input)
}

/// Parses a request to set the scan delay interval for document feed.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format.
pub fn set_scan_delay_interval_for_document_feed_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((tag("\x1bj"), le_u8))
        .map_res(|(_, delay_interval)| {
            if !(0x20..=0xe8).contains(&delay_interval) {
                return Err(nom::error::Error::new(input, nom::error::ErrorKind::Verify));
            }

            let delay_interval = delay_interval - 0x20;
            Ok(Outgoing::SetScanDelayIntervalForDocumentFeedRequest {
                delay_interval: Duration::from_millis(16) * delay_interval.into(),
            })
        })
        .parse(input)
}

simple_request!(
    eject_document_to_front_of_scanner_and_hold_in_input_rollers_request,
    "1",
    Outgoing::EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest
);
simple_request!(
    eject_document_to_rear_of_scanner_request,
    "3",
    Outgoing::EjectDocumentToRearOfScannerRequest
);
simple_request!(
    eject_document_to_front_of_scanner_request,
    "4",
    Outgoing::EjectDocumentToFrontOfScannerRequest
);
simple_request!(
    turn_array_light_source_on_request,
    "5",
    Outgoing::TurnArrayLightSourceOnRequest
);
simple_request!(
    turn_array_light_source_off_request,
    "6",
    Outgoing::TurnArrayLightSourceOffRequest
);
simple_request!(
    eject_escrow_document_request,
    "7",
    Outgoing::EjectEscrowDocumentRequest
);
simple_request!(
    rescan_document_held_in_escrow_position_request,
    "[",
    Outgoing::RescanDocumentHeldInEscrowPositionRequest
);

fn register_index(input: &[u8]) -> IResult<&[u8], RegisterIndex> {
    (hex_digit, hex_byte)
        .map_res(|(r0, r1_and_2)| match (r0, RegisterIndex::new(r1_and_2)) {
            (0, Some(index)) => Ok(index),
            _ => Err(nom::error::Error::new(input, nom::error::ErrorKind::Verify)),
        })
        .parse(input)
}

simple_request!(
    save_registers_to_flash_request,
    "}",
    Outgoing::SaveRegistersToFlashRequest
);
simple_request!(reboot_request, "0", Outgoing::RebootRequest);

/// Parses a request to get the data in the register with the given index.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format or the register
/// value is out of bounds.
pub fn get_register_data_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((tag("<"), register_index))
        .map(|(_, index)| Outgoing::ReadRegisterDataRequest(index))
        .parse(input)
}

/// Parses a response to a request for register data by index.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format or the
/// register value is out of bounds.
pub fn read_register_data_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((tag("<"), register_index, hex_u32_be))
        .map(|(_, index, value)| Incoming::ReadRegisterDataResponse(Register::new(index, value)))
        .parse(input)
}

/// Parses a response to a request to write register data by index.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format or the
/// register value is out of bounds.
pub fn write_register_data_response(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((tag(">"), register_index, hex_u32_be))
        .map(|(_, index, value)| Incoming::WriteRegisterDataResponse(Register::new(index, value)))
        .parse(input)
}

/// Parses a request to write data to a register at a given index.
///
/// # Errors
///
/// Returns an error if the input does not match the expected format or the
/// register value is out of bounds.
pub fn write_data_to_register_request(input: &[u8]) -> IResult<&[u8], Outgoing> {
    packet_with_crc((tag(">"), register_index, hex_u32_be))
        .map(|(_, index, value)| Outgoing::WriteRegisterDataRequest(index, value))
        .parse(input)
}

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

simple_response!(scanner_okay_event, "#00", Incoming::ScannerOkayEvent);
simple_response!(document_jam_event, "#01", Incoming::DocumentJamEvent);
simple_response!(
    calibration_needed_event,
    "#02",
    Incoming::CalibrationNeededEvent
);
simple_response!(
    scanner_command_error_event,
    "#05",
    Incoming::ScannerCommandErrorEvent
);
simple_response!(read_error_event, "#06", Incoming::ReadErrorEvent);
simple_response!(
    msd_needs_calibration_event,
    "#07",
    Incoming::MsdNeedsCalibrationEvent
);
simple_response!(
    msd_not_found_or_old_firmware_event,
    "#08",
    Incoming::MsdNotFoundOrOldFirmwareEvent
);
simple_response!(fifo_overflow_event, "#09", Incoming::FifoOverflowEvent);
simple_response!(cover_open_event, "#0C", Incoming::CoverOpenEvent);
simple_response!(cover_closed_event, "#0D", Incoming::CoverClosedEvent);
simple_response!(
    command_packet_crc_error_event,
    "#0E",
    Incoming::CommandPacketCrcErrorEvent
);
simple_response!(fpga_out_of_date_event, "#0F", Incoming::FpgaOutOfDateEvent);
simple_response!(calibration_ok_event, "#10", Incoming::CalibrationOkEvent);
simple_response!(
    calibration_short_calibration_document_event,
    "#11",
    Incoming::CalibrationShortCalibrationDocumentEvent
);
simple_response!(
    calibration_document_removed_event,
    "#12",
    Incoming::CalibrationDocumentRemovedEvent
);
simple_response!(
    calibration_pixel_error_front_array_black,
    "#13",
    Incoming::CalibrationPixelErrorFrontArrayBlack
);
simple_response!(
    calibration_pixel_error_front_array_white,
    "#19",
    Incoming::CalibrationPixelErrorFrontArrayWhite
);
simple_response!(
    calibration_timeout_error,
    "#1A",
    Incoming::CalibrationTimeoutError
);
simple_response!(
    calibration_speed_value_error,
    "#1B",
    Incoming::CalibrationSpeedValueError
);
simple_response!(
    calibration_speed_box_error,
    "#1C",
    Incoming::CalibrationSpeedBoxError
);
simple_response!(begin_scan_event, "#30", Incoming::BeginScanEvent);
simple_response!(end_scan_event, "#31", Incoming::EndScanEvent);
simple_response!(double_feed_event, "#33", Incoming::DoubleFeedEvent);
simple_response!(eject_pause_event, "#36", Incoming::EjectPauseEvent);
simple_response!(eject_resume_event, "#37", Incoming::EjectResumeEvent);
simple_response!(
    calibration_pixel_error_back_array_black_event,
    "#51",
    Incoming::CalibrationPixelErrorFrontArrayBlack
);
simple_response!(
    calibration_pixel_error_back_array_white_event,
    "#53",
    Incoming::CalibrationPixelErrorFrontArrayWhite
);
simple_response!(
    calibration_short_document_back_array_event,
    "#54",
    Incoming::CalibrationShortDocumentBackArrayEvent
);
simple_response!(
    calibration_front_not_enough_light_red_event,
    "#71",
    Incoming::CalibrationFrontNotEnoughLightRedEvent
);
simple_response!(
    calibration_front_too_much_light_red_event,
    "#72",
    Incoming::CalibrationFrontTooMuchLightRedEvent
);
simple_response!(
    calibration_front_not_enough_light_blue_event,
    "#73",
    Incoming::CalibrationFrontNotEnoughLightBlueEvent
);
simple_response!(
    calibration_front_too_much_light_blue_event,
    "#74",
    Incoming::CalibrationFrontTooMuchLightBlueEvent
);
simple_response!(
    calibration_front_not_enough_light_green_event,
    "#75",
    Incoming::CalibrationFrontNotEnoughLightGreenEvent
);
simple_response!(
    calibration_front_too_much_light_green_event,
    "#76",
    Incoming::CalibrationFrontTooMuchLightGreenEvent
);
simple_response!(
    calibration_front_pixels_too_high_event,
    "#77",
    Incoming::CalibrationFrontPixelsTooHighEvent
);
simple_response!(
    calibration_front_pixels_too_low_event,
    "#78",
    Incoming::CalibrationFrontPixelsTooLowEvent
);
simple_response!(
    calibration_back_not_enough_light_red_event,
    "#81",
    Incoming::CalibrationBackNotEnoughLightRedEvent
);
simple_response!(
    calibration_back_too_much_light_red_event,
    "#82",
    Incoming::CalibrationBackTooMuchLightRedEvent
);
simple_response!(
    calibration_back_not_enough_light_blue_event,
    "#83",
    Incoming::CalibrationBackNotEnoughLightBlueEvent
);
simple_response!(
    calibration_back_too_much_light_blue_event,
    "#84",
    Incoming::CalibrationBackTooMuchLightBlueEvent
);
simple_response!(
    calibration_back_not_enough_light_green_event,
    "#85",
    Incoming::CalibrationBackNotEnoughLightGreenEvent
);
simple_response!(
    calibration_back_too_much_light_green_event,
    "#86",
    Incoming::CalibrationBackTooMuchLightGreenEvent
);
simple_response!(
    calibration_back_pixels_too_high_event,
    "#87",
    Incoming::CalibrationBackPixelsTooHighEvent
);
simple_response!(
    calibration_back_pixels_too_low_event,
    "#88",
    Incoming::CalibrationBackPixelsTooLowEvent
);

// undocumented DFD-related events
simple_response!(
    double_feed_calibration_complete_event,
    "#90",
    Incoming::DoubleFeedCalibrationCompleteEvent
);
simple_response!(
    double_feed_calibration_timed_out_event,
    "#9A",
    Incoming::DoubleFeedCalibrationTimedOutEvent
);

// Some responses don't match the documentation. These are what we've seen in practice.
simple_response!(cover_open_event_alternate, "#34", Incoming::CoverOpenEvent);
simple_response!(
    cover_closed_event_alternate,
    "#35",
    Incoming::CoverClosedEvent
);

/// Parses an "unexpected" response to a request to perform image sensor calibration.
///
/// # Errors
///
/// Fails if the input is not the looked-for response.
pub fn image_sensor_calibration_unexpected_output(input: &[u8]) -> IResult<&[u8], Incoming> {
    packet((tag("#L0"), packet_body))
        .map_res(|(_, test_string)| from_utf8(test_string))
        .map(|message| Incoming::ImageSensorCalibrationUnexpectedOutput(message.to_owned()))
        .parse(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_enable_crc_checking_request() {
        let input = b"\x02\x1bK\x03\x1b";
        assert_eq!(
            enable_crc_checking_request(input),
            Ok((&b""[..], Outgoing::EnableCrcCheckingRequest))
        );
    }

    #[test]
    fn test_parse_get_test_string_request() {
        let input = b"\x02D\x03\xb4";
        assert_eq!(
            get_test_string_request(input),
            Ok((&b""[..], Outgoing::GetTestStringRequest))
        );
    }

    #[test]
    fn test_packet_with_crc() {
        let input = b"\x02D\x03\xb4";
        let (remainder, (tag,)) = packet_with_crc((tag("D"),)).parse(input).unwrap();
        assert_eq!(remainder, b"");
        assert_eq!(tag, b"D");
    }

    #[test]
    fn test_packet_with_crc_mismatch() {
        let input = b"\x02D\x03\xb5";
        packet_with_crc((tag("D"),)).parse(input).unwrap_err();
    }

    #[test]
    fn test_simple_request() {
        simple_request!(simple, "X", Outgoing::GetTestStringRequest);

        simple(b"\x02X\x03\xb6").expect("valid request data");
        simple(b"\x02X\x03\xb5").expect_err("CRC mismatch");
        simple(b"\x02D\x03\xb4").expect_err("tag mismatch");
    }
}
