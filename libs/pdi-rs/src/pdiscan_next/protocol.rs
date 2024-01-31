use std::time::Duration;

const PACKET_DATA_START: &'static [u8] = &[0x02];
const PACKET_DATA_END: &'static [u8] = &[0x03];

#[derive(Debug)]
pub enum ResolutionTableType {
    Default,
    Native,
    Half,
}

impl TryFrom<u8> for ResolutionTableType {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::Native),
            1 => Ok(Self::Half),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum Side {
    Top,
    Bottom,
}

impl From<Side> for u8 {
    fn from(side: Side) -> Self {
        match side {
            Side::Top => b'T',
            Side::Bottom => b'B',
        }
    }
}

impl TryFrom<u8> for Side {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            b'T' => Ok(Self::Top),
            b'B' => Ok(Self::Bottom),
            _ => Err(()),
        }
    }
}

#[derive(Debug)]
pub enum Outgoing {
    GetTestStringRequest,
    GetFirmwareVersionRequest,
    GetScannerStatusRequest,
    EnableFeederRequest,

    /// This command sets a duplex scanner to scan only the backside (bottom) of the document.
    ///
    /// `ASCII character H = (48H)`
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

    GetSerialNumberRequest,
    SetSerialNumberRequest([u8; 8]),

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

    IncreaseTopCISSensorThresholdBy1Request,
    DecreaseTopCISSensorThresholdBy1Request,
    IncreaseBottomCISSensorThresholdBy1Request,
    DecreaseBottomCISSensorThresholdBy1Request,

    GetCalibrationInformationRequest {
        resolution_table_type: ResolutionTableType,
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

    SetScannerToDuplexModeRequest,
    DisablePickOnCommandModeRequest,
    DisableEjectPauseRequest,
    TransmitInLowBitsPerPixelRequest,
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
        new_threshold: u8,
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

    /// This command causes the scanner’s motor to run in the forward direction
    /// (ejecting a document from the rear of the unit). Motor runs until exit
    /// sensors say that document has been ejected, or runs for a max run time
    /// of about 4 seconds. ASCII character 3 = (33H)
    ///
    /// # Response
    ///
    /// No response.
    EjectDocumentToBackOfScannerRequest,
}

#[derive(Debug)]
pub enum Incoming {
    GetTestStringResponse(String),
    GetFirmwareVersionResponse(Version),
    GetScannerStatusResponse(Status),
    GetSetSerialNumberResponse([u8; 8]),
    GetSetRequiredInputSensorsResponse {
        /// The number of input sensors required.
        current_sensors_required: u8,

        /// Total number of sensors available.
        total_sensors_available: u8,
    },

    AdjustTopCISSensorThresholdResponse {
        percent_white_threshold: u8,
    },
    AdjustBottomCISSensorThresholdResponse {
        percent_white_threshold: u8,
    },

    GetCalibrationInformationResponse {
        white_calibration_table: Vec<u8>,
        black_calibration_table: Vec<u8>,
    },

    BeginScanEvent,
    EndScanEvent,
    DoubleFeedEvent,
}

#[derive(Debug)]
pub enum Packet {
    Outgoing(Outgoing),
    Incoming(Incoming),
}

pub mod parsers {
    use std::{str::from_utf8, time::Duration};

    use nom::{
        branch::alt,
        bytes::complete::{tag, take, take_until},
        character::is_digit,
        combinator::{map, map_res},
        number::complete::{le_u16, le_u8},
        sequence::{delimited, tuple, Tuple},
        IResult,
    };

    use super::{
        crc, Command, Incoming, Outgoing, Packet, ResolutionTableType, Side, Status, Version,
        PACKET_DATA_END, PACKET_DATA_START,
    };

