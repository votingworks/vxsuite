#![allow(dead_code)]

use std::ffi::{c_char, c_int, c_long, c_uint, c_void};

#[allow(non_camel_case_types, dead_code)]
#[repr(C)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pdiscan_errors {
    PDISCAN_ERR_ENUM_LBOUND = -1,
    // No error; the function completed successfully.
    PDISCAN_ERR_NONE,
    PDISCAN_ERR_INTERNAL,
    PDISCAN_ERR_FUNCTION_CALL_SEQUENCE,
    PDISCAN_ERR_INVALID_PARAM,
    PDISCAN_ERR_FILE_OPEN_READ,
    PDISCAN_ERR_FILE_OPEN_WRITE,
    PDISCAN_ERR_FILE_READ,
    PDISCAN_ERR_FILE_WRITE,
    PDISCAN_ERR_OUT_OF_MEMORY,
    PDISCAN_ERR_CANNOT_LOAD_LIBRARY,
    PDISCAN_ERR_UNEXPECTED, // 10
    PDISCAN_ERR_ASSERTION_FAILURE,
    PDISCAN_ERR_SCANNER_NOT_FOUND,
    PDISCAN_ERR_FEEDER_EMPTY,
    PDISCAN_ERR_PAPER_JAM,
    PDISCAN_ERR_SCANNER_ERROR,
    PDISCAN_ERR_DOUBLE_FEED,
    PDISCAN_ERR_COVER_OPEN,
    PDISCAN_ERR_INVALID_TAG,
    PDISCAN_ERR_STRING_BUFFER_TOO_SMALL,
    PDISCAN_ERR_THREAD_FATAL, // 20
    PDISCAN_ERR_DISCONNECTED,
    PDISCAN_ERR_NOT_SUPPORTED_WINDOWS,
    PDISCAN_ERR_NOT_SUPPORTED_ASYNCH,
    PDISCAN_ERR_NOT_SUPPORTED_RAWMODE,
    PDISCAN_ERR_STATUS_NOT_OK,
    PDISCAN_ERR_BEGINSCAN,
    PDISCAN_ERR_ENDSCAN,
    PDISCAN_ERR_REAR_SENSORS_BLOCKED,
    PDISCAN_ERR_EJECT_PAUSED,
    PDISCAN_ERR_EJECT_RESUMED, // 30
    PDISCAN_ERR_LATCH_RELEASED,
    PDISCAN_ERR_COVER_CLOSED,
    PDISCAN_ERR_IMAGE,
    PDISCAN_ERR_DESKEW,
    PDISCAN_ERR_AUTOCROP,
    PDISCAN_ERR_DISCONNECT_NEEDED,
    PDISCAN_ERR_IMAGE_ENHANCEMENT,
    PDISCAN_ERR_COMMAND_NOT_SUPPORTED,
    PDISCAN_ERR_ABORTSCAN,
    PDISCAN_ERR_FEEDERDISABLED,
    PDISCAN_ERR_DOUBLE_FEED_TROUBLE,
    PDISCAN_ERR_SCANNER_OVERFLOW,
    PDISCAN_ERR_TPH_STOP_XFER,
    PDISCAN_ERR_TPH_TOO_LONG,
    PDISCAN_ERR_TPH_HEAT,
    PDISCAN_ERR_TPH_PAPER_LOADED,

    PDISCAN_ERR_OPTICON = 70, // opticon barcode reader errors... 70 to 79...
    PDISCAN_ERR_OPTION1,
    PDISCAN_ERR_OPTION2,
    PDISCAN_ERR_OPTION3,
    PDISCAN_ERR_OPTION4,
    PDISCAN_ERR_OPTION5,
    PDISCAN_ERR_OPTION6,
    PDISCAN_ERR_OPTION7,
    PDISCAN_ERR_OPTION8,
    PDISCAN_ERR_OPTION9,
    PDISCAN_ERR_ENUM_UBOUND,
}

