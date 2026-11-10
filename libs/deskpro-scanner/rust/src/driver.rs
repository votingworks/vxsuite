//! Safe wrapper around the `InoTec` driver.
//!
//! The vendor structs are packed, so fields are read with `read_unaligned`. Buffer ownership
//! differs per callback: control messages and images are ours to free, log strings are not.
//! Callbacks carry no user data, so at most one [`Driver`] exists per process.

#![allow(clippy::missing_errors_doc)]

use std::borrow::Cow;
use std::ffi::{CStr, CString, c_char, c_int, c_void};
use std::fmt;
use std::marker::PhantomData;
use std::os::unix::ffi::OsStrExt;
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::Path;
use std::ptr;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};

use crate::ffi::{self, LoadError, Symbols, vendor_heap};

/// A non-zero return code from the library.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct ErrorCode(pub u32);

impl ErrorCode {
    /// The header's `ERR_*` name; second-endpoint codes map to their base USB error.
    #[must_use]
    pub fn name(self) -> Option<&'static str> {
        Self::describe(self.0).map(|(name, _)| name)
    }

    /// The header's comment for this code.
    #[must_use]
    pub fn description(self) -> Option<&'static str> {
        Self::describe(self.0).map(|(_, description)| description)
    }

    #[must_use]
    pub fn is_second_endpoint(self) -> bool {
        let base = self.0.wrapping_sub(ffi::ERR_SECOND_ENDPOINT_OFFSET);
        (ffi::ERR_CYAPI..=ffi::ERR_ENDPOINT_HALTED).contains(&base)
    }

    #[allow(clippy::wildcard_imports, clippy::too_many_lines)]
    fn describe(code: u32) -> Option<(&'static str, &'static str)> {
        use ffi::*;
        let entry = match code {
            ERR_NOERROR => ("ERR_NOERROR", "No Error"),
            ERR_CYAPI => (
                "ERR_CYAPI",
                "Cypress API not found, maybe CyUSB3.dll missing in the system",
            ),
            ERR_FX3 => (
                "ERR_FX3",
                "No FX3 USB device found attached to the CyUsb driver",
            ),
            ERR_VID_PID => ("ERR_VID_PID", "Product and/or vendor ID didn't match"),
            ERR_EP => ("ERR_EP", "EP BulkIn and BulkOut expected but missing"),
            ERR_DEVICE_CLOSED => (
                "ERR_DEVICE_CLOSED",
                "USB device was closed - no IO operation possible",
            ),
            ERR_XFERIN_THREAD => (
                "ERR_XFERIN_THREAD",
                "Thread for Data Transfer In could not be started",
            ),
            ERR_WRONG_OBJ_PTR => ("ERR_WRONG_OBJ_PTR", "DataObject's pointer is invalid"),
            ERR_WRONG_OBJ_INOSID => (
                "ERR_WRONG_OBJ_INOSID",
                "DataObject doesn't have the correct inoSID at beginning",
            ),
            ERR_WRONG_OBJ_LEN => ("ERR_WRONG_OBJ_LEN", "DataObject's inoLEN is invalid"),
            ERR_XFEROUT_TIMEOUT => (
                "ERR_XFEROUT_TIMEOUT",
                "TimeOut occured while transfer to Scanner",
            ),
            ERR_WRONG_CB_PTR => (
                "ERR_WRONG_CB_PTR",
                "SetCB_DataInUsb got invalid function pointer",
            ),
            ERR_BEGINDATAXFER => ("ERR_BEGINDATAXFER", "Error BeginDataTransfer"),
            ERR_DO_MORE_DATA_THAN_INOLEN => (
                "ERR_DO_MORE_DATA_THAN_INOLEN",
                "There were more bytes received than expected by the Data Objects inoLEN",
            ),
            ERR_DO_WRONG_INOLEN => (
                "ERR_DO_WRONG_INOLEN",
                "inoLEN of the received Data Object to small or not a multiple of 4",
            ),
            ERR_DO_WRONG_INOSID => (
                "ERR_DO_WRONG_INOSID",
                "inoSID of the received Data Object didn't match",
            ),
            ERR_DO_TIMEOUT => (
                "ERR_DO_TIMEOUT",
                "A timeout occured for the received Data Objects inoTIM",
            ),
            ERR_PACKET_LARGER_THAN_INOLEN => (
                "ERR_PACKET_LARGER_THAN_INOLEN",
                "A single USB packet was larger than inoLEN",
            ),
            ERR_UNEXPECTED_SHORT_PACKET => (
                "ERR_UNEXPECTED_SHORT_PACKET",
                "A short packet was detected and the DataObject will be finished but inoLEN bytes not reached",
            ),
            ERR_CRC_MISMATCH => (
                "ERR_CRC_MISMATCH",
                "The received Data Objects inoCRC mismatches the calculated CRC",
            ),
            ERR_ENDPOINT_HALTED => (
                "ERR_ENDPOINT_HALTED",
                "Error BeginDataTransfer, Status Endpoint Halted",
            ),
            ERR_INOUSB => ("ERR_INOUSB", "InoUsb module not found"),
            ERR_INOUSB_FUNC_MISS => ("ERR_INOUSB_FUNC_MISS", "InoUsb module function missing"),
            ERR_INOUI => ("ERR_INOUI", "InoUI module not found"),
            ERR_INOUI_FUNC_MISS => ("ERR_INOUI_FUNC_MISS", "InoUI module function missing"),
            ERR_CB_THREAD => (
                "ERR_CB_THREAD",
                "InoApi Thread for Callback function could not be started",
            ),
            ERR_NOT_CONNECTED => ("ERR_NOT_CONNECTED", "Scanner not connected"),
            ERR_WRONG_STATE => (
                "ERR_WRONG_STATE",
                "Previous Function called in wrong state, see Error Text CStrData for more information",
            ),
            ERR_SEQUENCE_ERROR => ("ERR_SEQUENCE_ERROR", "Function called at wrong time"),
            ERR_TIMEOUT => ("ERR_TIMEOUT", "A Timeout in response from scanner occurred"),
            ERR_ANSWER => ("ERR_ANSWER", "Wrong answer from scanner"),
            ERR_VERSION_MISMATCH => (
                "ERR_VERSION_MISMATCH",
                "Version of API does not match to Application or Scanner",
            ),
            ERR_NOT_ALLOWED => ("ERR_NOT_ALLOWED", "Function call not allowed"),
            ERR_WRONG_PARAM => ("ERR_WRONG_PARAM", "Wrong parameter for function call"),
            ERR_INTERNAL_ERROR => ("ERR_INTERNAL_ERROR", "Internal API error"),
            ERR_UI_CREATION => ("ERR_UI_CREATION", "UI / dialog cannot be created"),
            ERR_INOAPI => ("ERR_INOAPI", "InoApi module not found"),
            ERR_INOAPI_FUNC_MIS => ("ERR_INOAPI_FUNC_MIS", "InoApi module function missing"),
            ERR_INOUI_PATH_MIS => (
                "ERR_INOUI_PATH_MIS",
                "Folder for local profiles not accessible",
            ),
            ERR_SCANNER_NOTCONNECTED => ("ERR_SCANNER_NOTCONNECTED", "Scanner not connected"),
            ERR_SCANNER_NOCONFIG => ("ERR_SCANNER_NOCONFIG", "Scanner has no config/profile"),
            ERR_SCANNER_NOTREADY => ("ERR_SCANNER_NOTREADY", "Scanner not ready"),
            ERR_SCANNER_CONNECTED => ("ERR_SCANNER_CONNECTED", "Scanner already connected"),
            ERR_SCANNER_INVALIDCONFIG => ("ERR_SCANNER_INVALIDCONFIG", "config/profile is invalid"),
            ERR_SCANNER_OUTDATEDPC => ("ERR_SCANNER_OUTDATEDPC", "PC is outdated"),
            ERR_SCANNER_OUTDATEDSCANNER => ("ERR_SCANNER_OUTDATEDSCANNER", "Scanner is outdated"),
            ERR_SCANNER_NOSCHEMA => ("ERR_SCANNER_NOSCHEMA", "PC submitted schema version"),
            ERR_SCANNER_NOTIDLE => ("ERR_SCANNER_NOTIDLE", "Scanner is not idle"),
            ERR_SCANNER_ISSCANNING => ("ERR_SCANNER_ISSCANNING", "Scanner is scanning"),
            ERR_SCANNER_NOTSCANNING => ("ERR_SCANNER_NOTSCANNING", "Scanner is not scanning"),
            ERR_SCANNER_ERRORACTIVE => ("ERR_SCANNER_ERRORACTIVE", "Error active on scanner"),
            ERR_SCANNER_EDITING => ("ERR_SCANNER_EDITING", "User editing"),
            ERR_SCANNER_UNSUPPORTEDFEATURE => (
                "ERR_SCANNER_UNSUPPORTEDFEATURE",
                "Feature not supported by scanner",
            ),
            other if ErrorCode(other).is_second_endpoint() => {
                return Self::describe(other - ERR_SECOND_ENDPOINT_OFFSET);
            }
            _ => return None,
        };
        Some(entry)
    }
}