    pub fn any_packet<'a>(input: &'a [u8]) -> IResult<&'a [u8], Packet> {
        alt((
            map(any_outgoing, |request| Packet::Outgoing(request)),
            map(any_incoming, |response| Packet::Incoming(response)),
        ))(input)
    }

    pub fn any_outgoing<'a>(input: &'a [u8]) -> IResult<&'a [u8], Outgoing> {
        alt((
            alt((
                map(get_test_string_request, |_| Outgoing::GetTestStringRequest),
                map(get_firmware_version_request, |_| {
                    Outgoing::GetFirmwareVersionRequest
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
            )),
            alt((
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
                map(eject_document_to_back_of_scanner_request, |_| {
                    Outgoing::EjectDocumentToBackOfScannerRequest
                }),
            )),
        ))(input)
    }

    pub fn any_incoming<'a>(input: &'a [u8]) -> IResult<&'a [u8], Incoming> {
        alt((
            map(get_test_string_response, |test_string| {
                Incoming::GetTestStringResponse(test_string.to_owned())
            }),
            map(get_firmware_version_response, |version| {
                Incoming::GetFirmwareVersionResponse(version)
            }),
            map(get_scanner_status_response, |status| {
                Incoming::GetScannerStatusResponse(status)
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
        mut l: List,
    ) -> impl FnMut(&'a [u8]) -> IResult<&'a [u8], O> {
        move |i: &'a [u8]| {
            delimited(packet_start, |i| l.parse(i), packet_end)(i)
            // let (i, _) = packet_start(i)?;
            // let (i, o) = l.parse(i)?;
            // let (i, _) = packet_end(i)?;
            // Ok((i, o))
        }
    }

    fn decimal_digit(input: &[u8]) -> IResult<&[u8], u8> {
        map_res(take(1usize), |bytes: &[u8]| {
            if let [byte, ..] = bytes {
                if is_digit(*byte) {
                    Ok(*byte - b'0')
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

    pub fn get_test_string_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"D");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn get_test_string_response<'a>(input: &'a [u8]) -> IResult<&'a [u8], &'a str> {
        map_res(packet((tag(b"D"), packet_body)), |(_, test_string)| {
            from_utf8(test_string)
        })(input)
    }

    pub fn get_firmware_version_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"V");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn get_firmware_version_response<'a>(input: &'a [u8]) -> IResult<&'a [u8], Version> {
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

    pub fn get_scanner_status_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"Q");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

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

    pub fn enable_feeder_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"8");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn disable_feeder_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"9");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn disable_momentary_reverse_on_feed_at_input_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"\x1bO");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn get_serial_number_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"*");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn set_serial_number_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], &'a [u8; 8]> {
        map_res(
            tuple((packet((tag(b"*"), take(8usize))), le_u8)),
            |((_, serial_number), actual_crc)| {
                if actual_crc == crc(serial_number) {
                    if let Ok(serial_number) = serial_number.try_into() {
                        return Ok(serial_number);
                    }
                }

                Err(nom::Err::Failure(nom::error::Error::new(
                    serial_number,
                    nom::error::ErrorKind::Verify,
                )))
            },
        )(input)
    }

    pub fn get_set_serial_number_response<'a>(input: &'a [u8]) -> IResult<&'a [u8], [u8; 8]> {
        map_res(packet((tag(b"*"), take(8usize))), |(_, serial_number)| {
            serial_number.try_into()
        })(input)
    }

    pub fn get_scanner_settings_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"I");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn get_input_sensors_required_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"\x1bs");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn set_input_sensors_required_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], u8> {
        map_res(
            tuple((packet((tag(b"\x1bs"), le_u8)), le_u8)),
            |((_, sensors), actual_crc)| {
                if actual_crc == crc(&[0x1b, b's', sensors]) && is_digit(sensors) {
                    return Ok(sensors - b'0');
                }

                Err(nom::Err::Failure(nom::error::Error::new(
                    sensors,
                    nom::error::ErrorKind::Verify,
                )))
            },
        )(input)
    }

    pub fn get_set_input_sensors_required_response<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], (u8, u8)> {
        map(
            packet((tag(b"s"), decimal_digit, decimal_digit)),
            |(_, current, total)| (current, total),
        )(input)
    }

    pub fn increase_top_cis_threshold_by_1_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"\x1b+");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn decrease_top_cis_threshold_by_1_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"\x1b-");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn increase_bottom_cis_threshold_by_1_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"\x1b>");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn decrease_bottom_cis_threshold_by_1_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"\x1b<");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn adjust_top_bitonal_threshold_response<'a>(input: &'a [u8]) -> IResult<&'a [u8], u8> {
        map(
            packet((tag(b"XT "), hex_byte)),
            |(_, percent_white_threshold)| percent_white_threshold,
        )(input)
    }

    pub fn adjust_bottom_bitonal_threshold_response<'a>(input: &'a [u8]) -> IResult<&'a [u8], u8> {
        map(
            packet((tag(b"XB "), hex_byte)),
            |(_, percent_white_threshold)| percent_white_threshold,
        )(input)
    }

    pub fn get_calibration_information_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ResolutionTableType> {
        let default_type_command = Command::new(b"W");
        let native_type_command = Command::new(b"W0");
        let half_type_command = Command::new(b"W1");
        alt((
            map(tag(default_type_command.to_bytes().as_slice()), |_| {
                ResolutionTableType::Default
            }),
            map(tag(native_type_command.to_bytes().as_slice()), |_| {
                ResolutionTableType::Native
            }),
            map(tag(half_type_command.to_bytes().as_slice()), |_| {
                ResolutionTableType::Half
            }),
        ))(input)
    }

    pub fn get_calibration_information_response<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], (Vec<u8>, Vec<u8>)> {
        let (input, _) = packet_start(input)?;
        let (input, _) = tag(b"W")(input)?;
        let (input, pixel_count) = le_u16(input)?;
        let (input, white_calibration_table) = take(pixel_count)(input)?;
        let (input, white_calibration_table_checksum) = le_u16(input)?;
        // dbg!(
        //     white_calibration_table.len(),
        //     // white_calibration_table,
        //     white_calibration_table_checksum
        // );
        let (input, black_calibration_table) = take(pixel_count)(input)?;
        let (input, black_calibration_table_checksum) = le_u16(input)?;
        // dbg!(
        //     black_calibration_table.len(),
        //     // black_calibration_table,
        //     black_calibration_table_checksum,
        //     input
        // );
        let (input, _) = packet_end(input)?;

        // dbg!(
        //     "HI THERE",
        //     white_calibration_table_checksum,
        //     black_calibration_table_checksum,
        // );
        Ok((
            input,
            (
                white_calibration_table.to_vec(),
                black_calibration_table.to_vec(),
            ),
        ))
    }

    pub fn set_scanner_image_density_to_half_native_resolution_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"A");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn set_scanner_image_density_to_native_resolution_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"B");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn set_scanner_to_duplex_mode_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"J");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn disable_pick_on_command_mode_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"\x1bY");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn disable_eject_pause_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"N");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn transmit_in_low_bits_per_pixel_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"z");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn disable_auto_run_out_at_end_of_scan_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"\x1bd");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn configure_motor_to_run_at_half_speed_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"j");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn configure_motor_to_run_at_full_speed_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"k");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    pub fn set_threshold_to_a_new_value_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], (Side, u8)> {
        map_res(
            tuple((packet((tag(b"\x1b%"), le_u8, le_u8)), le_u8)),
            |((_, side, new_threshold), actual_crc)| {
                let Ok(side) = Side::try_from(side) else {
                    return Err(nom::Err::Failure(nom::error::Error::new(
                        input,
                        nom::error::ErrorKind::Verify,
                    )));
                };

                if actual_crc == crc(&[0x1b, b'%', side.into(), new_threshold]) {
                    return Ok((side, new_threshold));
                }

                Err(nom::Err::Failure(nom::error::Error::new(
                    input,
                    nom::error::ErrorKind::Verify,
                )))
            },
        )(input)
    }

    pub fn set_length_of_document_to_scan_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], (u8, Option<u8>)> {
        let (input, _) = packet_start(input)?;
        let body = input;
        let (input, tag_bytes) = tag(b"\x1bD")(input)?;
        let (input, length_byte) = le_u8(input)?;
        let (input, unit_byte) = alt((
            map(tuple((le_u8, packet_end)), |(unit_byte, _)| Some(unit_byte)),
            map(packet_end, |_| None),
        ))(input)?;
        let (input, actual_crc) = le_u8(input)?;
        let body = &body[..tag_bytes.len() + 1 + if unit_byte.is_some() { 1 } else { 0 }];

        if actual_crc != crc(body) {
            return Err(nom::Err::Failure(nom::error::Error::new(
                input,
                nom::error::ErrorKind::Verify,
            )));
        }

        Ok((input, (length_byte, unit_byte)))
    }

    pub fn set_scan_delay_interval_for_document_feed_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], Duration> {
        map_res(
            tuple((packet((tag(b"\x1bj"), le_u8)), le_u8)),
            |((_, delay_interval), actual_crc)| {
                if delay_interval < 0x20 || delay_interval > 0xe8 {
                    return Err(nom::Err::Failure(nom::error::Error::new(
                        input,
                        nom::error::ErrorKind::Verify,
                    )));
                }

                if actual_crc != crc(&[0x1b, b'j', delay_interval]) {
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

    pub fn begin_scan_event<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        map(packet((tag(b"#30"),)), |_| ())(input)
    }

    pub fn end_scan_event<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        map(packet((tag(b"#31"),)), |_| ())(input)
    }

    pub fn double_feed_event<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        map(packet((tag(b"#33"),)), |_| ())(input)
    }

    /// This command causes the scanner to eject a form (after scanning) at the
    /// front input throat of the scanner, but form remains gripped by the
    /// scanner input rollers. ASCII character 1 = (31H)
    ///
    /// # Response
    ///
    /// No response.
    pub fn eject_document_to_front_of_scanner_and_hold_in_input_rollers_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"1");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    /// This command causes the scanner’s motor to run in the forward direction
    /// (ejecting a document from the rear of the unit). Motor runs until exit
    /// sensors say that document has been ejected, or runs for a max run time
    /// of about 4 seconds. ASCII character 3 = (33H)
    ///
    /// # Response
    ///
    /// No response.
    pub fn eject_document_to_back_of_scanner_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"3");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    /// This command causes the scanner’s motor to run in the reverse direction
    /// (clearing a document from the front entrance of the scanner). Motor runs
    /// until front sensors indicate form has exited, or for a max run time of
    /// about 4 seconds. ASCII character 4 = (34H)
    ///
    /// # Response
    ///
    /// No response.
    pub fn eject_document_to_the_front_of_scanners_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"4");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    /// This command causes the scanner to eject a document held in escrow (rear
    /// rollers), by advancing the feed mechanism only enough to release the
    /// document. ASCII character 7 = (37H)
    ///
    /// # Response
    ///
    /// No response.
    pub fn eject_escrow_document_request<'a>(input: &'a [u8]) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"7");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }

    /// On receipt of this command, the scanner will re-scan a document in
    /// escrow position (held by rear set of rollers), and re-transmit the data.
    /// ASCII character [ = (5BH)
    ///
    /// # Response
    ///
    /// No response.
    pub fn rescan_document_held_in_escrow_position_request<'a>(
        input: &'a [u8],
    ) -> IResult<&'a [u8], ()> {
        let command = Command::new(b"[");
        map(tag(command.to_bytes().as_slice()), |_| ())(input)
    }
}

