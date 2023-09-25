use std::ffi::{c_char, c_long, c_void};

use super::{
    ffi::string_from_c_char_slice,
    libpdiscan::{
        pdiscan_errors, PdGetErrorExtraInfo, PdGetErrorLongDescription, PdGetErrorShortDescription,
        PdGetErrorSourceFileLineNumber, PdGetErrorSourceFileName,
    },
};

#[derive(Debug, Clone, Copy)]
pub enum ErrorType {
    Internal,
    FunctionCallSequence,
    InvalidParam,
    FileOpenRead,
    FileOpenWrite,
    FileRead,
    FileWrite,
    OutOfMemory,
    CannotLoadLibrary,
    Unexpected,
    AssertionFailure,
    ScannerNotFound,
    FeederEmpty,
    PaperJam,
    ScannerError,
    DoubleFeed,
    CoverOpen,
    InvalidTag,
    StringBufferTooSmall,
    ThreadFatal,
    Disconnected,
    NotSupportedWindows,
    NotSupportedAsynch,
    NotSupportedRawMode,
    StatusNotOk,
    BeginScan,
    EndScan,
    RearSensorsBlocked,
    EjectPaused,
    EjectResumed,
    LatchReleased,
    CoverClosed,
    Image,
    Deskew,
    AutoCrop,
    DisconnectNeeded,
    ImageEnhancement,
    CommandNotSupported,
    AbortScan,
    FeederDisabled,
    DoubleFeedTrouble,
    ScannerOverflow,
    TphStopXfer,
    TphTooLong,
    TphHeat,
    TphPaperLoaded,
    Opticon,
    Option1,
    Option2,
    Option3,
    Option4,
    Option5,
    Option6,
    Option7,
    Option8,
    Option9,
}

impl TryFrom<pdiscan_errors> for ErrorType {
    type Error = String;