#[allow(non_camel_case_types, dead_code)]
#[repr(C)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pdiscan_tags {
    PDISCAN_TAG_ENUM_LBOUND = 0,
    PDISCAN_TAG_SUPPORTED_TAGS,              // Enumeration, read-only.
    PDISCAN_TAG_SCANNER_NAME,                // String, unrestricted choices, read-only.
    PDISCAN_TAG_RESOLUTION,                  // Long, list.
    PDISCAN_TAG_PAPER_SOURCE,                // Enumeration, list.
    PDISCAN_TAG_DUPLEX,                      // Boolean, list.
    PDISCAN_TAG_COLOR_DEPTH,                 // Enumeration, list.
    PDISCAN_TAG_ORIENTATION,                 // Enumeration, list.
    PDISCAN_TAG_PAGE_SIZE,                   // Enumeration, list.
    PDISCAN_TAG_CONTRAST_PANEL,              // Boolean, list.
    PDISCAN_TAG_CONTRAST_FRONT,              // Long, range.
    PDISCAN_TAG_CONTRAST_BACK,               // Long, range.
    PDISCAN_TAG_BRIGHTNESS_PANEL,            // Boolean, list.
    PDISCAN_TAG_BRIGHTNESS_FRONT,            // Long, range.
    PDISCAN_TAG_BRIGHTNESS_BACK,             // Long, range.
    PDISCAN_TAG_ENDORSING,                   // Boolean, list.
    PDISCAN_TAG_IMPRINTING,                  // Boolean, list.
    PDISCAN_TAG_IMPRINTER_VERTICAL_OFFSET,   // Long, range.
    PDISCAN_TAG_IMPRINTER_HORIZONTAL_OFFSET, // Long, range.
    PDISCAN_TAG_DESKEW,                      // Boolean, list.
    PDISCAN_TAG_AUTOCROP,                    // Boolean, list.
    PDISCAN_TAG_READ_MICR_LINE,              // Boolean, list.
    PDISCAN_TAG_MICR_TYPE,                   // Enumeration, list.
    PDISCAN_TAG_MICR_RESULTS,                // String, unrestricted choices, read-only.
    PDISCAN_TAG_DOUBLE_FEED,                 // Boolean, list.
    PDISCAN_TAG_DOUBLE_FEED_SENSITIVITY,     // Long, range.
    PDISCAN_TAG_DOCUMENT_READ_LENGTH,        // Long, range.
    PDISCAN_TAG_IMPRINTER_HORIZONTAL_OFFSET_BASE, // Enumeration, list.
    PDISCAN_TAG_IMPRINTER_TEXT_ORIENTATION,  // Enumeration, list.
    PDISCAN_TAG_AUTO_EJECT,                  // Boolean, list.
    PDISCAN_TAG_PICKON_COMMAND,              // Boolend, list
    PDISCAN_TAG_HALFSPEED_ON,                // Boolean
    PDISCAN_TAG_SCAN_DELAY,                  // Long range
    PDISCAN_TAG_JAMLENGTH,                   // Long range
    PDISCAN_TAG_IMAGE_TEMP_PATH,             // String,
    PDISCAN_TAG_EJECT_ON_JAM,                // Enumeration, list.
    PDISCAN_TAG_RETRY_COUNT,                 // Long range
    PDISCAN_TAG_CONTROL_MESSAGES,            // Boolean, list
    PDISCAN_TAG_INTENSITY_RED_FRONT,         // Long, range.
    PDISCAN_TAG_INTENSITY_GREEN_FRONT,       // Long, range.
    PDISCAN_TAG_INTENSITY_BLUE_FRONT,        // Long, range.
    PDISCAN_TAG_INTENSITY_RED_BACK,          // Long, range.
    PDISCAN_TAG_INTENSITY_GREEN_BACK,        // Long, range.
    PDISCAN_TAG_INTENSITY_BLUE_BACK,         // Long, range.
    PDISCAN_TAG_GAMMA_RED_CORRECTION_FRONT,  // Long, range.
    PDISCAN_TAG_GAMMA_GREEN_CORRECTION_FRONT, // Long, range.
    PDISCAN_TAG_GAMMA_BLUE_CORRECTION_FRONT, // Long, range.
    PDISCAN_TAG_GAMMA_RED_CORRECTION_BACK,   // Long, range.
    PDISCAN_TAG_GAMMA_GREEN_CORRECTION_BACK, // Long, range.
    PDISCAN_TAG_GAMMA_BLUE_CORRECTION_BACK,  // Long, range.
    PDISCAN_TAG_CONTRAST_RED_FRONT,          // Long, range.
    PDISCAN_TAG_CONTRAST_GREEN_FRONT,        // Long, range.
    PDISCAN_TAG_CONTRAST_BLUE_FRONT,         // Long, range.
    PDISCAN_TAG_CONTRAST_RED_BACK,           // Long, range.
    PDISCAN_TAG_CONTRAST_GREEN_BACK,         // Long, range.
    PDISCAN_TAG_CONTRAST_BLUE_BACK,          // Long, range.
    PDISCAN_TAG_EJECTPAUSE,                  // Boolend, list
    PDISCAN_TAG_AUTO_EJECT_DIRECTION,        // Enumeration, list
    PDISCAN_TAG_DOUBLE_FEED_MINLENGTH,       //
    PDISCAN_TAG_MIN_FRONT_SENSOR_COUNT,      // long, range
    PDISCAN_TAG_REAR_EJECT_SPEED,
    /// long, renage
    PDISCAN_TAG_AUTOSTARTSCAN, // boolean --- default = true
    // Boolean list
    PDISCAN_TAG_EJECTDIR_DISABLE_FEEDER, // Enumeration, list, default = PD_EJECT_DIRECTION_BACK

    // Image rotation
    PDISCAN_TAG_ROTATEIMAGE, // 0 no rotate, 1 = 90, 2 =180, 3=270
    // serial number access
    PDISCAN_TAG_GET_SERIALNO, // serial number from the scanner --- 0 to 99999999
    // Get scanner max speed
    PDISCAN_TAG_GET_MAXDPM, // maxiumum documents per minute

    // SET IMAGE FORMAT
    PDISCAN_TAG_IMAGEFORMAT, // default is DIB (0), TIFF = 1, JPEG = 2, PNG = 3

    PDISCAN_TAG_PRINTDENSITY,
    PDISCAN_TAG_IGNORE_REAR_SENSORS, // Boolean, list.  Do NOT look at rear sensors.  This will allow dog-eared documents. Default is false

    // Horizontal window...
    PDISCAN_TAG_FRONT_OFFSET,
    PDISCAN_TAG_FRONT_SIZE,
    PDISCAN_TAG_BACK_OFFSET,
    PDISCAN_TAG_BACK_SIZE,

    PDISCAN_TAG_COLOR_DROP, // Enumeration, list

    PDISCAN_TAG_PRINTSPEED,
    PDISCAN_TAG_PRINTDIRECTION, // directin tage for the TP-850
    PDISCAN_TAG_PAPERLENGTH,
    PDISCAN_TAG_CROPTOPAPERLENGTH,
    PDISCAN_TAG_PRINTONLINE,

    PDISCAN_FIRMWARE_OPTIONS = 2000,          // Enumeration, list
    PDISCAN_FIRMWARE_CUSTOMER_CODE,           // Long, range
    PDISCAN_FIRMWARE_THRESHOLD_FRONT,         // Long, range
    PDISCAN_FIRMWARE_THRESHOLD_BACK,          // Long, range
    PDISCAN_FIRMWARE_BOOT_EJECT,              // Enumeration, list.
    PDISCAN_FIRMWARE_EJECT_PAUSED,            // Enumeration, list.
    PDISCAN_FIRMWARE_COVEROPEN_SWITCH,        // Enumeration, list.
    PDISCAN_FIRMWARE_GREEN_LEDS,              // Boolean, list.
    PDISCAN_FIRMWARE_FORWARD_FEED,            // Boolean, list.
    PDISCAN_FIRMWARE_BRANDER_INSTALLED,       // Boolean, list.
    PDISCAN_FIRMWARE_REVERSE_COM,             // Boolean, list.
    PDISCAN_FIRMWARE_NOTRANSFER_DIBS,         // Boolean, list.
    PDISCAN_FIRMWARE_REVERSE_MOTOR_DIRECTION, // Boolean, list.
    PDISCAN_FIRMWARE_ENABLE_PROCESSING,       // Boolean, list.
    PDISCAN_FIRMWARE_CUSTOM_CPU_SPEED,        // Boolean, list.
    PDISCAN_FIRMWARE_BOARD_CLOCK_MHZ,         // Long, range.
    PDISCAN_FIRMWARE_CPU_SPEED_DIVIDER,       // Enumeration, list
    PDISCAN_FIRMWARE_SDRAM_SPEED_DIVIDER,     // Long, range
    PDISCAN_FIRMWARE_PROC_DESKEW,             // Boolean, list.
    PDISCAN_FIRMWARE_PROC_MIN_SKEWANGLE,      // Long range.
    PDISCAN_FIRMWARE_PROC_CROP,               // Boolean, list.
    PDISCAN_FIRMWARE_PROC_BLACKBORDER,        // Boolean, list.
    PDISCAN_FIRMWARE_OMR_ENABLED,             // Boolean, list.
    PDISCAN_FIRMWARE_OMR_TICKET_TYPE,         // Enumeration, list.
    PDISCAN_FIRMWARE_OMR_CLOCK_POSITION,      // Enumeration, list.
    PDISCAN_FIRMWARE_OMR_DETECT_CLOCK,        // Boolean, list.
    PDISCAN_FIRMWARE_OMR_DATA_POSITION,       // Enumeration, list.
    PDISCAN_FIRMWARE_BARCODE_PASSES,          // Enumeration, list.
    PDISCAN_FIRMWARE_BARCODE_ENABLED,         // Boolean, list.
    PDISCAN_FIRMWARE_BARCODE_TYPE,            // Enumeration, list.
    PDISCAN_FIRMWARE_BARCODE_ORIENTATION,     // Enumeration, list.
    PDISCAN_FIRMWARE_BARCODE_BEAM,            // Long range.
    PDISCAN_FIRMWARE_BARCODE_QUIETZONE,       // Long range.
    PDISCAN_FIRMWARE_BARCODE_ATTEMPTS,        // Long range.
    PDISCAN_FIRMWARE_BARCODE_FIND_ALL,        // Boolean, list
    PDISCAN_FIRMWARE_BARCODE_CHECK_DIGIT,     // Boolean, list
    PDISCAN_FIRMWARE_BARCODE_THRESHOLD,       // Long range.
    PDISCAN_FIRMWARE_BARCODE_LOOSE,           // Enumeration, list.
    PDISCAN_FIRMWARE_BARCODE_FIXED_LENGTH,    // Long range
    PDISCAN_FIRMWARE_VMR138_ENABLED,          // Boolean, list.
    PDISCAN_FIRMWARE_VMR138_TICKET_TYPE,      // Enumeration, list.
    PDISCAN_FIRMWARE_VMR138_CLOCK_POSITION,   // Enumeration, list.
    PDISCAN_FIRMWARE_VMR138_DETECT_CLOCK,     // Boolean, list.
    PDISCAN_FIRMWARE_VMR138_DATA_POSITION,    // Enumeration, list.
    PDISCAN_FIRMWARE_VMR138_BAUDRATE,         // Enumeration, list.
    PDISCAN_FIRMWARE_VMR138_THRESHOLD,        // Long range
    PDISCAN_FIRMWARE_BLUE_PULSEWIDTH_FRONT,   // Long range.
    PDISCAN_FIRMWARE_GREEN_PULSEWIDTH_FRONT,  // Long range.
    PDISCAN_FIRMWARE_RED_PULSEWIDTH_FRONT,    // Long range.
    PDISCAN_FIRMWARE_BLUE_PULSEWIDTH_BACK,    // Long range.
    PDISCAN_FIRMWARE_GREEN_PULSEWIDTH_BACK,   // Long range.
    PDISCAN_FIRMWARE_RED_PULSEWIDTH_BACK,     // Long range.

    PDISCAN_FIRMWARE_BLUE_PULSEWIDTH_FRONT_LO, // Long range.
    PDISCAN_FIRMWARE_GREEN_PULSEWIDTH_FRONT_LO, // Long range.
    PDISCAN_FIRMWARE_RED_PULSEWIDTH_FRONT_LO,  // Long range.
    PDISCAN_FIRMWARE_BLUE_PULSEWIDTH_BACK_LO,  // Long range.
    PDISCAN_FIRMWARE_GREEN_PULSEWIDTH_BACK_LO, // Long range.
    PDISCAN_FIRMWARE_RED_PULSEWIDTH_BACK_LO,   // Long range.

    PDISCAN_FIRMWARE_VH_DAC_FRONT,
    PDISCAN_FIRMWARE_VL_DAC_FRONT,
    PDISCAN_FIRMWARE_VH_DAC_BACK,
    PDISCAN_FIRMWARE_VL_DAC_BACK,
    PDISCAN_FIRMWARE_VH_DAC_FRONT_LO,
    PDISCAN_FIRMWARE_VL_DAC_FRONT_LO,
    PDISCAN_FIRMWARE_VH_DAC_BACK_LO,
    PDISCAN_FIRMWARE_VL_DAC_BACK_LO,

    // general infomation tags - non modifyable...
    PDISCAN_FIRMWARE_PCBA_ID,
    PDISCAN_FIRMWARE_PCBA_REVISION,
    PDISCAN_FIRMWARE_PCBA_CLOCK,

    PDISCAN_FIRMWARE_BF_REVISION,
    PDISCAN_FIRMWARE_BF_CLOCK,

    PDISCAN_FIRMWARE_SDRAM_CLOCK,
    PDISCAN_FIRMWARE_SDRAM_SIZE,

    PDISCAN_FIRMWARE_FLASH_SIZE,
    PDISCAN_FIRMWARE_FLASH_MANU_ID,
    PDISCAN_FIRMWARE_FLASH_DENSITY_CODE,
    PDISCAN_FIRMWARE_FLASH_FAMILY_CODE,

    PDISCAN_FIRMWARE_CIS_MAX_RESOLUTION,
    PDISCAN_FIRMWARE_CIS_LENGTH,
    PDISCAN_FIRMWARE_CIS_COUNT,

    PDISCAN_FIRMWARE_CIS_CONTROL,

    PDISCAN_TAG_ENUM_UBOUND, // Boolean, list.
}

