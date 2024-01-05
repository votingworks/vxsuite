use nom::{
    bytes::complete::{tag, take_until, take_while},
    combinator::{map, map_res},
    error::Error,
    number::complete::{le_u16, le_u32, le_u8},
    sequence::{pair, tuple},
    IResult,
};

pub const CUSTOM_VENDOR_ID: u16 = 0x0dd4;
pub const CUSTOM_PRODUCT_ID: u16 = 0x4103;

/// General acknowledgement response message.
#[derive(Debug)]
pub struct AckResponseMessage {
    pub job_id: u8,
}

impl AckResponseMessage {
    pub fn from_bytes(input: &[u8]) -> IResult<&[u8], Self> {
        map(
            tuple((tag("STA\x00A\x00\x00"), le_u8)),
            |(_header, job_id)| Self { job_id },
        )(input)
    }

    pub fn parse_response<'a>(input: &'a [u8]) -> AckResponseResult<'a> {
        match tuple((Self::from_bytes, take_while(|c| c == 0x00)))(input) {
            Ok((remaining, (response, _))) => {
                if remaining.is_empty() {
                    Ok(response)
                } else {
                    Err(AckResponseError::Parser(nom::Err::Failure(Error::new(
                        remaining,
                        nom::error::ErrorKind::OneOf,
                    ))))
                }
            }
            Err(err) => Err(AckResponseError::Parser(err)),
        }
    }
}

pub type AckResponseResult<'a> = Result<AckResponseMessage, AckResponseError<'a>>;

#[derive(Debug)]
pub enum AckResponseError<'a> {
    Parser(nom::Err<Error<&'a [u8]>>),
}

/// Possible response errors.
#[derive(Debug)]
pub enum ResponseErrorCode {
    /// Wrong format of the answer from the scanner. Bad answer.
    FormatError = 0x00,

    /// Scanner answered "Invalid command".
    InvalidCommand = 0x80,

    /// Scanner answered "Invalid job ID".
    InvalidJobId = 0x81,
}

impl ResponseErrorCode {
    pub fn from_bytes(input: &[u8]) -> IResult<&[u8], Self> {
        le_u8(input).and_then(|(remaining, error_code)| match error_code {
            0x00 => Ok((remaining, ResponseErrorCode::FormatError)),
            0x80 => Ok((remaining, ResponseErrorCode::InvalidCommand)),
            0x81 => Ok((remaining, ResponseErrorCode::InvalidJobId)),
            _ => Err(nom::Err::Error(Error::new(
                input,
                nom::error::ErrorKind::OneOf,
            ))),
        })
    }
}

/// Error response message.
#[derive(Debug)]
pub struct ErrorResponseMessage {
    pub error_code: ResponseErrorCode,
}

impl ErrorResponseMessage {
    pub fn from_bytes(input: &[u8]) -> IResult<&[u8], Self> {
        map(
            tuple((tag("STA\x00E\x00\x00"), ResponseErrorCode::from_bytes)),
            |(_header, error_code)| Self { error_code },
        )(input)
    }

    pub fn parse_response<'a>(input: &'a [u8]) -> ErrorResponseResult<'a> {
        match tuple((Self::from_bytes, take_while(|c| c == 0x00)))(input) {
            Ok((remaining, (response, _))) => {
                if remaining.is_empty() {
                    Ok(response)
                } else {
                    Err(ErrorResponseError::Parser(nom::Err::Failure(Error::new(
                        remaining,
                        nom::error::ErrorKind::OneOf,
                    ))))
                }
            }
            Err(err) => Err(ErrorResponseError::Parser(err)),
        }
    }
}

pub type ErrorResponseResult<'a> = Result<ErrorResponseMessage, ErrorResponseError<'a>>;

#[derive(Debug)]
pub enum ErrorResponseError<'a> {
    Parser(nom::Err<Error<&'a [u8]>>),
}

/// Scanner response data message.
#[derive(Debug)]
pub struct DataResponseMessage<'a> {
    pub data: &'a str,
}