#[derive(Debug)]
pub struct Version {
    product_id: String,
    major: String,
    minor: String,
    cpld_version: String,
}

impl Version {
    pub const fn new(
        product_id: String,
        major: String,
        minor: String,
        cpld_version: String,
    ) -> Self {
        Self {
            product_id,
            major,
            minor,
            cpld_version,
        }
    }
}

/// The status of the scanner.
///
/// Note: bit 7 of each byte is always set to 1.
#[derive(Debug, PartialEq)]
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
pub struct Command<'a> {
    data: &'a [u8],
}

impl<'a> Command<'a> {
    pub const fn new(data: &'a [u8]) -> Self {
        Self { data }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(self.data.len() + 2);
        bytes.extend_from_slice(PACKET_DATA_START);
        bytes.extend_from_slice(self.data);
        bytes.extend_from_slice(PACKET_DATA_END);
        bytes.push(crc(self.data));
        bytes
    }
}

fn crc(data: &[u8]) -> u8 {
    const POLYNOMIAL: u8 = 0x97;
    data.iter().fold(0, |crc, byte| {
        let mut crc = crc ^ byte;
        for _ in 0..8 {
            if crc & 0x80 != 0 {
                crc = (crc << 1) ^ POLYNOMIAL;
            } else {
                crc <<= 1;
            }
        }
        crc
    })
}