#[allow(non_camel_case_types, dead_code)]
#[repr(C)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pd_color_depths {
    PD_COLOR_DEPTH_ENUM_LBOUND = 0,
    PD_COLOR_DEPTH_BITONAL,
    PD_COLOR_DEPTH_4_BIT_GRAYSCALE,
    PD_COLOR_DEPTH_8_BIT_GRAYSCALE,
    PD_COLOR_DEPTH_8_BIT_COLOR,
    PD_COLOR_DEPTH_24_BIT_COLOR,
    PD_COLOR_DEPTH_8_BIT_GRAYDUAL,
    PD_COLOR_DEPTH_8_BIT_GRAYRED,
    PD_COLOR_DEPTH_8_BIT_GRAYBLUE,
    PD_COLOR_DEPTH_8_BIT_GRAYIR,
    PD_COLOR_DEPTH_8_BIT_GRAYUV,
    PD_COLOR_DEPTH_32_BIT_COLORGRAY,
    PD_COLOR_DEPTH_ENUM_UBOUND,
}

impl TryFrom<c_long> for pd_color_depths {
    type Error = String;

    fn try_from(value: c_long) -> Result<Self, Self::Error> {
        match value {
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_BITONAL as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_BITONAL)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_4_BIT_GRAYSCALE as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_4_BIT_GRAYSCALE)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYSCALE as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYSCALE)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_8_BIT_COLOR as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_8_BIT_COLOR)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_24_BIT_COLOR as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_24_BIT_COLOR)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYDUAL as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYDUAL)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYRED as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYRED)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYBLUE as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYBLUE)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYIR as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYIR)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYUV as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYUV)
            }
            depth if depth == pd_color_depths::PD_COLOR_DEPTH_32_BIT_COLORGRAY as i64 => {
                Ok(pd_color_depths::PD_COLOR_DEPTH_32_BIT_COLORGRAY)
            }
            _ => Err("invalid color depth".to_string()),
        }
    }
}