impl<'a> DataResponseMessage<'a> {
    pub fn from_bytes(input: &'a [u8]) -> IResult<&'a [u8], Self> {
        map_res(
            tuple((tag("CDAT"), take_until("\x00"), take_while(|c| c == 0x00))),
            |(_header, data, _padding): (&[u8], &[u8], &[u8])| {
                std::str::from_utf8(data).map_or_else(
                    |_| {
                        Err(nom::Err::Error(Error::new(
                            input,
                            nom::error::ErrorKind::OneOf,
                        )))
                    },
                    |str| Ok(Self { data: str }),
                )
            },
        )(input)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(u8)]
pub enum ReleaseType {
    Model = 0x01,
    Firmware = 0x02,
    Hardware = 0x03,
    Capabilities = 0x04,
}

impl ReleaseType {
    pub fn from_bytes(input: &[u8]) -> IResult<&[u8], Self> {
        le_u8(input).and_then(|(remaining, release_type)| match release_type {
            0x01 => Ok((remaining, ReleaseType::Model)),
            0x02 => Ok((remaining, ReleaseType::Firmware)),
            0x03 => Ok((remaining, ReleaseType::Hardware)),
            0x04 => Ok((remaining, ReleaseType::Capabilities)),
            _ => Err(nom::Err::Error(Error::new(
                input,
                nom::error::ErrorKind::OneOf,
            ))),
        })
    }
}

#[derive(Debug)]
pub struct ReleaseVersionRequest {
    pub release_type: ReleaseType,
}

impl ReleaseVersionRequest {
    pub const fn new(release_type: ReleaseType) -> Self {
        Self { release_type }
    }
}

impl ReleaseVersionRequest {
    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend(b"CAP\x00\x1c\x00");
        bytes.push(self.release_type as u8);
        bytes.push(0x00);
        bytes
    }

    pub fn parse_response<'a>(&self, input: &'a [u8]) -> ReleaseVersionRequestResult<'a> {
        if let Ok(response) = ErrorResponseMessage::parse_response(input) {
            return Err(ReleaseVersionRequestError::Scanner(response.error_code));
        }

        match DataResponseMessage::from_bytes(input) {
            Ok((remaining, response)) => {
                if remaining.is_empty() {
                    match self.release_type {
                        ReleaseType::Model => {
                            Ok(ReleaseVersionRequestResponse::Model(response.data))
                        }
                        ReleaseType::Firmware => {
                            Ok(ReleaseVersionRequestResponse::Firmware(response.data))
                        }
                        ReleaseType::Hardware => {
                            Ok(ReleaseVersionRequestResponse::Hardware(response.data))
                        }
                        ReleaseType::Capabilities => {
                            Ok(ReleaseVersionRequestResponse::Capabilities)
                        }
                    }
                } else {
                    Err(ReleaseVersionRequestError::Parser(nom::Err::Failure(
                        Error::new(remaining, nom::error::ErrorKind::OneOf),
                    )))
                }
            }
            Err(err) => Err(ReleaseVersionRequestError::Parser(err)),
        }
    }
}

#[derive(Debug)]
pub enum ReleaseVersionRequestResponse<'a> {
    Model(&'a str),
    Firmware(&'a str),
    Hardware(&'a str),
    Capabilities,
}

#[derive(Debug)]
pub enum ReleaseVersionRequestError<'a> {
    Scanner(ResponseErrorCode),
    Parser(nom::Err<Error<&'a [u8]>>),
}

pub type ReleaseVersionRequestResult<'a> =
    Result<ReleaseVersionRequestResponse<'a>, ReleaseVersionRequestError<'a>>;

/// Job create request message.
#[derive(Debug)]
pub struct JobCreateRequest;

impl JobCreateRequest {
    pub const fn new() -> Self {
        Self
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        b"JOB\x00C\x00\x00\x00".to_vec()
    }

    pub fn parse_response<'a>(&self, input: &'a [u8]) -> JobCreateRequestResult<'a> {
        if let Ok(response) = ErrorResponseMessage::parse_response(input) {
            return Err(JobCreateRequestError::Scanner(response.error_code));
        }

        if let Ok(response) = AckResponseMessage::parse_response(input) {
            return Ok(response);
        }

        Err(JobCreateRequestError::Parser(nom::Err::Failure(
            Error::new(input, nom::error::ErrorKind::OneOf),
        )))
    }
}

pub type JobCreateRequestResult<'a> = Result<AckResponseMessage, JobCreateRequestError<'a>>;

#[derive(Debug)]
pub enum JobCreateRequestError<'a> {
    Scanner(ResponseErrorCode),
    Parser(nom::Err<Error<&'a [u8]>>),
}

/// Job end request message.
#[derive(Debug)]
pub struct JobEndRequest {
    pub job_id: u8,
}

impl JobEndRequest {
    pub const fn new(job_id: u8) -> Self {
        Self { job_id }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend(b"JOB\x00E\x00\x00");
        bytes.push(self.job_id);
        bytes
    }

