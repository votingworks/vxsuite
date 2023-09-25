#![allow(dead_code)]

use std::{
    cell::RefCell,
    ffi::{c_char, c_int, c_long, c_uint, c_void},
    ops::Deref,
    ptr::null_mut,
    sync::{
        mpsc::{self, Receiver, Sender},
        Arc, Mutex,
    },
    time::Duration,
};

use image::{DynamicImage, GenericImageView};

use crate::pdiscan::{
    dib::read_bitmap_from_ptr,
    libpdiscan::{
        pdiscan_errors, PdAllocateScanningHandle, PdConnectToScanner, PdDeallocateScanningHandle,
        PdDisconnectFromScanner,
    },
};

use super::{
    error::{Error, ErrorType},
    ffi::string_from_c_char_slice,
    libpdiscan::{
        pd_buffer_types, pd_callback_types, pd_color_depths, pd_diagnostic_function_types,
        pd_eject_directions, pd_page_types, pd_process_types, pdiscan_tags, PdDiagnosticFunction,
        PdDisableFeeder, PdEjectDocument, PdEnableFeeder, PdGetFirmwareInformation,
        PdGetScannerStatus, PdGetTagLong, PdGetTagString, PdInstallCallback, PdSetTagLong,
        ScanningHandle,
    },
    result::Result,
};

static mut SCANNER: Mutex<Option<Arc<Scanner>>> = Mutex::new(None);

#[no_mangle]
#[allow(unused_variables)]
extern "C" fn page_process_callback(
    page_number: c_long,
    e_page: pd_page_types,
    e_proc: pd_process_types,
    i_element: c_int,
    i_max_elements: c_int,
    i_size: c_int,
    p_buf: *mut c_void,
    e_buf: pd_buffer_types,
    user_data: *mut c_void,
) {
}

#[no_mangle]
#[allow(unused_variables)]
extern "C" fn scanning_error_callback(
    scanning_error: pdiscan_errors,
    extra_info: *mut c_char,
    user_data: *mut c_void,
) {
    println!("scanning_error_callback: {:?}", scanning_error);
}

#[derive(Clone)]
pub struct ScanDocument {
    pub page_number: c_long,
    pub front_side_image: Option<DynamicImage>,
    pub back_side_image: Option<DynamicImage>,
}

impl std::fmt::Debug for ScanDocument {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ScanDocument")
            .field("page_number", &self.page_number)
            .field(
                "front_side_image",
                &self.front_side_image.as_ref().map(|i| i.dimensions()),
            )
            .field(
                "back_side_image",
                &self.back_side_image.as_ref().map(|i| i.dimensions()),
            )
            .finish()
    }
}

#[no_mangle]
extern "C" fn page_end_callback(
    page_number: c_long,
    front_side_dib: *mut c_void,
    back_side_dib: *mut c_void,
    _abort_requested: *mut c_uint,
    _user_data: *mut c_void,
) {
    let scanner_mutex_guard = unsafe { SCANNER.lock().unwrap() };
    let scanner = match scanner_mutex_guard.deref() {
        Some(scanner) => scanner,
        None => {
            return;
        }
    };

    let front_side_image = if front_side_dib.is_null() {
        None
    } else {
        match unsafe { read_bitmap_from_ptr(front_side_dib) } {
            Ok(image) => Some(image),
            Err(e) => {
                eprintln!("error reading front side image: {:?}", e);
                return;
            }
        }
    };

    let back_side_image = if back_side_dib.is_null() {
        None
    } else {
        match unsafe { read_bitmap_from_ptr(back_side_dib) } {
            Ok(image) => Some(image),
            Err(e) => {
                eprintln!("error reading back side image: {:?}", e);
                return;
            }
        }
    };

    scanner.page_end_callback(ScanDocument {
        page_number,
        front_side_image,
        back_side_image,
    });
}