impl fmt::Debug for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.name() {
            Some(name) if self.is_second_endpoint() => {
                write!(
                    f,
                    "ErrorCode({} = {name} + ERR_SECOND_ENDPOINT_OFFSET)",
                    self.0
                )
            }
            Some(name) => write!(f, "ErrorCode({} = {name})", self.0),
            None => write!(f, "ErrorCode({})", self.0),
        }
    }
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match (self.name(), self.description()) {
            (Some(name), Some(description)) if self.is_second_endpoint() => {
                write!(
                    f,
                    "{name} (second endpoint, code {}): {description}",
                    self.0
                )
            }
            (Some(name), Some(description)) => write!(f, "{name} ({}): {description}", self.0),
            _ => write!(f, "unknown InoTec error code {}", self.0),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{function} failed: {code}")]
    Api {
        function: &'static str,
        code: ErrorCode,
    },

    #[error("a Driver is already connected in this process")]
    AlreadyConnected,

    #[error("string contains an interior NUL byte")]
    InteriorNul,

    #[error("{0}")]
    Load(#[source] LoadError),
}

fn check(function: &'static str, code: u32) -> Result<(), Error> {
    if code == ffi::ERR_NOERROR {
        Ok(())
    } else {
        Err(Error::Api {
            function,
            code: ErrorCode(code),
        })
    }
}

/// Calls a `uint32_t f(char** out)` function, taking ownership of the result.
///
/// # Safety
/// `f` must hand back null or a string the caller owns.
unsafe fn fetch_string(
    function: &'static str,
    f: unsafe extern "C" fn(*mut *mut c_char) -> u32,
) -> Result<String, Error> {
    let mut out: *mut c_char = ptr::null_mut();
    // SAFETY: caller's contract; the result is NUL-terminated, ours, and freed once.
    unsafe {
        check(function, f(&raw mut out))?;
        if out.is_null() {
            return Ok(String::new());
        }
        let string = CStr::from_ptr(out).to_string_lossy().into_owned();
        vendor_heap::free(out.cast());
        Ok(string)
    }
}

/// `ImageProperties_t.scanSide`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScanSide {
    Front,
    Back,
    Other(i32),
}