    pub fn parse_response<'a>(&self, input: &'a [u8]) -> JobEndRequestResult<'a> {
        if let Ok(response) = ErrorResponseMessage::parse_response(input) {
            return Err(JobEndRequestError::Scanner(response.error_code));
        }

        if let Ok(response) = AckResponseMessage::parse_response(input) {
            return Ok(response);
        }

        Err(JobEndRequestError::Parser(nom::Err::Failure(Error::new(
            input,
            nom::error::ErrorKind::OneOf,
        ))))
    }
}

pub type JobEndRequestResult<'a> = Result<AckResponseMessage, JobEndRequestError<'a>>;

#[derive(Debug)]
pub enum JobEndRequestError<'a> {
    Scanner(ResponseErrorCode),
    Parser(nom::Err<Error<&'a [u8]>>),
}

/// Internal status request message.
#[derive(Debug)]
pub struct StatusInternalRequest {
    pub job_id: u8,
}

impl StatusInternalRequest {
    pub const fn new(job_id: u8) -> Self {
        Self { job_id }
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.extend(b"INFO\x30\x00\x00");
        bytes.push(self.job_id);
        bytes
    }

    pub fn parse_response<'a>(&self, input: &'a [u8]) -> StatusInternalRequestResult<'a> {
        if let Ok(response) = ErrorResponseMessage::parse_response(input) {
            return Err(StatusInternalRequestError::Scanner(response.error_code));
        }

        if let Ok(response) = StatusInternalResponse::parse_response(input) {
            return Ok(response);
        }

        Err(StatusInternalRequestError::Parser(nom::Err::Failure(
            Error::new(input, nom::error::ErrorKind::OneOf),
        )))
    }
}

#[derive(Debug, Clone, Copy)]
#[repr(u8)]
pub enum EndPage {
    None = 0x00,
    A = b'P',
    B = b'p',
}

impl EndPage {
    pub fn from_bytes(input: &[u8]) -> IResult<&[u8], Self> {
        le_u8(input).and_then(|(remaining, end_page)| match end_page {
            0x00 => Ok((remaining, EndPage::None)),
            b'P' => Ok((remaining, EndPage::A)),
            b'p' => Ok((remaining, EndPage::B)),
            _ => Err(nom::Err::Error(Error::new(
                input,
                nom::error::ErrorKind::OneOf,
            ))),
        })
    }
}

/// Internal status response message.
#[derive(Debug)]
pub struct StatusInternalResponse {
    /// Bytes 4-5. The number of pages scanned on side A.
    page_num_side_a: u16,

    /// Bytes 6-7. The number of pages scanned on side B.
    page_num_side_b: u16,

    /// Bytes 8-11. How many bytes of side A image data are available for reading.
    /// When this is 0, we've read all the data for side A.
    valid_page_size_a: u32,

    /// Bytes 12-15. How many bytes of side B image data are available for reading.
    /// When this is 0, we've read all the data for side B.
    valid_page_size_b: u32,

    /// Bytes 16-17. How wide the image is on side A in pixels. This value will
    /// be available as soon as any image data is available, and otherwise will
    /// be 0.
    image_width_a: u16,

    /// Bytes 18-19. How wide the image is on side B in pixels. This value will
    /// be available as soon as any image data is available, and otherwise will
    /// be 0.
    image_width_b: u16,

    /// Bytes 20-21. How tall the image is on side A in pixels. This value will
    /// be available as soon as any image data is available, and otherwise will
    /// be 0.
    image_height_a: u16,

    /// Bytes 22-23. How tall the image is on side B in pixels. This value will
    /// be available as soon as any image data is available, and otherwise will
    /// be 0.
    image_height_b: u16,

    /// Byte 24. Per Custom docs, "'P' = end page A, 'p' = end page B".
    end_page_a: EndPage,

    /// Byte 25. Per Custom docs, "'P' = end page A, 'p' = end page B".
    end_page_b: EndPage,

    /// Byte 26. Per Custom docs, "'S' = end scan A, 's' = end scan B".
    end_scan_a: u8,

    /// Byte 27. Per Custom docs, "'S' = end scan A, 's' = end scan B".
    end_scan_b: u8,

    /// Byte 28. Ultrasonic status.
    ultrasonic: u8,

    /// Byte 29. 'J' if there is a paper jam, but which kind of jam depends on
    /// bit 0 of byte 35: 0 = generic jam, 1 = encoder error (the paper was held
    /// back during scanning).
    paper_jam: u8,

    /// Byte 30. The scanner cover is open if this is non-zero.
    cover_open: u8,

    /// Byte 31. 'C' if the scan was canceled.
    cancel: u8,

    /// Byte 32. Per Custom docs, "button press".
    key: u8,

    /// Byte 33. 'S' if scanning, 'M' if moving but not scanning.
    motor_move: u8,