#[no_mangle]
extern "C" fn page_eject_callback(
    _page_number: c_long,
    eject_direction: *mut pd_eject_directions,
    _user_data: *mut c_void,
) {
    let scanner_mutex_guard = unsafe { SCANNER.lock().unwrap() };
    let scanner = match scanner_mutex_guard.deref() {
        Some(scanner) => scanner,
        None => {
            return;
        }
    };

    std::thread::sleep(scanner.get_eject_delay());

    unsafe {
        *eject_direction = match scanner.get_eject_direction() {
            EjectDirection::FrontDrop => pd_eject_directions::PD_EJECT_DIRECTION_FRONT,
            EjectDirection::BackDrop => pd_eject_directions::PD_EJECT_DIRECTION_BACK,
            EjectDirection::FrontHold => pd_eject_directions::PD_EJECT_DIRECTION_FRONT_HOLD,
            EjectDirection::BackHold => pd_eject_directions::PD_EJECT_DIRECTION_WAIT,
        };
    }
}

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum ScanMode {
    Synchronous = 0,
    Asynchronous = 1,
}

#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub enum DuplexMode {
    Simplex = 0,
    Duplex = 1,
}

impl TryFrom<i64> for DuplexMode {
    type Error = String;

    fn try_from(value: i64) -> std::result::Result<Self, Self::Error> {
        match value {
            mode if mode == DuplexMode::Simplex as i64 => Ok(DuplexMode::Simplex),
            mode if mode == DuplexMode::Duplex as i64 => Ok(DuplexMode::Duplex),
            _ => Err("invalid duplex mode".to_string()),
        }
    }
}

#[derive(Debug)]
pub struct Settings {
    pub scan_mode: ScanMode,
    pub duplex_mode: DuplexMode,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            scan_mode: ScanMode::Asynchronous,
            duplex_mode: DuplexMode::Duplex,
        }
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub enum EjectDirection {
    FrontDrop,
    FrontHold,
    #[default]
    BackDrop,
    BackHold,
}

#[derive(Debug, PartialEq, Default)]
pub struct ScannerStatus {
    pub rear_left_sensor_covered: bool,
    pub rear_right_sensor_covered: bool,
    pub brander_position_sensor_covered: bool,
    /// This option is usually enabled.
    pub high_speed_mode: bool,
    pub download_needed: bool,
    /// Requires non-standard special hardware to detect this condition
    pub cover_open: bool,
    pub scanner_feeder_enabled: bool,
    pub front_left_sensor_covered: bool,
    pub front_m1_sensor_covered: bool,
    pub front_m2_sensor_covered: bool,
    pub front_m3_sensor_covered: bool,
    pub front_m4_sensor_covered: bool,
    pub front_m5_sensor_covered: bool,
    pub front_right_sensor_covered: bool,
    pub scanner_ready: bool,
    pub xmt_aborted: bool,
    pub ticket_jam: bool,
    pub scan_array_pixel_error: bool,
    pub in_diagnostic_mode: bool,
    pub document_in_scanner: bool,
    pub calibration_of_unit_needed: bool,
}

fn get_string_tag_value(scanning_handle: ScanningHandle, tag_id: pdiscan_tags) -> Result<String> {
    let mut tag_value: [c_char; 256] = [0; 256];
    let mut tag_value_length = tag_value.len() as c_long;

    let errno = unsafe {
        PdGetTagString(
            scanning_handle,
            tag_id,
            tag_value.as_mut_ptr(),
            &mut tag_value_length,
        )
    };

    if errno != pdiscan_errors::PDISCAN_ERR_NONE {
        return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
    }

    let tag_value = string_from_c_char_slice(&tag_value[..tag_value_length as usize]);
    Ok(tag_value)
}

fn get_long_tag_value(scanning_handle: ScanningHandle, tag_id: pdiscan_tags) -> Result<i64> {
    let mut tag_value: c_long = 0;

    let errno = unsafe { PdGetTagLong(scanning_handle, tag_id, &mut tag_value) };

    if errno != pdiscan_errors::PDISCAN_ERR_NONE {
        return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
    }

    Ok(tag_value)
}

fn set_long_tag_value(
    scanning_handle: ScanningHandle,
    tag_id: pdiscan_tags,
    tag_value: i64,
) -> Result<()> {
    let errno = unsafe { PdSetTagLong(scanning_handle, tag_id, tag_value) };

    if errno != pdiscan_errors::PDISCAN_ERR_NONE {
        return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
    }

    Ok(())
}