impl From<i32> for ScanSide {
    fn from(value: i32) -> Self {
        match value {
            ffi::INO_IP_SCANSIDE_FRONT => ScanSide::Front,
            ffi::INO_IP_SCANSIDE_BACK => ScanSide::Back,
            other => ScanSide::Other(other),
        }
    }
}

impl From<ScanSide> for i32 {
    fn from(side: ScanSide) -> Self {
        match side {
            ScanSide::Front => ffi::INO_IP_SCANSIDE_FRONT,
            ScanSide::Back => ffi::INO_IP_SCANSIDE_BACK,
            ScanSide::Other(value) => value,
        }
    }
}

/// One scanned image: a copy of its properties, and the pixel buffer, freed on drop.
pub struct Image {
    props: Box<ffi::ImageProperties_t>,
    data: *mut u8,
}

// SAFETY: the pixel buffer is plain memory owned exclusively by this value and never mutated.
unsafe impl Send for Image {}

macro_rules! prop {
    ($self:expr, $field:ident) => {
        $self.props.$field
    };
}

impl Image {
    /// Takes ownership of the two buffers passed to the image callback, copying the properties
    /// and freeing the `ImageInfo_t`. A struct smaller than ours is rejected with its size (and
    /// both buffers freed); a larger one is accepted.
    ///
    /// # Safety
    /// `info` must be a live `ImageInfo_t` from the library and `data` its image buffer (or
    /// null); the caller must not touch either afterwards.
    pub unsafe fn from_raw(info: *mut ffi::ImageInfo_t, data: *mut u8) -> Result<Self, i32> {
        unsafe {
            if info.is_null() {
                vendor_heap::free(data.cast());
                return Err(0);
            }
            let size = ptr::addr_of!((*info).size).read_unaligned();
            if size < 0 || usize::try_from(size).unwrap_or(0) < size_of::<ffi::ImageInfo_t>() {
                vendor_heap::free(data.cast());
                vendor_heap::free(info.cast());
                return Err(size);
            }
            let props = Box::new(ptr::addr_of!((*info).ImageProperties).read_unaligned());
            vendor_heap::free(info.cast());
            Ok(Image { props, data })
        }
    }

    /// Reads a fixed-size `char[N]` field up to its first NUL.
    fn c_array_lossy(field: &[c_char]) -> String {
        let bytes: Vec<u8> = field
            .iter()
            .take_while(|&&c| c != 0)
            .map(|c| c.to_ne_bytes()[0])
            .collect();
        String::from_utf8_lossy(&bytes).into_owned()
    }

    /// The pixel buffer; empty when the library passed null or a non-positive size.
    #[must_use]
    pub fn data(&self) -> &[u8] {
        let size = self.size();
        if self.data.is_null() || size <= 0 {
            return &[];
        }
        // SAFETY: the library allocated `size` bytes at `data` and we own them.
        unsafe { std::slice::from_raw_parts(self.data, usize::try_from(size).unwrap_or(0)) }
    }

    #[must_use]
    pub fn stream_id(&self) -> i32 {
        prop!(self, streamID)
    }
    #[must_use]
    pub fn scan_side(&self) -> ScanSide {
        prop!(self, scanSide).into()
    }
    #[must_use]
    pub fn seq_id(&self) -> i64 {
        prop!(self, seqID)
    }
    #[must_use]
    pub fn counters(&self) -> [i64; 4] {
        prop!(self, counter)
    }
    #[must_use]
    pub fn resolution(&self) -> i32 {
        prop!(self, resolution)
    }
    #[must_use]
    pub fn lines(&self) -> i32 {
        prop!(self, lines)
    }
    #[must_use]
    pub fn bytes_per_line(&self) -> i32 {
        prop!(self, bytesPerLine)
    }
    #[must_use]
    pub fn pixels_per_line(&self) -> i32 {
        prop!(self, pixelsPerLine)
    }
    #[must_use]
    pub fn bits_per_pixel(&self) -> i32 {
        prop!(self, bitsPerPixel)
    }
    /// Byte length of [`Image::data`].
    #[must_use]
    pub fn size(&self) -> i32 {
        prop!(self, size)
    }
    /// `INO_IP_FILEFORMAT_*`.
    #[must_use]
    pub fn file_format(&self) -> i32 {
        prop!(self, fileformat)
    }
    /// `INO_IP_COMPRESSION_*`.
    #[must_use]
    pub fn compression(&self) -> i32 {
        prop!(self, compression)
    }
    /// `INO_IP_DOUBLEFEED_*`.
    #[must_use]
    pub fn double_feed(&self) -> i32 {
        prop!(self, doubleFeed)
    }
    /// `INO_IP_BLANKPAGE_*`.
    #[must_use]
    pub fn blank_page(&self) -> i32 {
        prop!(self, blankPage)
    }
    /// `INO_IP_INTEGRITY_*`.
    #[must_use]
    pub fn integrity(&self) -> i32 {
        prop!(self, integrity)
    }
    #[must_use]
    pub fn endorser_front_text(&self) -> String {
        Self::c_array_lossy(&self.props.endorserFrontText)
    }
    #[must_use]
    pub fn endorser_back_text(&self) -> String {
        Self::c_array_lossy(&self.props.endorserBackText)
    }
}

