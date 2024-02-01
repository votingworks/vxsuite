use std::{str::from_utf8, time::Duration};

use nom::{
    branch::alt,
    bytes::complete::{tag, take, take_until, take_while_m_n},
    character::is_digit,
    combinator::{map, map_res},
    number::complete::{le_u16, le_u8},
    sequence::{delimited, tuple, Tuple},
    IResult,
};

use super::{
    packets::{crc, Incoming, Packet, PACKET_DATA_END, PACKET_DATA_START},
    types::{ResolutionTableType, Side},
    Outgoing, Settings, Status, Version,
};

macro_rules! simple_request {
    ($name:ident, $tag:expr) => {
        pub fn $name(input: &[u8]) -> IResult<&[u8], ()> {
            map(packet_with_crc((tag($tag),)), |_| ())(input)
        }
    };
}

pub fn any_packet(input: &[u8]) -> IResult<&[u8], Packet> {
    alt((
        map(any_outgoing, Packet::Outgoing),
        map(any_incoming, Packet::Incoming),
    ))(input)
}

pub fn any_outgoing(input: &[u8]) -> IResult<&[u8], Outgoing> {
    alt((
        alt((
            map(get_test_string_request, |_| Outgoing::GetTestStringRequest),
            map(get_firmware_version_request, |_| {
                Outgoing::GetFirmwareVersionRequest
            }),
            map(get_current_firmware_build_version_string_request, |_| {
                Outgoing::GetCurrentFirmwareBuildVersionString
            }),
            map(get_scanner_status_request, |_| {
                Outgoing::GetScannerStatusRequest
            }),
            map(enable_feeder_request, |_| Outgoing::EnableFeederRequest),
            map(disable_feeder_request, |_| Outgoing::DisableFeederRequest),
            map(disable_momentary_reverse_on_feed_at_input_request, |_| {
                Outgoing::DisableMomentaryReverseOnFeedAtInputRequest
            }),
            map(get_serial_number_request, |_| {
                Outgoing::GetSerialNumberRequest
            }),
            map(set_serial_number_request, |serial_number| {
                Outgoing::SetSerialNumberRequest(*serial_number)
            }),
            map(get_scanner_settings_request, |_| {
                Outgoing::GetScannerSettingsRequest
            }),
            map(get_input_sensors_required_request, |_| {
                Outgoing::GetRequiredInputSensorsRequest
            }),
            map(set_input_sensors_required_request, |sensors| {
                Outgoing::SetRequiredInputSensorsRequest { sensors }
            }),
            map(increase_top_cis_threshold_by_1_request, |_| {
                Outgoing::IncreaseTopCISSensorThresholdBy1Request
            }),
            map(decrease_top_cis_threshold_by_1_request, |_| {
                Outgoing::DecreaseTopCISSensorThresholdBy1Request
            }),
            map(increase_bottom_cis_threshold_by_1_request, |_| {
                Outgoing::IncreaseBottomCISSensorThresholdBy1Request
            }),
            map(decrease_bottom_cis_threshold_by_1_request, |_| {
                Outgoing::DecreaseBottomCISSensorThresholdBy1Request
            }),
            map(
                get_calibration_information_request,
                |resolution_table_type| Outgoing::GetCalibrationInformationRequest {
                    resolution_table_type,
                },
            ),
        )),
        alt((
            map(
                set_scanner_image_density_to_half_native_resolution_request,
                |_| Outgoing::SetScannerImageDensityToHalfNativeResolutionRequest,
            ),
            map(
                set_scanner_image_density_to_native_resolution_request,
                |_| Outgoing::SetScannerImageDensityToNativeResolutionRequest,
            ),
            map(set_scanner_to_duplex_mode_request, |_| {
                Outgoing::SetScannerToDuplexModeRequest
            }),
            map(disable_pick_on_command_mode_request, |_| {
                Outgoing::DisablePickOnCommandModeRequest
            }),
            map(disable_eject_pause_request, |_| {
                Outgoing::DisableEjectPauseRequest
            }),
            map(transmit_in_low_bits_per_pixel_request, |_| {
                Outgoing::TransmitInLowBitsPerPixelRequest
            }),
            map(disable_auto_run_out_at_end_of_scan_request, |_| {
                Outgoing::DisableAutoRunOutAtEndOfScanRequest
            }),
            map(configure_motor_to_run_at_half_speed_request, |_| {
                Outgoing::ConfigureMotorToRunAtHalfSpeedRequest
            }),
            map(configure_motor_to_run_at_full_speed_request, |_| {
                Outgoing::ConfigureMotorToRunAtFullSpeedRequest
            }),
            map(
                set_threshold_to_a_new_value_request,
                |(side, new_threshold)| Outgoing::SetThresholdToANewValueRequest {
                    side,
                    new_threshold,
                },
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
            map(eject_document_to_rear_of_scanner_request, |_| {
                Outgoing::EjectDocumentToRearOfScannerRequest
            }),
            map(
                eject_document_to_front_of_scanner_and_hold_in_input_rollers_request,
                |_| Outgoing::EjectDocumentToFrontOfScannerAndHoldInInputRollersRequest,
            ),
            map(eject_document_to_front_of_scanner_request, |_| {
                Outgoing::EjectDocumentToFrontOfScannerRequest
            }),
            map(eject_escrow_document_request, |_| {
                Outgoing::EjectEscrowDocumentRequest
            }),
            map(rescan_document_held_in_escrow_position_request, |_| {
                Outgoing::RescanDocumentHeldInEscrowPositionRequest
            }),
        )),
    ))(input)
}

pub fn any_incoming(input: &[u8]) -> IResult<&[u8], Incoming> {
    alt((
        map(get_test_string_response, |test_string| {
            Incoming::GetTestStringResponse(test_string.to_owned())
        }),
        map(get_firmware_version_response, |version| {
            Incoming::GetFirmwareVersionResponse(version)
        }),
        map(
            get_current_firmware_build_version_string_response,
            |version| Incoming::GetCurrentFirmwareBuildVersionStringResponse(version.to_owned()),
        ),
        map(get_scanner_status_response, |status| {
            Incoming::GetScannerStatusResponse(status)
        }),
        map(get_scanner_settings_response, |settings| {
            Incoming::GetScannerSettingsResponse(settings)
        }),
        map(get_set_serial_number_response, |serial_number| {
            Incoming::GetSetSerialNumberResponse(serial_number)
        }),
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
            adjust_top_bitonal_threshold_response,
            |percent_white_threshold| Incoming::AdjustTopCISSensorThresholdResponse {
                percent_white_threshold,
            },
        ),
        map(
            adjust_bottom_bitonal_threshold_response,
            |percent_white_threshold| Incoming::AdjustBottomCISSensorThresholdResponse {
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
        map(begin_scan_event, |_| Incoming::BeginScanEvent),
        map(end_scan_event, |_| Incoming::EndScanEvent),
        map(double_feed_event, |_| Incoming::DoubleFeedEvent),
    ))(input)
}

fn packet_start(input: &[u8]) -> IResult<&[u8], &[u8]> {
    tag(PACKET_DATA_START)(input)
}

fn packet_body(input: &[u8]) -> IResult<&[u8], &[u8]> {
    take_until(PACKET_DATA_END)(input)
}

fn packet_end(input: &[u8]) -> IResult<&[u8], &[u8]> {
    tag(PACKET_DATA_END)(input)
}

fn packet<'a, O, List: Tuple<&'a [u8], O, nom::error::Error<&'a [u8]>>>(
    mut list: List,
) -> impl FnMut(&'a [u8]) -> IResult<&'a [u8], O> {
    move |input: &[u8]| delimited(packet_start, |input| list.parse(input), packet_end)(input)
}

fn extract_packet_body(input: &[u8]) -> Option<&[u8]> {
    if input.len() >= PACKET_DATA_START.len() + PACKET_DATA_END.len() {
        let start = PACKET_DATA_START.len();
        let end = input.len() - PACKET_DATA_END.len();
        Some(&input[start..end])
    } else {
        None
    }
}

fn packet_with_crc<'a, O, List: Tuple<&'a [u8], O, nom::error::Error<&'a [u8]>>>(
    list: List,
) -> impl FnMut(&'a [u8]) -> IResult<&'a [u8], O> {
    let mut parse_packet = packet(list);

    move |input: &[u8]| {
        let packet_body = match extract_packet_body(&input[..input.len() - 1]) {
            Some(body) => body,
            None => {
                return Err(nom::Err::Failure(nom::error::Error::new(
                    input,
                    nom::error::ErrorKind::Eof,
                )))
            }
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

fn decimal_digit(input: &[u8]) -> IResult<&[u8], u8> {
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

fn hex_digit(input: &[u8]) -> IResult<&[u8], u8> {
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

fn hex_byte(input: &[u8]) -> IResult<&[u8], u8> {
    map(tuple((hex_digit, hex_digit)), |(hi, lo)| (hi << 4) | lo)(input)
}

simple_request!(get_test_string_request, b"D");

pub fn get_test_string_response(input: &[u8]) -> IResult<&[u8], &str> {
    map_res(packet((tag(b"D"), packet_body)), |(_, test_string)| {
        from_utf8(test_string)
    })(input)
}

simple_request!(get_firmware_version_request, b"V");

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
            return match from_utf8(&input[b"X".len()..]) {
                Ok(string) => Ok((&[], string)),
                Err(_) => Err(nom::Err::Failure(nom::error::Error::new(
                    body,
                    nom::error::ErrorKind::Verify,
                ))),
            };
        }
    }

    Err(nom::Err::Error(nom::error::Error::new(
        input,
        nom::error::ErrorKind::Eof,
    )))
}

simple_request!(get_scanner_status_request, b"Q");

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

simple_request!(enable_feeder_request, b"8");
simple_request!(disable_feeder_request, b"9");
simple_request!(disable_momentary_reverse_on_feed_at_input_request, b"\x1bO");
simple_request!(get_serial_number_request, b"*");

pub fn set_serial_number_request(input: &[u8]) -> IResult<&[u8], &[u8; 8]> {
    map(
        packet_with_crc((tag(b"*"), map_res(take(8usize), TryInto::try_into))),
        |(_, serial_number)| serial_number,
    )(input)
}

pub fn get_set_serial_number_response(input: &[u8]) -> IResult<&[u8], [u8; 8]> {
    map_res(packet((tag(b"*"), take(8usize))), |(_, serial_number)| {
        serial_number.try_into()
    })(input)
}

simple_request!(get_scanner_settings_request, b"I");
simple_request!(get_input_sensors_required_request, b"\x1bs");

pub fn set_input_sensors_required_request(input: &[u8]) -> IResult<&[u8], u8> {
    map(
        packet_with_crc((tag(b"\x1bs"), decimal_digit)),
        |(_, sensors)| sensors,
    )(input)
}

pub fn get_set_input_sensors_required_response(input: &[u8]) -> IResult<&[u8], (u8, u8)> {
    map(
        packet((tag(b"s"), decimal_digit, decimal_digit)),
        |(_, current, total)| (current, total),
    )(input)
}

simple_request!(increase_top_cis_threshold_by_1_request, b"\x1b+");
simple_request!(decrease_top_cis_threshold_by_1_request, b"\x1b-");
simple_request!(increase_bottom_cis_threshold_by_1_request, b"\x1b>");
simple_request!(decrease_bottom_cis_threshold_by_1_request, b"\x1b<");

pub fn adjust_top_bitonal_threshold_response(input: &[u8]) -> IResult<&[u8], u8> {
    map(
        packet((tag(b"XT "), hex_byte)),
        |(_, percent_white_threshold)| percent_white_threshold,
    )(input)
}

pub fn adjust_bottom_bitonal_threshold_response(input: &[u8]) -> IResult<&[u8], u8> {
    map(
        packet((tag(b"XB "), hex_byte)),
        |(_, percent_white_threshold)| percent_white_threshold,
    )(input)
}

pub fn get_calibration_information_request(input: &[u8]) -> IResult<&[u8], ResolutionTableType> {
    alt((
        map(packet_with_crc((tag(b"W"),)), |_| {
            ResolutionTableType::Default
        }),
        map(packet_with_crc((tag(b"W0"),)), |_| {
            ResolutionTableType::Native
        }),
        map(packet_with_crc((tag(b"W1"),)), |_| {
            ResolutionTableType::Half
        }),
    ))(input)
}

pub fn get_calibration_information_response(input: &[u8]) -> IResult<&[u8], (Vec<u8>, Vec<u8>)> {
    let (input, _) = packet_start(input)?;
    let (input, _) = tag(b"W")(input)?;
    let (input, pixel_count) = le_u16(input)?;
    let (input, white_calibration_table) = take(pixel_count)(input)?;
    let (input, white_calibration_table_checksum) = le_u16(input)?;
    dbg!(
        white_calibration_table.len(),
        // white_calibration_table,
        white_calibration_table_checksum
    );
    let (input, black_calibration_table) = take(pixel_count)(input)?;
    let (input, black_calibration_table_checksum) = le_u16(input)?;
    dbg!(
        black_calibration_table.len(),
        // black_calibration_table,
        black_calibration_table_checksum,
        input
    );
    let (input, _) = packet_end(input)?;

    dbg!(
        "HI THERE",
        white_calibration_table_checksum,
        black_calibration_table_checksum,
    );
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
simple_request!(set_scanner_image_density_to_native_resolution_request, b"B");
simple_request!(set_scanner_to_duplex_mode_request, b"J");
simple_request!(disable_pick_on_command_mode_request, b"\x1bY");
simple_request!(disable_eject_pause_request, b"N");
simple_request!(transmit_in_low_bits_per_pixel_request, b"z");
simple_request!(disable_auto_run_out_at_end_of_scan_request, b"\x1bd");
simple_request!(configure_motor_to_run_at_half_speed_request, b"j");
simple_request!(configure_motor_to_run_at_full_speed_request, b"k");

pub fn set_threshold_to_a_new_value_request(input: &[u8]) -> IResult<&[u8], (Side, u8)> {
    map(
        packet_with_crc((tag(b"\x1b%"), map_res(le_u8, TryInto::try_into), le_u8)),
        |(_, side, new_threshold)| (side, new_threshold),
    )(input)
}

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

simple_request!(begin_scan_event, b"#30");
simple_request!(end_scan_event, b"#31");
simple_request!(double_feed_event, b"#33");
simple_request!(
    eject_document_to_front_of_scanner_and_hold_in_input_rollers_request,
    b"1"
);
simple_request!(eject_document_to_rear_of_scanner_request, b"3");
simple_request!(eject_document_to_front_of_scanner_request, b"4");
simple_request!(eject_escrow_document_request, b"7");
simple_request!(rescan_document_held_in_escrow_position_request, b"[");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_get_test_string_request() {
        let input = b"\x02D\x03\xb4";
        assert_eq!(get_test_string_request(input), Ok((&b""[..], ())));
    }
}