#[allow(non_camel_case_types, dead_code)]
#[repr(C)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pd_callback_types {
    PD_CALLBACK_TYPE_ENUM_LBOUND = 0,
    PD_CALLBACK_TYPE_IMPRINTER_STRING,
    PD_CALLBACK_TYPE_PAGE_EJECT,
    PD_CALLBACK_TYPE_PAGE_END,
    PD_CALLBACK_TYPE_SCANNING_ERROR,
    PD_CALLBACK_TYPE_IMAGE_INFORMATION,
    PD_CALLBACK_TYPE_REMOVED_IMAGE_FILENAME,
    PD_CALLBACK_TYPE_CUSTOM_MESSAGE,
    PD_CALLBACK_TYPE_PROCESSED_DATA,
    PD_CALLBACK_TYPE_PRINT_DIB,
    PD_CALLBACK_TYPE_ENUM_UBOUND,
}

#[allow(non_camel_case_types, dead_code)]
#[repr(C)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pd_eject_directions {
    PD_EJECT_DIRECTION_ENUM_LBOUND = 0,
    PD_EJECT_DIRECTION_FRONT,
    PD_EJECT_DIRECTION_BACK,
    PD_EJECT_DIRECTION_WAIT,
    PD_EJECT_DIRECTION_RESCAN,
    PD_EJECT_DIRECTION_FRONT_HOLD,
    PD_EJECT_DIRECTION_FORCE_FRONT,
    PD_EJECT_DIRECTION_FORCE_BACK,
    // printer  ... no really eject but can be used...
    PD_EJECT_PRINT_CUT,
    PD_EJECT_PRINT_CONTINUE,
    //
    PD_EJECT_DIRECTION_ENUM_UBOUND,
}