impl AsRef<[u8]> for Image {
    fn as_ref(&self) -> &[u8] {
        self.data()
    }
}

impl Drop for Image {
    fn drop(&mut self) {
        // SAFETY: the pixel buffer came from the library, is owned by us, and is freed once.
        unsafe { vendor_heap::free(self.data.cast()) };
    }
}

impl fmt::Debug for Image {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Image")
            .field("seq_id", &self.seq_id())
            .field("scan_side", &self.scan_side())
            .field("pixels_per_line", &self.pixels_per_line())
            .field("lines", &self.lines())
            .field("bits_per_pixel", &self.bits_per_pixel())
            .field("resolution", &self.resolution())
            .field("file_format", &self.file_format())
            .field("compression", &self.compression())
            .field("size", &self.size())
            .field("endorser_front_text", &self.endorser_front_text())
            .finish_non_exhaustive()
    }
}

/// An owned copy of a `ScannerControl_t`.
#[derive(Clone, PartialEq, Eq)]
pub struct ScannerControl {
    /// Type of Control (`CTYPE_*`).
    pub ctype: u32,
    /// Additional numerical info.
    pub num_data: u32,
    /// Additional string info, up to the first NUL.
    pub str_data: Vec<u8>,
}

impl ScannerControl {
    /// # Safety
    /// `p` must point at a live `ScannerControl_t`.
    unsafe fn copy_from(p: *const ffi::ScannerControl_t) -> Self {
        unsafe {
            let ctype = ptr::addr_of!((*p).CType).read_unaligned();
            let num_data = ptr::addr_of!((*p).CNumData).read_unaligned();
            let str_ptr = ptr::addr_of!((*p).CStrData).cast::<u8>();
            let all = std::slice::from_raw_parts(str_ptr, ffi::COMMANDLEN);
            let end = all.iter().position(|&b| b == 0).unwrap_or(ffi::COMMANDLEN);
            ScannerControl {
                ctype,
                num_data,
                str_data: all[..end].to_vec(),
            }
        }
    }

    #[must_use]
    pub fn str_data_lossy(&self) -> Cow<'_, str> {
        String::from_utf8_lossy(&self.str_data)
    }
}

impl fmt::Debug for ScannerControl {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ScannerControl")
            .field("ctype", &self.ctype)
            .field("num_data", &self.num_data)
            .field("str_data", &self.str_data_lossy())
            .finish()
    }
}

/// What the driver's callbacks report, delivered on the channel from [`Driver::connect`].
#[derive(Debug)]
pub enum Event {
    Image(Image),
    Control(ScannerControl),
    Log(String),
    /// The driver sent an `ImageInfo_t` of this size, smaller than ours; it was dropped.
    IncompatibleImage(i32),
    /// The scanner's operational state changed; 0 while an error is active.
    OperationalState(i32),
}

static EVENTS: Mutex<Option<Sender<Event>>> = Mutex::new(None);
static CONNECTED: AtomicBool = AtomicBool::new(false);

fn emit(event: Event) {
    let guard = EVENTS
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    if let Some(tx) = guard.as_ref() {
        let _ = tx.send(event);
    }
}

/// Swallows panics so they never unwind into C.
fn guarded(body: impl FnOnce()) {
    let _ = catch_unwind(AssertUnwindSafe(body));
}

unsafe extern "C" fn log_trampoline(str_: *mut c_char) {
    unsafe {
        guarded(|| {
            if str_.is_null() {
                return;
            }
            // Freed by the driver when the callback returns.
            let line = CStr::from_ptr(str_).to_string_lossy().into_owned();
            emit(Event::Log(line));
        });
    }
}

unsafe extern "C" fn control_trampoline(p: *mut ffi::ScannerControl_t) {
    unsafe {
        guarded(|| {
            if p.is_null() {
                return;
            }
            // Allocated per message by the driver and never freed by it.
            let control = ScannerControl::copy_from(p);
            vendor_heap::free(p.cast());
            emit(Event::Control(control));
        });
    }
}

unsafe extern "C" fn operational_state_trampoline(state: c_int) {
    guarded(|| emit(Event::OperationalState(state)));
}

unsafe extern "C" fn image_trampoline(info: *mut ffi::ImageInfo_t, data: *mut u8) {
    unsafe {
        guarded(|| match Image::from_raw(info, data) {
            Ok(image) => emit(Event::Image(image)),
            Err(incompatible) => emit(Event::IncompatibleImage(incompatible)),
        });
    }
}

/// Driver-maintained scanner state, raw; see [`ApiState`] and [`OperationalState`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Status {
    pub state: u32,
    pub operational_state: u32,
    pub images_available: u32,
    pub feeder_loaded: u32,
    pub next_feeder_loaded: u32,
    pub feeder_side: u32,
}

/// [`Status::state`] and a `CTYPE_STATUS` control's `num_data`, as the driver's
/// `readableApiState` names them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ApiState {
    Offline,
    Ready,
    NotReady,
    Scanning,
    Unknown(u32),
}