    fn try_from(value: pdiscan_errors) -> std::result::Result<Self, Self::Error> {
        match value {
            pdiscan_errors::PDISCAN_ERR_NONE => {
                Err("No error; the function completed successfully.".to_string())
            }
            pdiscan_errors::PDISCAN_ERR_INTERNAL => Ok(ErrorType::Internal),
            pdiscan_errors::PDISCAN_ERR_FUNCTION_CALL_SEQUENCE => {
                Ok(ErrorType::FunctionCallSequence)
            }
            pdiscan_errors::PDISCAN_ERR_INVALID_PARAM => Ok(ErrorType::InvalidParam),
            pdiscan_errors::PDISCAN_ERR_FILE_OPEN_READ => Ok(ErrorType::FileOpenRead),
            pdiscan_errors::PDISCAN_ERR_FILE_OPEN_WRITE => Ok(ErrorType::FileOpenWrite),
            pdiscan_errors::PDISCAN_ERR_FILE_READ => Ok(ErrorType::FileRead),
            pdiscan_errors::PDISCAN_ERR_FILE_WRITE => Ok(ErrorType::FileWrite),
            pdiscan_errors::PDISCAN_ERR_OUT_OF_MEMORY => Ok(ErrorType::OutOfMemory),
            pdiscan_errors::PDISCAN_ERR_CANNOT_LOAD_LIBRARY => Ok(ErrorType::CannotLoadLibrary),
            pdiscan_errors::PDISCAN_ERR_UNEXPECTED => Ok(ErrorType::Unexpected),
            pdiscan_errors::PDISCAN_ERR_ASSERTION_FAILURE => Ok(ErrorType::AssertionFailure),
            pdiscan_errors::PDISCAN_ERR_SCANNER_NOT_FOUND => Ok(ErrorType::ScannerNotFound),
            pdiscan_errors::PDISCAN_ERR_FEEDER_EMPTY => Ok(ErrorType::FeederEmpty),
            pdiscan_errors::PDISCAN_ERR_PAPER_JAM => Ok(ErrorType::PaperJam),
            pdiscan_errors::PDISCAN_ERR_SCANNER_ERROR => Ok(ErrorType::ScannerError),
            pdiscan_errors::PDISCAN_ERR_DOUBLE_FEED => Ok(ErrorType::DoubleFeed),
            pdiscan_errors::PDISCAN_ERR_COVER_OPEN => Ok(ErrorType::CoverOpen),
            pdiscan_errors::PDISCAN_ERR_INVALID_TAG => Ok(ErrorType::InvalidTag),
            pdiscan_errors::PDISCAN_ERR_STRING_BUFFER_TOO_SMALL => {
                Ok(ErrorType::StringBufferTooSmall)
            }
            pdiscan_errors::PDISCAN_ERR_THREAD_FATAL => Ok(ErrorType::ThreadFatal),
            pdiscan_errors::PDISCAN_ERR_DISCONNECTED => Ok(ErrorType::Disconnected),
            pdiscan_errors::PDISCAN_ERR_NOT_SUPPORTED_WINDOWS => Ok(ErrorType::NotSupportedWindows),
            pdiscan_errors::PDISCAN_ERR_NOT_SUPPORTED_ASYNCH => Ok(ErrorType::NotSupportedAsynch),
            pdiscan_errors::PDISCAN_ERR_NOT_SUPPORTED_RAWMODE => Ok(ErrorType::NotSupportedRawMode),
            pdiscan_errors::PDISCAN_ERR_STATUS_NOT_OK => Ok(ErrorType::StatusNotOk),
            pdiscan_errors::PDISCAN_ERR_BEGINSCAN => Ok(ErrorType::BeginScan),
            pdiscan_errors::PDISCAN_ERR_ENDSCAN => Ok(ErrorType::EndScan),
            pdiscan_errors::PDISCAN_ERR_REAR_SENSORS_BLOCKED => Ok(ErrorType::RearSensorsBlocked),
            pdiscan_errors::PDISCAN_ERR_EJECT_PAUSED => Ok(ErrorType::EjectPaused),
            pdiscan_errors::PDISCAN_ERR_EJECT_RESUMED => Ok(ErrorType::EjectResumed),
            pdiscan_errors::PDISCAN_ERR_LATCH_RELEASED => Ok(ErrorType::LatchReleased),
            pdiscan_errors::PDISCAN_ERR_COVER_CLOSED => Ok(ErrorType::CoverClosed),
            pdiscan_errors::PDISCAN_ERR_IMAGE => Ok(ErrorType::Image),
            pdiscan_errors::PDISCAN_ERR_DESKEW => Ok(ErrorType::Deskew),
            pdiscan_errors::PDISCAN_ERR_AUTOCROP => Ok(ErrorType::AutoCrop),
            pdiscan_errors::PDISCAN_ERR_DISCONNECT_NEEDED => Ok(ErrorType::DisconnectNeeded),
            pdiscan_errors::PDISCAN_ERR_IMAGE_ENHANCEMENT => Ok(ErrorType::ImageEnhancement),
            pdiscan_errors::PDISCAN_ERR_COMMAND_NOT_SUPPORTED => Ok(ErrorType::CommandNotSupported),
            pdiscan_errors::PDISCAN_ERR_ABORTSCAN => Ok(ErrorType::AbortScan),
            pdiscan_errors::PDISCAN_ERR_FEEDERDISABLED => Ok(ErrorType::FeederDisabled),
            pdiscan_errors::PDISCAN_ERR_DOUBLE_FEED_TROUBLE => Ok(ErrorType::DoubleFeedTrouble),
            pdiscan_errors::PDISCAN_ERR_SCANNER_OVERFLOW => Ok(ErrorType::ScannerOverflow),
            pdiscan_errors::PDISCAN_ERR_TPH_STOP_XFER => Ok(ErrorType::TphStopXfer),
            pdiscan_errors::PDISCAN_ERR_TPH_TOO_LONG => Ok(ErrorType::TphTooLong),
            pdiscan_errors::PDISCAN_ERR_TPH_HEAT => Ok(ErrorType::TphHeat),
            pdiscan_errors::PDISCAN_ERR_TPH_PAPER_LOADED => Ok(ErrorType::TphPaperLoaded),
            pdiscan_errors::PDISCAN_ERR_OPTICON => Ok(ErrorType::Opticon),
            pdiscan_errors::PDISCAN_ERR_OPTION1 => Ok(ErrorType::Option1),
            pdiscan_errors::PDISCAN_ERR_OPTION2 => Ok(ErrorType::Option2),
            pdiscan_errors::PDISCAN_ERR_OPTION3 => Ok(ErrorType::Option3),
            pdiscan_errors::PDISCAN_ERR_OPTION4 => Ok(ErrorType::Option4),
            pdiscan_errors::PDISCAN_ERR_OPTION5 => Ok(ErrorType::Option5),
            pdiscan_errors::PDISCAN_ERR_OPTION6 => Ok(ErrorType::Option6),
            pdiscan_errors::PDISCAN_ERR_OPTION7 => Ok(ErrorType::Option7),
            pdiscan_errors::PDISCAN_ERR_OPTION8 => Ok(ErrorType::Option8),
            pdiscan_errors::PDISCAN_ERR_OPTION9 => Ok(ErrorType::Option9),
            _ => Err(format!("Unknown error code: {:?}", value)),
        }
    }
}