#[allow(non_camel_case_types, dead_code)]
#[repr(C)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pd_process_types {
    PD_PROCESS_ENUM_LBOUND = 0,
    PD_PROCESS_OMR,
    PD_PROCESS_BARCODE,
    PD_ERROR_CODE,
    PD_PROCESS_ENUM_UBOUND,
}

#[allow(non_camel_case_types, dead_code)]
#[repr(C)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pd_buffer_types {
    PD_BUFFER_ENUM_LBOUND = 0,
    PD_BUFFER_ASCII,
    PD_BUFFER_BINARY,
    PD_BUFFER_ENUM_UBOUND,
}

#[allow(non_camel_case_types, dead_code)]
#[repr(C)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pd_page_types {
    PD_PAGE_ENUM_LBOUND = 0,
    PD_PAGE_FRONT,
    PD_PAGE_BACK,
    PD_BARCODE_READER, // physical bar code reader ...
    PD_PAGE_ENUM_UBOUND,
}

#[allow(non_camel_case_types, dead_code)]
#[repr(i64)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub(crate) enum pd_diagnostic_function_types {
    PD_DIAG_FUNC_TYPE_ENUM_LBOUND = 0,
    PD_DIAG_FUNC_TYPE_CONNECT_IN_RAW_MODE,
    PD_DIAG_FUNC_TYPE_SEND_RAW_MODE_MESSAGE,
    PD_DIAG_FUNC_TYPE_ERASE_FIRMWARE,
    PD_DIAG_FUNC_TYPE_UPLOAD_FIRMWARE_FROM_MEMORY,
    PD_DIAG_FUNC_TYPE_UPLOAD_FIRMWARE_FROM_FILE,
    PD_DIAG_FUNC_TYPE_GET_CALIBRATION_DATA,
    PD_DIAG_FUNC_TYPE_SET_CALIBRATION_DATA,
    PD_DIAG_FUNC_TYPE_CHANGE_DESCRAMBLING_STATE,
    PD_DIAG_FUNC_TYPE_CHANGE_CALIBRATION_STATE,
    PD_DIAG_FUNC_TYPE_DEALLOCATE_MEMORY_BUFFER,
    PD_DIAG_FUNC_TYPE_DESCRAMBLE_IMAGES,
    PD_DIAG_FUNC_TYPE_AUTOCROP_IMAGE,
    PD_DIAG_FUNC_TYPE_GET_SCANNER_STATUS,
    PD_DIAG_FUNC_TYPE_RESET_SCANNER,
    PD_DIAG_FUNC_TYPE_RESET_CPLD,
    PD_DIAG_FUNC_TYPE_CHANGE_LOGGING_STATE,
    PD_DIAG_FUNC_TYPE_PERFORM_IMAGE_CALIBRATION,
    PD_DIAG_FUNC_TYPE_PERFORM_SPEED_CALIBRATION,
    PD_DIAG_FUNC_TYPE_DESKEW_IMAGE,
    PD_DIAG_FUNC_TYPE_PERFORM_RAW_MODE_IMPRINTING,
    PD_DIAG_FUNC_TYPE_GET_SERIAL_NUMBER,
    PD_DIAG_FUNC_TYPE_SET_SERIAL_NUMBER,
    PD_DIAG_FUNC_TYPE_SET_BRIGHTNESS_AS_DEFAULT,
    PD_DIAG_FUNC_TYPE_EJECT_BACK,
    PD_DIAG_FUNC_TYPE_EJECT_FRONT,
    PD_DIAG_FUNC_TYPE_OVERRIDE_JAM,
    PD_DIAG_FUNC_TYPE_UNLOCK_COVER,
    PD_DIAG_FUNC_TYPE_GET_BARCODE_RESULT,
    PD_DIAG_FUNC_TYPE_GET_ONE_LINE,
    PD_DIAG_FUNC_TYPE_UPDATE_CALIBRATION_DATA,
    PD_DIAG_FUNC_TYPE_PERFORM_DOUBLE_FEED_CALIBRATION,
    PD_DIAG_FUNC_TYPE_TEST_CIS_LED,
    PD_DIAG_FUNC_TYPE_TEST_MOTOR,
    PD_DIAG_FUNC_TYPE_TEST_SENSORS,
    PD_DIAG_FUNC_TYPE_LOAD_DOCUMENT,
    PD_DIAG_FUNC_TYPE_SAVE_SCANNER_DEF,
    PD_DIAG_FUNC_TYPE_SAVE_SCANNER_RESULTS,
    PD_DIAG_FUNC_TYPE_PERFORM_DAC_CALIBRATION,
    PD_DIAG_FUNC_TYPE_PERFORM_PIXEL_CALIBRATION,
    PD_DIAG_FUNC_TYPE_ENUM_UBOUND,
}