impl From<u32> for ApiState {
    fn from(value: u32) -> Self {
        match value {
            0 => Self::Offline,
            1 => Self::Ready,
            2 => Self::NotReady,
            4 => Self::Scanning,
            other => Self::Unknown(other),
        }
    }
}

impl fmt::Display for ApiState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Offline => f.write_str("offline"),
            Self::Ready => f.write_str("ready for scan"),
            Self::NotReady => f.write_str("not ready for scan"),
            Self::Scanning => f.write_str("scanning"),
            Self::Unknown(value) => write!(f, "unknown ({value})"),
        }
    }
}

/// [`Status::operational_state`], in the order of the scanner display's `OperationalState`
/// enum: errors make it not operational, crucial warnings partially operational.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperationalState {
    NotOperational,
    PartiallyOperational,
    Operational,
    Unknown(i64),
}

impl From<i64> for OperationalState {
    fn from(value: i64) -> Self {
        match value {
            0 => Self::NotOperational,
            1 => Self::PartiallyOperational,
            2 => Self::Operational,
            other => Self::Unknown(other),
        }
    }
}

impl fmt::Display for OperationalState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotOperational => f.write_str("not operational"),
            Self::PartiallyOperational => f.write_str("partially operational"),
            Self::Operational => f.write_str("operational"),
            Self::Unknown(value) => write!(f, "unknown ({value})"),
        }
    }
}

/// A live connection to the scanner; dropping it disconnects. Not `Sync`, since the driver's
/// thread safety is undocumented.
pub struct Driver {
    symbols: Symbols,
    _not_sync: PhantomData<std::cell::Cell<()>>,
}

/// `ScannerConnect`'s "reserved" integers: the profile schema version spoken and the oldest
/// accepted. Zeros select a lite mode in which `SetScannerSetup` is refused; otherwise the driver
/// requires `version > 68` and `minimum <= 210`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProfileSchema {
    pub version: i32,
    pub minimum: i32,
}

impl ProfileSchema {
    /// The schema range spoken by SCAMAX firmware 1.0.1347.
    pub const CURRENT: Self = Self {
        version: 210,
        minimum: 69,
    };
}

impl Driver {
    /// Loads the driver and connects with [`ProfileSchema::CURRENT`].
    pub fn connect(library_path: &Path, app_id: &str) -> Result<(Self, Receiver<Event>), Error> {
        Self::connect_with_schema(library_path, app_id, ProfileSchema::CURRENT)
    }

    /// Loads the driver, registers the callbacks and connects to the scanner.
    pub fn connect_with_schema(
        library_path: &Path,
        app_id: &str,
        schema: ProfileSchema,
    ) -> Result<(Self, Receiver<Event>), Error> {
        if CONNECTED.swap(true, Ordering::AcqRel) {
            return Err(Error::AlreadyConnected);
        }

        match Self::connect_inner(library_path, app_id, schema) {
            Ok(pair) => Ok(pair),
            Err(error) => {
                Self::release_globals();
                Err(error)
            }
        }
    }

    fn connect_inner(
        library_path: &Path,
        app_id: &str,
        schema: ProfileSchema,
    ) -> Result<(Self, Receiver<Event>), Error> {
        // SAFETY: the signatures in `Symbols` mirror the driver's own headers.
        let symbols = unsafe { Symbols::load(library_path) }.map_err(Error::Load)?;

        // SAFETY: `ScannerConnect` is an export of the library just loaded, not yet called.
        match unsafe {
            ffi::ui_shim::install(
                symbols.ScannerConnect as *const c_void,
                operational_state_trampoline,
            )
        } {
            Ok(ffi::ui_shim::Outcome::Patched) => {
                tracing::debug!("installed the `currentOperationalState` callback");
            }
            Ok(ffi::ui_shim::Outcome::AlreadySet) => tracing::warn!(
                "the driver's `currentOperationalState` callback is already set; \
                 operational-state changes will not be reported"
            ),
            Err(reason) => tracing::warn!(
                "could not patch the driver's `currentOperationalState` callback ({reason}); \
                 with `[GUI] local=off` the first operational-state message will crash"
            ),
        }

        let app_id = CString::new(app_id).map_err(|_| Error::InteriorNul)?;
        let (tx, rx) = mpsc::channel();
        *EVENTS
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = Some(tx);

        // SAFETY: the trampolines match the header's callback signatures, and the driver only
        // invokes them between here and `ScannerDisconnect`.
        unsafe {
            check(
                "SetCB_LogFunctionCB",
                (symbols.SetCB_LogFunctionCB)(log_trampoline as ffi::LogFunctionCB as *mut c_void),
            )?;
            check(
                "SetCB_ScannerControlCB",
                (symbols.SetCB_ScannerControlCB)(
                    control_trampoline as ffi::ScannerControlCB as *mut c_void,
                ),
            )?;
            check(
                "SetCB_ImageCB",
                (symbols.SetCB_ImageCB)(image_trampoline as ffi::ImageCB as *mut c_void),
            )?;
            check(
                "ScannerConnect",
                (symbols.ScannerConnect)(app_id.as_ptr(), schema.version, schema.minimum),
            )?;
        }

        Ok((
            Self {
                symbols,
                _not_sync: PhantomData,
            },
            rx,
        ))
    }