impl From<ErrorType> for pdiscan_errors {
    fn from(value: ErrorType) -> Self {
        match value {
            ErrorType::Internal => pdiscan_errors::PDISCAN_ERR_INTERNAL,
            ErrorType::FunctionCallSequence => pdiscan_errors::PDISCAN_ERR_FUNCTION_CALL_SEQUENCE,
            ErrorType::InvalidParam => pdiscan_errors::PDISCAN_ERR_INVALID_PARAM,
            ErrorType::FileOpenRead => pdiscan_errors::PDISCAN_ERR_FILE_OPEN_READ,
            ErrorType::FileOpenWrite => pdiscan_errors::PDISCAN_ERR_FILE_OPEN_WRITE,
            ErrorType::FileRead => pdiscan_errors::PDISCAN_ERR_FILE_READ,
            ErrorType::FileWrite => pdiscan_errors::PDISCAN_ERR_FILE_WRITE,
            ErrorType::OutOfMemory => pdiscan_errors::PDISCAN_ERR_OUT_OF_MEMORY,
            ErrorType::CannotLoadLibrary => pdiscan_errors::PDISCAN_ERR_CANNOT_LOAD_LIBRARY,
            ErrorType::Unexpected => pdiscan_errors::PDISCAN_ERR_UNEXPECTED,
            ErrorType::AssertionFailure => pdiscan_errors::PDISCAN_ERR_ASSERTION_FAILURE,
            ErrorType::ScannerNotFound => pdiscan_errors::PDISCAN_ERR_SCANNER_NOT_FOUND,
            ErrorType::FeederEmpty => pdiscan_errors::PDISCAN_ERR_FEEDER_EMPTY,
            ErrorType::PaperJam => pdiscan_errors::PDISCAN_ERR_PAPER_JAM,
            ErrorType::ScannerError => pdiscan_errors::PDISCAN_ERR_SCANNER_ERROR,
            ErrorType::DoubleFeed => pdiscan_errors::PDISCAN_ERR_DOUBLE_FEED,
            ErrorType::CoverOpen => pdiscan_errors::PDISCAN_ERR_COVER_OPEN,
            ErrorType::InvalidTag => pdiscan_errors::PDISCAN_ERR_INVALID_TAG,
            ErrorType::StringBufferTooSmall => pdiscan_errors::PDISCAN_ERR_STRING_BUFFER_TOO_SMALL,
            ErrorType::ThreadFatal => pdiscan_errors::PDISCAN_ERR_THREAD_FATAL,
            ErrorType::Disconnected => pdiscan_errors::PDISCAN_ERR_DISCONNECTED,
            ErrorType::NotSupportedWindows => pdiscan_errors::PDISCAN_ERR_NOT_SUPPORTED_WINDOWS,
            ErrorType::NotSupportedAsynch => pdiscan_errors::PDISCAN_ERR_NOT_SUPPORTED_ASYNCH,
            ErrorType::NotSupportedRawMode => pdiscan_errors::PDISCAN_ERR_NOT_SUPPORTED_RAWMODE,
            ErrorType::StatusNotOk => pdiscan_errors::PDISCAN_ERR_STATUS_NOT_OK,
            ErrorType::BeginScan => pdiscan_errors::PDISCAN_ERR_BEGINSCAN,
            ErrorType::EndScan => pdiscan_errors::PDISCAN_ERR_ENDSCAN,
            ErrorType::RearSensorsBlocked => pdiscan_errors::PDISCAN_ERR_REAR_SENSORS_BLOCKED,
            ErrorType::EjectPaused => pdiscan_errors::PDISCAN_ERR_EJECT_PAUSED,
            ErrorType::EjectResumed => pdiscan_errors::PDISCAN_ERR_EJECT_RESUMED,
            ErrorType::LatchReleased => pdiscan_errors::PDISCAN_ERR_LATCH_RELEASED,
            ErrorType::CoverClosed => pdiscan_errors::PDISCAN_ERR_COVER_CLOSED,
            ErrorType::Image => pdiscan_errors::PDISCAN_ERR_IMAGE,
            ErrorType::Deskew => pdiscan_errors::PDISCAN_ERR_DESKEW,
            ErrorType::AutoCrop => pdiscan_errors::PDISCAN_ERR_AUTOCROP,
            ErrorType::DisconnectNeeded => pdiscan_errors::PDISCAN_ERR_DISCONNECT_NEEDED,
            ErrorType::ImageEnhancement => pdiscan_errors::PDISCAN_ERR_IMAGE_ENHANCEMENT,
            ErrorType::CommandNotSupported => pdiscan_errors::PDISCAN_ERR_COMMAND_NOT_SUPPORTED,
            ErrorType::AbortScan => pdiscan_errors::PDISCAN_ERR_ABORTSCAN,
            ErrorType::FeederDisabled => pdiscan_errors::PDISCAN_ERR_FEEDERDISABLED,
            ErrorType::DoubleFeedTrouble => pdiscan_errors::PDISCAN_ERR_DOUBLE_FEED_TROUBLE,
            ErrorType::ScannerOverflow => pdiscan_errors::PDISCAN_ERR_SCANNER_OVERFLOW,
            ErrorType::TphStopXfer => pdiscan_errors::PDISCAN_ERR_TPH_STOP_XFER,
            ErrorType::TphTooLong => pdiscan_errors::PDISCAN_ERR_TPH_TOO_LONG,
            ErrorType::TphHeat => pdiscan_errors::PDISCAN_ERR_TPH_HEAT,
            ErrorType::TphPaperLoaded => pdiscan_errors::PDISCAN_ERR_TPH_PAPER_LOADED,
            ErrorType::Opticon => pdiscan_errors::PDISCAN_ERR_OPTICON,
            ErrorType::Option1 => pdiscan_errors::PDISCAN_ERR_OPTION1,
            ErrorType::Option2 => pdiscan_errors::PDISCAN_ERR_OPTION2,
            ErrorType::Option3 => pdiscan_errors::PDISCAN_ERR_OPTION3,
            ErrorType::Option4 => pdiscan_errors::PDISCAN_ERR_OPTION4,
            ErrorType::Option5 => pdiscan_errors::PDISCAN_ERR_OPTION5,
            ErrorType::Option6 => pdiscan_errors::PDISCAN_ERR_OPTION6,
            ErrorType::Option7 => pdiscan_errors::PDISCAN_ERR_OPTION7,
            ErrorType::Option8 => pdiscan_errors::PDISCAN_ERR_OPTION8,
            ErrorType::Option9 => pdiscan_errors::PDISCAN_ERR_OPTION9,
        }
    }
}