#[derive(Debug)]
pub struct Scanner {
    inner: RefCell<ScannerInner>,
    settings: Settings,
    tx: Sender<ScanDocument>,
    rx: Receiver<ScanDocument>,
}

#[derive(Debug)]
struct ScannerInner {
    scanning_handle: ScanningHandle,
    connected: bool,
    eject_direction: EjectDirection,
    eject_delay: Duration,
}

impl Scanner {
    pub fn connect(settings: Settings) -> Result<Arc<Self>> {
        {
            let scanner_mutex_guard = unsafe { SCANNER.lock().unwrap() };
            if scanner_mutex_guard.deref().is_some() {
                return Err(Error::new(
                    ErrorType::CommandNotSupported,
                    "scanner already connected",
                    "scanner already connected",
                    "",
                    file!(),
                    line!() as i64,
                ));
            }
        }

        let mut extra_info: [c_char; 256] = [0; 256];
        let mut scanning_handle: ScanningHandle = null_mut();

        let errno =
            unsafe { PdAllocateScanningHandle(&mut scanning_handle, extra_info.as_mut_ptr()) };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
        }

        let errno = unsafe {
            let callback_ptr = page_process_callback as *mut c_void;
            PdInstallCallback(
                scanning_handle,
                pd_callback_types::PD_CALLBACK_TYPE_PROCESSED_DATA,
                callback_ptr,
                null_mut(),
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            // TODO: deallocate the scanning handle
            return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
        }

        let errno = unsafe {
            let callback_ptr = page_end_callback as *mut c_void;
            PdInstallCallback(
                scanning_handle,
                pd_callback_types::PD_CALLBACK_TYPE_PAGE_END,
                callback_ptr,
                null_mut(),
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            // TODO: deallocate the scanning handle
            return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
        }

        let errno = unsafe {
            let callback_ptr = page_eject_callback as *mut c_void;
            PdInstallCallback(
                scanning_handle,
                pd_callback_types::PD_CALLBACK_TYPE_PAGE_EJECT,
                callback_ptr,
                null_mut(),
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            // TODO: deallocate the scanning handle
            return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
        }

        let errno = unsafe {
            let callback_ptr = scanning_error_callback as *mut c_void;
            PdInstallCallback(
                scanning_handle,
                pd_callback_types::PD_CALLBACK_TYPE_SCANNING_ERROR,
                callback_ptr,
                null_mut(),
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            // TODO: deallocate the scanning handle
            return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
        }

        let mut scanner_name: [c_char; 256] = [0; 256];
        let errno = unsafe {
            PdConnectToScanner(
                scanning_handle,
                scanner_name.as_mut_ptr(),
                settings.scan_mode as c_uint,
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            // TODO: deallocate the scanning handle
            return Err(Error::try_from_pdiscan_error(scanning_handle, errno).unwrap());
        }

        set_long_tag_value(
            scanning_handle,
            pdiscan_tags::PDISCAN_TAG_DUPLEX,
            settings.duplex_mode as i64,
        )?;

        let (tx, rx) = mpsc::channel();
        let scanner = Self {
            inner: RefCell::new(ScannerInner {
                scanning_handle,
                connected: true,
                eject_direction: EjectDirection::default(),
                eject_delay: Duration::from_millis(0),
            }),
            settings,
            tx,
            rx,
        };

        #[allow(clippy::arc_with_non_send_sync)]
        let scanner_arc = Arc::new(scanner);
        unsafe {
            SCANNER.lock().unwrap().replace(scanner_arc.clone());
        }
        Ok(scanner_arc)
    }

    fn scanning_handle(&self) -> *mut c_void {
        self.inner.borrow().scanning_handle
    }

    pub fn set_feeder_enabled(&self, enabled: bool) -> Result<()> {
        let status = self.get_scanner_status()?;

        if status.scanner_feeder_enabled == enabled {
            return Ok(());
        }

        let errno = if enabled {
            unsafe { PdEnableFeeder(self.scanning_handle()) }
        } else {
            unsafe { PdDisableFeeder(self.scanning_handle()) }
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        Ok(())
    }

    pub fn set_eject_direction(&self, eject_direction: EjectDirection) {
        self.inner.borrow_mut().eject_direction = eject_direction;
    }

    pub fn get_eject_direction(&self) -> EjectDirection {
        self.inner.borrow().eject_direction
    }

    pub fn set_eject_delay(&self, eject_delay: Duration) {
        self.inner.borrow_mut().eject_delay = eject_delay;
    }

    pub fn get_eject_delay(&self) -> Duration {
        self.inner.borrow().eject_delay
    }

    pub fn get_scanner_name(&self) -> Result<String> {
        get_string_tag_value(
            self.scanning_handle(),
            pdiscan_tags::PDISCAN_TAG_SCANNER_NAME,
        )
    }

    pub fn get_resolution(&self) -> Result<i64> {
        get_long_tag_value(self.scanning_handle(), pdiscan_tags::PDISCAN_TAG_RESOLUTION)
    }

    pub fn set_resolution(&self, resolution: i64) -> Result<()> {
        set_long_tag_value(
            self.scanning_handle(),
            pdiscan_tags::PDISCAN_TAG_RESOLUTION,
            resolution,
        )
    }

    pub fn get_color_depth(&self) -> Result<ColorDepth> {
        let color_depth = get_long_tag_value(
            self.scanning_handle(),
            pdiscan_tags::PDISCAN_TAG_COLOR_DEPTH,
        )?;
        pd_color_depths::try_from(color_depth)
            .and_then(ColorDepth::try_from)
            .map_err(|e| {
                Error::new(
                    ErrorType::InvalidParam,
                    "invalid color depth",
                    format!("color depth value from scanner is invalid: {}", e),
                    "",
                    file!(),
                    line!() as i64,
                )
            })
    }

    pub fn set_color_depth(&self, color_depth: ColorDepth) -> Result<()> {
        let color_depth: pd_color_depths = color_depth.into();
        set_long_tag_value(
            self.scanning_handle(),
            pdiscan_tags::PDISCAN_TAG_COLOR_DEPTH,
            color_depth as i64,
        )
    }

    pub fn set_jam_length(&self, jam_length: i64) -> Result<()> {
        set_long_tag_value(
            self.scanning_handle(),
            pdiscan_tags::PDISCAN_TAG_JAMLENGTH,
            jam_length,
        )
    }

    pub fn get_duplex_mode(&self) -> Result<DuplexMode> {
        let duplex_mode =
            get_long_tag_value(self.scanning_handle(), pdiscan_tags::PDISCAN_TAG_DUPLEX)?;
        DuplexMode::try_from(duplex_mode).map_err(|e| {
            Error::new(
                ErrorType::InvalidParam,
                "invalid duplex mode",
                format!("duplex mode value from scanner is invalid: {}", e),
                "",
                file!(),
                line!() as i64,
            )
        })
    }

    pub fn set_duplex_mode(&self, duplex_mode: DuplexMode) -> Result<()> {
        set_long_tag_value(
            self.scanning_handle(),
            pdiscan_tags::PDISCAN_TAG_DUPLEX,
            duplex_mode as i64,
        )
    }

    pub fn get_firmware_information(&self) -> Result<FirmwareInformation> {
        let mut scanner_type: [c_char; 256] = [0; 256];
        let mut firmware_version: [c_char; 256] = [0; 256];
        let mut cpld_version: [c_char; 256] = [0; 256];

        let errno = unsafe {
            PdGetFirmwareInformation(
                self.scanning_handle(),
                scanner_type.as_mut_ptr(),
                firmware_version.as_mut_ptr(),
                cpld_version.as_mut_ptr(),
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        let scanner_type = string_from_c_char_slice(&scanner_type);
        let firmware_version = string_from_c_char_slice(&firmware_version);
        let cpld_version = string_from_c_char_slice(&cpld_version);

        Ok(FirmwareInformation {
            scanner_type,
            firmware_version,
            cpld_version,
        })
    }

    pub fn get_scanner_status(&self) -> Result<ScannerStatus> {
        let mut scanner_status_buffer: [c_char; 24] = [0; 24];

        let errno = unsafe {
            PdGetScannerStatus(self.scanning_handle(), scanner_status_buffer.as_mut_ptr())
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        let check_values_set_properly = scanner_status_buffer[7] == '1' as c_char
            && scanner_status_buffer[15] == '1' as c_char
            && scanner_status_buffer[23] == '1' as c_char;

        if !check_values_set_properly {
            return Err(Error::new(
                ErrorType::InvalidParam,
                "invalid scanner status",
                format!("invalid scanner status: {scanner_status_buffer:?}"),
                "",
                file!(),
                line!() as i64,
            ));
        }

        Ok(ScannerStatus {
            rear_left_sensor_covered: scanner_status_buffer[0] == '1' as c_char,
            rear_right_sensor_covered: scanner_status_buffer[1] == '1' as c_char,
            brander_position_sensor_covered: scanner_status_buffer[2] == '1' as c_char,
            /// This option is usually enabled.
            high_speed_mode: scanner_status_buffer[3] == '1' as c_char,
            download_needed: scanner_status_buffer[4] == '1' as c_char,
            /// Requires non-standard special hardware to detect this condition
            cover_open: scanner_status_buffer[5] == '1' as c_char,
            scanner_feeder_enabled: scanner_status_buffer[6] == '1' as c_char,

            front_left_sensor_covered: scanner_status_buffer[8] == '1' as c_char,
            front_m1_sensor_covered: scanner_status_buffer[9] == '1' as c_char,
            front_m2_sensor_covered: scanner_status_buffer[10] == '1' as c_char,
            front_m3_sensor_covered: scanner_status_buffer[11] == '1' as c_char,
            front_m4_sensor_covered: scanner_status_buffer[12] == '1' as c_char,
            front_m5_sensor_covered: scanner_status_buffer[13] == '1' as c_char,
            front_right_sensor_covered: scanner_status_buffer[14] == '1' as c_char,

            scanner_ready: scanner_status_buffer[16] == '1' as c_char,
            xmt_aborted: scanner_status_buffer[17] == '1' as c_char,
            ticket_jam: scanner_status_buffer[18] == '1' as c_char,
            scan_array_pixel_error: scanner_status_buffer[19] == '1' as c_char,
            in_diagnostic_mode: scanner_status_buffer[20] == '1' as c_char,
            document_in_scanner: scanner_status_buffer[21] == '1' as c_char,
            calibration_of_unit_needed: scanner_status_buffer[22] == '1' as c_char,
        })
    }

    pub fn load_document(&self) -> Result<()> {
        let errno = unsafe {
            PdDiagnosticFunction(
                self.scanning_handle(),
                pd_diagnostic_function_types::PD_DIAG_FUNC_TYPE_LOAD_DOCUMENT,
                null_mut(),
                null_mut(),
                null_mut(),
                null_mut(),
                null_mut(),
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        Ok(())
    }

    pub fn wait_for_document(&self, timeout: Duration) -> Result<ScanDocument> {
        self.rx.recv_timeout(timeout).map_err(|e| {
            Error::new(
                ErrorType::AbortScan,
                "error waiting for document",
                format!("error waiting for document: {}", e),
                "",
                file!(),
                line!() as i64,
            )
        })
    }

    pub fn reject_and_hold_document_front(&self) -> Result<()> {
        let errno = unsafe {
            PdEjectDocument(
                self.scanning_handle(),
                pd_eject_directions::PD_EJECT_DIRECTION_FRONT_HOLD,
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        Ok(())
    }

    pub fn reject_document_front(&self) -> Result<()> {
        let errno = unsafe {
            PdEjectDocument(
                self.scanning_handle(),
                pd_eject_directions::PD_EJECT_DIRECTION_FRONT,
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        Ok(())
    }

    pub fn accept_document_back(&self) -> Result<()> {
        let errno = unsafe {
            PdEjectDocument(
                self.scanning_handle(),
                pd_eject_directions::PD_EJECT_DIRECTION_BACK,
            )
        };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        Ok(())
    }

    fn page_end_callback(&self, scan_document: ScanDocument) {
        if let Err(e) = self.tx.send(scan_document) {
            eprintln!("error sending scan document to channel: {}", e);
        }
    }

    pub fn disconnect(&self) -> Result<()> {
        let errno = unsafe { PdDisconnectFromScanner(self.scanning_handle()) };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        let errno = unsafe { PdDeallocateScanningHandle(self.scanning_handle()) };

        if errno != pdiscan_errors::PDISCAN_ERR_NONE {
            return Err(Error::try_from_pdiscan_error(self.scanning_handle(), errno).unwrap());
        }

        let mut inner = self.inner.borrow_mut();
        inner.scanning_handle = std::ptr::null_mut();
        inner.connected = false;
        Ok(())
    }
}

impl Drop for Scanner {
    fn drop(&mut self) {
        // TODO: deallocate the scanning handle if it hasn't been deallocated yet
        let _ = self.disconnect();
    }
}

#[derive(Debug)]
pub struct FirmwareInformation {
    scanner_type: String,
    firmware_version: String,
    cpld_version: String,
}

#[derive(Debug)]
pub enum ColorDepth {
    Bitonal,
    Grayscale4Bit,
    Grayscale8Bit,
    Color8Bit,
    Color24Bit,
    GrayDual8Bit,
    GrayRed8Bit,
    GrayBlue8Bit,
    GrayInfrared8Bit,
    GrayUltraviolet8Bit,
    ColorGray32Bit,
}

impl TryFrom<pd_color_depths> for ColorDepth {
    type Error = String;

    fn try_from(value: pd_color_depths) -> std::result::Result<Self, Self::Error> {
        match value {
            pd_color_depths::PD_COLOR_DEPTH_BITONAL => Ok(ColorDepth::Bitonal),
            pd_color_depths::PD_COLOR_DEPTH_4_BIT_GRAYSCALE => Ok(ColorDepth::Grayscale4Bit),
            pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYSCALE => Ok(ColorDepth::Grayscale8Bit),
            pd_color_depths::PD_COLOR_DEPTH_8_BIT_COLOR => Ok(ColorDepth::Color8Bit),
            pd_color_depths::PD_COLOR_DEPTH_24_BIT_COLOR => Ok(ColorDepth::Color24Bit),
            pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYDUAL => Ok(ColorDepth::GrayDual8Bit),
            pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYRED => Ok(ColorDepth::GrayRed8Bit),
            pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYBLUE => Ok(ColorDepth::GrayBlue8Bit),
            pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYIR => Ok(ColorDepth::GrayInfrared8Bit),
            pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYUV => Ok(ColorDepth::GrayUltraviolet8Bit),
            pd_color_depths::PD_COLOR_DEPTH_32_BIT_COLORGRAY => Ok(ColorDepth::ColorGray32Bit),
            _ => Err("invalid color depth".to_string()),
        }
    }
}

impl From<ColorDepth> for pd_color_depths {
    fn from(value: ColorDepth) -> Self {
        match value {
            ColorDepth::Bitonal => pd_color_depths::PD_COLOR_DEPTH_BITONAL,
            ColorDepth::Grayscale4Bit => pd_color_depths::PD_COLOR_DEPTH_4_BIT_GRAYSCALE,
            ColorDepth::Grayscale8Bit => pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYSCALE,
            ColorDepth::Color8Bit => pd_color_depths::PD_COLOR_DEPTH_8_BIT_COLOR,
            ColorDepth::Color24Bit => pd_color_depths::PD_COLOR_DEPTH_24_BIT_COLOR,
            ColorDepth::GrayDual8Bit => pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYDUAL,
            ColorDepth::GrayRed8Bit => pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYRED,
            ColorDepth::GrayBlue8Bit => pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYBLUE,
            ColorDepth::GrayInfrared8Bit => pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYIR,
            ColorDepth::GrayUltraviolet8Bit => pd_color_depths::PD_COLOR_DEPTH_8_BIT_GRAYUV,
            ColorDepth::ColorGray32Bit => pd_color_depths::PD_COLOR_DEPTH_32_BIT_COLORGRAY,
        }
    }
}