    fn release_globals() {
        *EVENTS
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner) = None;
        CONNECTED.store(false, Ordering::Release);
    }

    /// Reads driver-maintained state; does not talk to the device.
    #[must_use]
    pub fn status(&self) -> Status {
        // SAFETY: plain reads of driver-internal state words.
        unsafe {
            Status {
                state: (self.symbols.GetScannerState)(),
                operational_state: (self.symbols.GetScannerOperationalState)(),
                images_available: (self.symbols.ImagesAvailable)(),
                feeder_loaded: (self.symbols.GetFeederLoaded)(),
                next_feeder_loaded: (self.symbols.GetFeederNextLoaded)(),
                feeder_side: (self.symbols.GetFeederSide)(),
            }
        }
    }

    /// The driver's own version string.
    pub fn api_version(&self) -> Result<String, Error> {
        // SAFETY: `GetApiVersion` hands back an owned string.
        unsafe { fetch_string("GetApiVersion", self.symbols.GetApiVersion) }
    }

    /// The scanner's version information, as opaque text.
    pub fn scanner_version(&self) -> Result<String, Error> {
        // SAFETY: `GetScannerVersion` hands back an owned string.
        unsafe { fetch_string("GetScannerVersion", self.symbols.GetScannerVersion) }
    }

    /// The active profile, as the driver's line-oriented `Section_field = value` text.
    pub fn profile(&self) -> Result<String, Error> {
        // SAFETY: `GetScannerSetup` hands back an owned string.
        unsafe { fetch_string("GetScannerSetup", self.symbols.GetScannerSetup) }
    }

    /// The scanner's built-in default profile. Undocumented export.
    pub fn default_profile(&self) -> Result<String, Error> {
        // SAFETY: `GetScannerSetupDefault` hands back an owned string.
        unsafe {
            fetch_string(
                "GetScannerSetupDefault",
                self.symbols.GetScannerSetupDefault,
            )
        }
    }

    /// The names of the profiles the scanner holds. Undocumented export.
    pub fn profile_list(&self) -> Result<String, Error> {
        // SAFETY: `GetScannerSetupListSync` hands back an owned string.
        unsafe {
            fetch_string(
                "GetScannerSetupListSync",
                self.symbols.GetScannerSetupListSync,
            )
        }
    }

    /// Activates a stored profile by name. Undocumented export.
    pub fn select_profile(&self, name: &str) -> Result<(), Error> {
        let name = CString::new(name).map_err(|_| Error::InteriorNul)?;
        // SAFETY: the driver copies the name into a `std::string` during the call.
        check("SelectScannerSetup", unsafe {
            (self.symbols.SelectScannerSetup)(name.as_ptr())
        })
    }

    /// Writes the scanner's log files into `directory`, asynchronously; progress arrives as
    /// `CTYPE_INOUI_TRANSFER*` control messages. Undocumented export.
    pub fn fetch_logs(&self, directory: &Path, all: bool) -> Result<(), Error> {
        let directory =
            CString::new(directory.as_os_str().as_bytes()).map_err(|_| Error::InteriorNul)?;
        // SAFETY: the driver copies the path into a `std::string` during the call.
        unsafe {
            if all {
                check("GetAllLogs", (self.symbols.GetAllLogs)(directory.as_ptr()))
            } else {
                check(
                    "GetLastLogs",
                    (self.symbols.GetLastLogs)(directory.as_ptr()),
                )
            }
        }
    }

    /// Replaces the active profile.
    pub fn set_profile(&self, profile: &str) -> Result<(), Error> {
        if profile.as_bytes().contains(&0) {
            return Err(Error::InteriorNul);
        }
        let owned = vendor_heap::new_c_string(profile.as_bytes());
        // SAFETY: `SetScannerSetup` takes ownership and frees the buffer on every path, so it must
        // come from `AllocBuffer` and must not be freed here.
        check("SetScannerSetup", unsafe {
            (self.symbols.SetScannerSetup)(owned)
        })
    }

    /// Gates image transfer. The scanner buffers while not ready.
    pub fn set_ready(&self, ready: bool) -> Result<(), Error> {
        // SAFETY: plain call.
        check("SetReady", unsafe {
            (self.symbols.SetReady)(i32::from(ready))
        })
    }

    /// Begins scanning. Images arrive as [`Event::Image`].
    pub fn scan_start(&self) -> Result<(), Error> {
        // SAFETY: plain call.
        check("ScanStart", unsafe { (self.symbols.ScanStart)() })
    }

    /// Ends the batch. Images already buffered are still delivered.
    pub fn scan_stop(&self) -> Result<(), Error> {
        // SAFETY: plain call.
        check("ScanStop", unsafe { (self.symbols.ScanStop)() })
    }

    /// Stops the feeder without ending the batch.
    pub fn scan_break(&self) -> Result<(), Error> {
        // SAFETY: plain call.
        check("ScanBreak", unsafe { (self.symbols.ScanBreak)() })
    }

    /// Resumes after [`Driver::scan_break`].
    pub fn scan_continue(&self) -> Result<(), Error> {
        // SAFETY: plain call.
        check("ScanContinue", unsafe { (self.symbols.ScanContinue)() })
    }

    /// Sets the imprinter template (with `%CNT1%`-style variables). Undocumented export.
    pub fn set_printer_string(&self, text: &str) -> Result<(), Error> {
        let text = CString::new(text).map_err(|_| Error::InteriorNul)?;
        // SAFETY: the driver only reads the string during the call.
        check("SetPrinterstring", unsafe {
            (self.symbols.SetPrinterstring)(text.as_ptr())
        })
    }

    /// Sets one of the four imprinter counters. Undocumented export.
    pub fn set_counter(&self, index: u32, value: i64) -> Result<(), Error> {
        // SAFETY: plain call.
        check("SetCounter", unsafe {
            (self.symbols.SetCounter)(index, value)
        })
    }

    /// Asks the scanner to feed exactly `count` sheets. Undocumented export.
    pub fn set_number_of_sheets(&self, count: u32) -> Result<(), Error> {
        // SAFETY: plain call.
        check("SetNumberOfSheets", unsafe {
            (self.symbols.SetNumberOfSheets)(count)
        })
    }
}