    /// Byte 34. Not used.
    adf_sensor: u8,

    /// Byte 35. Document sensor status.
    /// * Bit 0: 1 if encoder error (the paper was held back during scanning).
    /// * Bit 1: 1 if double sheet (more than one sheet of paper was detected).
    /// * Bit 2: DL (deskew left).
    /// * Bit 3: DR (deskew right).
    /// * Bit 4: ILL (sensor detected paper at input left left).
    /// * Bit 5: ICR (sensor detected paper at input center left).
    /// * Bit 6: ICR (sensor detected paper at input center right).
    /// * Bit 7: IRR (sensor detected paper at input right right).
    doc_sensor: u8,

    /// Byte 36. Home sensor status.
    /// * Bit 0: OLL (sensor detected paper at output left left).
    /// * Bit 1: OCL (sensor detected paper at output center left).
    /// * Bit 2: OCR (sensor detected paper at output center right).
    /// * Bit 3: ORR (sensor detected paper at output right right).
    /// * Bits 4-7: Not used.
    home_sensor: u8,

    /// Byte 37. Job owner set to 0x01 if job ID is 0x01, which it always is.
    job_owner: u8,

    /// Bytes 38-39. Not used.
    reserve1: u16,

    /// Bytes 40-43. Not used.
    reserve2: u32,

    /// Bytes 44-47. Per Custom docs, "Job state".
    job_state: u32,
}

impl StatusInternalResponse {
    pub fn from_bytes(input: &[u8]) -> IResult<&[u8], Self> {
        map(
            pair(
                tuple((
                    tag("IDAT"),
                    le_u16,
                    le_u16,
                    le_u32,
                    le_u32,
                    le_u16,
                    le_u16,
                    le_u16,
                    le_u16,
                    EndPage::from_bytes,
                    EndPage::from_bytes,
                )),
                tuple((
                    le_u8, le_u8, le_u8, le_u8, le_u8, le_u8, le_u8, le_u8, le_u8, le_u8, le_u8,
                    le_u8, le_u16, le_u32, le_u32,
                )),
            ),
            |(
                (
                    _header,
                    page_num_side_a,
                    page_num_side_b,
                    valid_page_size_a,
                    valid_page_size_b,
                    image_width_a,
                    image_width_b,
                    image_height_a,
                    image_height_b,
                    end_page_a,
                    end_page_b,
                ),
                (
                    end_scan_a,
                    end_scan_b,
                    ultrasonic,
                    paper_jam,
                    cover_open,
                    cancel,
                    key,
                    motor_move,
                    adf_sensor,
                    doc_sensor,
                    home_sensor,
                    job_owner,
                    reserve1,
                    reserve2,
                    job_state,
                ),
            )| Self {
                page_num_side_a,
                page_num_side_b,
                valid_page_size_a,
                valid_page_size_b,
                image_width_a,
                image_width_b,
                image_height_a,
                image_height_b,
                end_page_a,
                end_page_b,
                end_scan_a,
                end_scan_b,
                ultrasonic,
                paper_jam,
                cover_open,
                cancel,
                key,
                motor_move,
                adf_sensor,
                doc_sensor,
                home_sensor,
                job_owner,
                reserve1,
                reserve2,
                job_state,
            },
        )(input)
    }

    pub fn parse_response<'a>(input: &'a [u8]) -> StatusInternalRequestResult<'a> {
        if let Ok(response) = ErrorResponseMessage::parse_response(input) {
            return Err(StatusInternalRequestError::Scanner(response.error_code));
        }

        match tuple((Self::from_bytes, take_while(|c| c == 0x00)))(input) {
            Ok((remaining, (response, _))) => {
                if remaining.is_empty() {
                    Ok(response)
                } else {
                    Err(StatusInternalRequestError::Parser(nom::Err::Failure(
                        Error::new(remaining, nom::error::ErrorKind::OneOf),
                    )))
                }
            }
            Err(err) => Err(StatusInternalRequestError::Parser(err)),
        }
    }
}

pub type StatusInternalRequestResult<'a> =
    Result<StatusInternalResponse, StatusInternalRequestError<'a>>;

#[derive(Debug)]
pub enum StatusInternalRequestError<'a> {
    Scanner(ResponseErrorCode),
    Parser(nom::Err<Error<&'a [u8]>>),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_release_version_request_to_bytes() {
        let request = ReleaseVersionRequest::new(ReleaseType::Model);
        let bytes = request.to_bytes();
        assert_eq!(bytes, b"CAP\x00\x1c\x00\x01\x00");
    }
}