#[derive(Debug)]
#[allow(dead_code)]
pub struct Error {
    error_type: ErrorType,
    short_description: String,
    long_description: String,
    extra_info: String,
    source_file_name: String,
    source_file_line_number: i64,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl std::error::Error for Error {}

impl Error {
    pub(crate) fn new<SD, LD, EI, SFN>(
        error_type: ErrorType,
        short_description: SD,
        long_description: LD,
        extra_info: EI,
        source_file_name: SFN,
        source_file_line_number: i64,
    ) -> Self
    where
        SD: Into<String>,
        LD: Into<String>,
        EI: Into<String>,
        SFN: Into<String>,
    {
        Self {
            error_type,
            short_description: short_description.into(),
            long_description: long_description.into(),
            extra_info: extra_info.into(),
            source_file_name: source_file_name.into(),
            source_file_line_number,
        }
    }

    pub(crate) fn try_from_pdiscan_error(
        scanning_handle: *mut c_void,
        error_code: pdiscan_errors,
    ) -> std::result::Result<Error, String> {
        let error_type: ErrorType = error_code.try_into()?;
        let mut short_description: [c_char; 256] = [0; 256];
        let mut long_description: [c_char; 256] = [0; 256];
        let mut extra_info: [c_char; 256] = [0; 256];
        let mut source_file_name: [c_char; 256] = [0; 256];
        let mut source_file_line_number: c_long = 0;

        let short_description = unsafe {
            PdGetErrorShortDescription(scanning_handle, error_code, short_description.as_mut_ptr());
            string_from_c_char_slice(&short_description)
        };

        let long_description = unsafe {
            PdGetErrorLongDescription(scanning_handle, error_code, long_description.as_mut_ptr());
            string_from_c_char_slice(&long_description)
        };

        let extra_info = unsafe {
            PdGetErrorExtraInfo(scanning_handle, extra_info.as_mut_ptr());
            string_from_c_char_slice(&extra_info)
        };

        let source_file_name = unsafe {
            PdGetErrorSourceFileName(scanning_handle, source_file_name.as_mut_ptr());
            string_from_c_char_slice(&source_file_name)
        };

        let source_file_line_number = unsafe {
            PdGetErrorSourceFileLineNumber(scanning_handle, &mut source_file_line_number);
            source_file_line_number
        };

        Ok(Error::new(
            error_type,
            short_description,
            long_description,
            extra_info,
            source_file_name,
            source_file_line_number,
        ))
    }
}