impl fmt::Debug for Driver {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Driver")
            .field("status", &self.status())
            .finish()
    }
}

impl Drop for Driver {
    fn drop(&mut self) {
        // SAFETY: plain calls. Only the log callback may be unset with null; the other
        // trampolines become no-ops once the sender is gone.
        unsafe {
            let _ = (self.symbols.ScannerDisconnect)();
            let _ = (self.symbols.SetCB_LogFunctionCB)(ptr::null_mut());
        }
        Self::release_globals();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[allow(clippy::wildcard_imports)]
    use crate::ffi::*;
    use std::mem::{offset_of, size_of};

    // Values from a C++ probe compiled against `ino.hpp` on x86_64.
    #[test]
    fn struct_sizes_match_the_c_headers() {
        assert_eq!(size_of::<ImageProperties_t>(), 30_904);
        assert_eq!(size_of::<ImageInfo_t>(), 30_916);
        assert_eq!(size_of::<ScannerControl_t>(), 16_392);
        assert_eq!(INO_IP_RESERVED_SHEET, 3_436);
    }

    #[test]
    fn field_offsets_match_the_c_headers() {
        assert_eq!(offset_of!(ImageProperties_t, seqID), 8);
        assert_eq!(offset_of!(ImageProperties_t, counter), 16);
        assert_eq!(offset_of!(ImageProperties_t, date), 48);
        assert_eq!(offset_of!(ImageProperties_t, time), 57);
        assert_eq!(offset_of!(ImageProperties_t, scanResolution), 67);
        assert_eq!(offset_of!(ImageProperties_t, reservedGeneral), 79);
        assert_eq!(offset_of!(ImageProperties_t, resolution), 4_175);
        assert_eq!(offset_of!(ImageProperties_t, size), 4_195);
        assert_eq!(offset_of!(ImageProperties_t, snipped), 4_207);
        assert_eq!(offset_of!(ImageProperties_t, autorotateResult), 8_307);
        assert_eq!(offset_of!(ImageProperties_t, unused), 8_323);
        assert_eq!(offset_of!(ImageProperties_t, patchCode), 8_340);
        assert_eq!(offset_of!(ImageProperties_t, barcode2DType), 8_376);
        assert_eq!(offset_of!(ImageProperties_t, barcode2DText), 8_380);
        assert_eq!(offset_of!(ImageProperties_t, barcodeText), 8_892);
        assert_eq!(offset_of!(ImageProperties_t, autorotateConfidence), 9_020);
        assert_eq!(offset_of!(ImageProperties_t, reservedSheet), 9_024);
        assert_eq!(offset_of!(ImageProperties_t, endorsedPosFront), 12_460);
        assert_eq!(offset_of!(ImageProperties_t, endorserFrontText), 12_464);
        assert_eq!(offset_of!(ImageProperties_t, endorsedPosBack), 16_560);
        assert_eq!(offset_of!(ImageProperties_t, endorserBackText), 16_564);
        assert_eq!(offset_of!(ImageProperties_t, stamped), 20_660);
        assert_eq!(offset_of!(ImageProperties_t, stampText), 20_664);
        assert_eq!(offset_of!(ImageProperties_t, fixedText), 24_760);
        assert_eq!(offset_of!(ImageProperties_t, reservedAnnotations), 26_808);
        assert_eq!(offset_of!(ImageInfo_t, version), 0);
        assert_eq!(offset_of!(ImageInfo_t, size), 4);
        assert_eq!(offset_of!(ImageInfo_t, offset), 8);
        assert_eq!(offset_of!(ImageInfo_t, ImageProperties), 12);
        assert_eq!(offset_of!(ScannerControl_t, CType), 0);
        assert_eq!(offset_of!(ScannerControl_t, CNumData), 4);
        assert_eq!(offset_of!(ScannerControl_t, CStrData), 8);
    }

    #[test]
    fn error_codes_carry_the_header_text() {
        let e = ErrorCode(ERR_SCANNER_UNSUPPORTEDFEATURE);
        assert_eq!(e.name(), Some("ERR_SCANNER_UNSUPPORTEDFEATURE"));
        assert_eq!(e.description(), Some("Feature not supported by scanner"));
        assert_eq!(
            e.to_string(),
            "ERR_SCANNER_UNSUPPORTEDFEATURE (513): Feature not supported by scanner"
        );

        let second = ErrorCode(ERR_CRC_MISMATCH + ERR_SECOND_ENDPOINT_OFFSET);
        assert!(second.is_second_endpoint());
        assert_eq!(second.name(), Some("ERR_CRC_MISMATCH"));
        assert_eq!(
            format!("{second:?}"),
            "ErrorCode(157 = ERR_CRC_MISMATCH + ERR_SECOND_ENDPOINT_OFFSET)"
        );

        assert_eq!(ErrorCode(9_999).name(), None);
        assert_eq!(
            ErrorCode(9_999).to_string(),
            "unknown InoTec error code 9999"
        );
        assert!(check("ScanStart", ERR_NOERROR).is_ok());
        assert!(matches!(
            check("ScanStart", ERR_SCANNER_NOTIDLE),
            Err(Error::Api {
                function: "ScanStart",
                code: ErrorCode(ERR_SCANNER_NOTIDLE)
            })
        ));
    }

    unsafe extern "C" fn test_alloc(size: i32) -> *mut c_void {
        unsafe { libc::malloc(usize::try_from(size).expect("positive size")) }
    }

    unsafe extern "C" fn test_free(ptr: *mut c_void) -> u32 {
        unsafe { libc::free(ptr) };
        0
    }

    /// Stands in for the driver's allocator, which tests never load.
    fn use_malloc_heap() {
        vendor_heap::install(test_alloc, test_free);
    }

    /// Builds an `ImageInfo_t` and pixel buffer on the vendor heap, as the library does.
    fn fake_image(size_field: i32) -> (*mut ImageInfo_t, *mut u8) {
        use_malloc_heap();
        let info = vendor_heap::alloc(size_of::<ImageInfo_t>()).cast::<ImageInfo_t>();
        unsafe {
            ptr::write_bytes(info.cast::<u8>(), 0, size_of::<ImageInfo_t>());
            ptr::addr_of_mut!((*info).version).write_unaligned(1);
            ptr::addr_of_mut!((*info).size).write_unaligned(size_field);
            let p = ptr::addr_of_mut!((*info).ImageProperties);
            ptr::addr_of_mut!((*p).scanSide).write_unaligned(INO_IP_SCANSIDE_BACK);
            ptr::addr_of_mut!((*p).seqID).write_unaligned(0x1234_5678_9abc);
            ptr::addr_of_mut!((*p).counter).write_unaligned([7, 0, 0, -1]);
            ptr::addr_of_mut!((*p).resolution).write_unaligned(200);
            ptr::addr_of_mut!((*p).size).write_unaligned(3);
            ptr::addr_of_mut!((*p).fileformat).write_unaligned(INO_IP_FILEFORMAT_BMP);
            ptr::addr_of_mut!((*p).integrity).write_unaligned(INO_IP_INTEGRITY_BACKFAILED);
            let text = b"batch-1_0007";
            ptr::copy_nonoverlapping(
                text.as_ptr(),
                ptr::addr_of_mut!((*p).endorserFrontText).cast::<u8>(),
                text.len(),
            );
        }
        let data = vendor_heap::new_c_string(b"ab").cast::<u8>(); // 3 bytes: 'a' 'b' NUL
        (info, data)
    }

    #[test]
    fn image_reads_packed_fields_and_owns_both_buffers() {
        let (info, data) = fake_image(i32::try_from(size_of::<ImageInfo_t>()).expect("fits"));
        let image = unsafe { Image::from_raw(info, data) }.expect("compatible");
        assert_eq!(image.scan_side(), ScanSide::Back);
        assert_eq!(image.seq_id(), 0x1234_5678_9abc);
        assert_eq!(image.counters(), [7, 0, 0, -1]);
        assert_eq!(image.resolution(), 200);
        assert_eq!(image.file_format(), INO_IP_FILEFORMAT_BMP);
        assert_eq!(image.endorser_front_text(), "batch-1_0007");
        assert_eq!(image.endorser_back_text(), "");
        assert_eq!(image.integrity(), INO_IP_INTEGRITY_BACKFAILED);
        assert_eq!(image.data(), b"ab\0");
    }

    #[test]
    fn image_rejects_a_struct_smaller_than_ours() {
        let (info, data) = fake_image(12);
        let err = unsafe { Image::from_raw(info, data) }.expect_err("incompatible");
        assert_eq!(err, 12);
    }

    #[test]
    fn image_accepts_a_larger_future_struct() {
        let (info, data) =
            fake_image(i32::try_from(size_of::<ImageInfo_t>()).expect("fits") + 4_096);
        assert!(unsafe { Image::from_raw(info, data) }.is_ok());
    }

    #[test]
    fn scanner_control_copies_out_of_the_packed_struct() {
        let mut raw = ScannerControl_t {
            CType: CTYPE_SCANERROR_PAPERJAM,
            CNumData: 42,
            CStrData: [0; COMMANDLEN],
        };
        for (dst, src) in raw.CStrData.iter_mut().zip(b"jam at input\0junk") {
            *dst = src.cast_signed();
        }
        let control = unsafe { ScannerControl::copy_from(std::ptr::from_ref(&raw)) };
        assert_eq!(control.ctype, CTYPE_SCANERROR_PAPERJAM);
        assert_eq!(control.num_data, 42);
        assert_eq!(control.str_data_lossy(), "jam at input");
    }

    #[test]
    fn new_c_string_is_nul_terminated() {
        use_malloc_heap();
        let p = vendor_heap::new_c_string(b"profile");
        assert_eq!(unsafe { CStr::from_ptr(p) }.to_bytes(), b"profile");
        unsafe { vendor_heap::free(p.cast()) };
    }
}