pub(crate) type ScanningHandle = *mut c_void;

#[link(name = "PDIScan")]
extern "C" {
    pub(crate) fn PdAllocateScanningHandle(
        scanning_handle: *mut ScanningHandle,
        extra_info: *mut c_char,
    ) -> pdiscan_errors;
    pub(crate) fn PdDeallocateScanningHandle(scanning_handle: ScanningHandle) -> pdiscan_errors;
    pub(crate) fn PdConnectToScanner(
        scanning_handle: ScanningHandle,
        scanner_name: *const c_char,
        asynchronous_mode: c_uint,
    ) -> pdiscan_errors;
    pub(crate) fn PdDisconnectFromScanner(scanning_handle: ScanningHandle) -> pdiscan_errors;
    pub(crate) fn PdGetErrorShortDescription(
        scanning_handle: ScanningHandle,
        error_code: pdiscan_errors,
        ShortDescription: *mut c_char,
    );
    pub(crate) fn PdGetErrorLongDescription(
        scanning_handle: ScanningHandle,
        error_code: pdiscan_errors,
        long_description: *mut c_char,
    );
    pub(crate) fn PdGetErrorExtraInfo(scanning_handle: ScanningHandle, extra_info: *mut c_char);
    pub(crate) fn PdGetErrorSourceFileName(
        scanning_handle: ScanningHandle,
        source_file_name: *mut c_char,
    );
    pub(crate) fn PdGetErrorSourceFileLineNumber(
        scanning_handle: ScanningHandle,
        source_file_line_number: *mut c_long,
    );
    pub(crate) fn PdGetFirmwareInformation(
        scanning_handle: ScanningHandle,
        scanner_type: *mut c_char,
        firmware_version: *mut c_char,
        cpld_version: *mut c_char,
    ) -> pdiscan_errors;
    pub(crate) fn PdGetTagString(
        scanning_handle: ScanningHandle,
        tag_id: pdiscan_tags,
        value: *mut c_char,
        value_buffer_length: *mut c_long,
    ) -> pdiscan_errors;
    pub(crate) fn PdGetTagLong(
        scanning_handle: ScanningHandle,
        tag_id: pdiscan_tags,
        value: *mut c_long,
    ) -> pdiscan_errors;
    pub(crate) fn PdSetTagLong(
        scanning_handle: ScanningHandle,
        tag_id: pdiscan_tags,
        value: c_long,
    ) -> pdiscan_errors;
    pub(crate) fn PdInstallCallback(
        scanning_handle: ScanningHandle,
        which_callback: pd_callback_types,
        callback_function: *mut c_void,
        user_data: *mut c_void,
    ) -> pdiscan_errors;
    pub(crate) fn PdEnableFeeder(scanning_handle: ScanningHandle) -> pdiscan_errors;
    pub(crate) fn PdDisableFeeder(scanning_handle: ScanningHandle) -> pdiscan_errors;
    pub(crate) fn PdSaveImageToDisk(
        image_handle: *mut c_void,
        file_name: *const c_char,
    ) -> pdiscan_errors;
    pub(crate) fn PdMoveDocument(scanning_handle: ScanningHandle, steps: c_int) -> pdiscan_errors;
    pub(crate) fn PdEjectDocument(
        scanning_handle: ScanningHandle,
        eject_direction: pd_eject_directions,
    ) -> pdiscan_errors;
    pub(crate) fn PdGetScannerStatus(
        scanning_handle: ScanningHandle,
        status: *mut c_char,
    ) -> pdiscan_errors;
    pub(crate) fn PdScan(scanning_handle: ScanningHandle, single_page: c_uint) -> pdiscan_errors;
    pub(crate) fn PdDiagnosticFunction(
        scanning_handle: ScanningHandle,
        diagnostic_function_type: pd_diagnostic_function_types,
        param1: *mut c_char,
        param2: *mut c_char,
        param3: *mut c_char,
        param4: *mut c_char,
        param5: *mut c_char,
    ) -> pdiscan_errors;
}
