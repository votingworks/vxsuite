//! Raw mirror of the `InoTec` `ino.hpp` / `inoapi.hpp` headers, keeping their C spelling. The
//! library is `dlopen`ed rather than linked, so entry points live in [`Symbols`].

#![allow(non_camel_case_types, non_snake_case, dead_code)]

use std::ffi::{c_char, c_void};

pub const CTYPE_ERROR: u32 = 1; // CType - Errors

pub const CTYPE_SETUPLIST: u32 = 10; // CType - Setup List
pub const CTYPE_SETUPLIST_END: u32 = 11; // CType - Setup List, Last Element
pub const CTYPE_SETUP: u32 = 15; // CType - Setup of Scanner / Profile

pub const CTYPE_STATUS: u32 = 20; // CTYPE - Status of scanner

pub const CTYPE_CONFIG_DONE: u32 = 25; // Returned Profile data or name or no profile
pub const CTYPE_CONFIG_ERROR: u32 = 26;

pub const CTYPE_FEEDER: u32 = 30; // CType - Status of active feeder
pub const CTYPE_FEEDERNEXT: u32 = 31; // CType - Status of next feeder
pub const CTYPE_FEEDERSIDE: u32 = 32; // CType - Current side of active feeder

pub const CTYPE_COMMAND_CTRLAPP: u32 = 100; // CType - Command from CtrlApp
pub const CTYPE_COMMAND_SWITCH: u32 = 200; // CType - Command from Switch

pub const CTYPE_INOUI_TRANSFERBEGIN: u32 = 350;
pub const CTYPE_INOUI_TRANSFERUPDATE: u32 = 351;
pub const CTYPE_INOUI_TRANSFERFINISHED: u32 = 352;

// Scan Error Codes InoApi
pub const CTYPE_SCANERROR_UNKNOWN: u32 = 600; // Generic Scan Error
pub const CTYPE_SCANERROR_INTERLOCK: u32 = 601; // One or more Interlocks opened while scanning
pub const CTYPE_SCANERROR_PAPERINSIDE: u32 = 602; // Paper inside scanner while scan start
pub const CTYPE_SCANERROR_PAPERJAM: u32 = 603; // Paper Jam while scanning
pub const CTYPE_SCANERROR_DOUBLEFEED: u32 = 604; // Double Feed while scanning

pub const CTYPE_SCANERROR_START: u32 = CTYPE_SCANERROR_UNKNOWN;
pub const CTYPE_SCANERROR_END: u32 = CTYPE_SCANERROR_DOUBLEFEED;

pub const ERR_NOERROR: u32 = 0; // No Error

// Error Codes InoUsb
pub const ERR_CYAPI: u32 = 20; // Cypress API not found, maybe CyUSB3.dll missing in the system
pub const ERR_FX3: u32 = 21; // No FX3 USB device found attached to the CyUsb driver
pub const ERR_VID_PID: u32 = 22; // Product and/or vendor ID didn't match
pub const ERR_EP: u32 = 23; // EP BulkIn and BulkOut expected but missing
pub const ERR_DEVICE_CLOSED: u32 = 24; // USB device was closed - no IO operation possible

pub const ERR_XFERIN_THREAD: u32 = 30; // Thread for Data Transfer In could not be started

pub const ERR_WRONG_OBJ_PTR: u32 = 40; // DataObject's pointer is invalid
pub const ERR_WRONG_OBJ_INOSID: u32 = 41; // DataObject doesn't have the correct inoSID at beginning
pub const ERR_WRONG_OBJ_LEN: u32 = 42; // DataObject's inoLEN is invalid
pub const ERR_XFEROUT_TIMEOUT: u32 = 43; // TimeOut occured while transfer to Scanner
pub const ERR_WRONG_CB_PTR: u32 = 44; // SetCB_DataInUsb got invalid function pointer

pub const ERR_BEGINDATAXFER: u32 = 50; // Error BeginDataTransfer
pub const ERR_DO_MORE_DATA_THAN_INOLEN: u32 = 51; // There were more bytes received than expected by the Data Objects inoLEN
pub const ERR_DO_WRONG_INOLEN: u32 = 52; // inoLEN of the received Data Object to small or not a multiple of 4
pub const ERR_DO_WRONG_INOSID: u32 = 53; // inoSID of the received Data Object didn't match
pub const ERR_DO_TIMEOUT: u32 = 54; // A timeout occured for the received Data Objects inoTIM
pub const ERR_PACKET_LARGER_THAN_INOLEN: u32 = 55; // A single USB packet was larger than inoLEN
pub const ERR_UNEXPECTED_SHORT_PACKET: u32 = 56; // A short packet was detected and the DataObject will be finished but inoLEN bytes not reached
pub const ERR_CRC_MISMATCH: u32 = 57; // The received Data Objects inoCRC mismatches the calculated CRC
pub const ERR_ENDPOINT_HALTED: u32 = 58; // Error BeginDataTransfer, Status Endpoint Halted

pub const ERR_SECOND_ENDPOINT_OFFSET: u32 = 100; // Offset of Errors from Second Endpoint

// Error Codes InoApi
pub const ERR_INOUSB: u32 = 201; // InoUsb module not found
pub const ERR_INOUSB_FUNC_MISS: u32 = 202; // InoUsb module function missing
pub const ERR_INOUI: u32 = 203; // InoUI module not found
pub const ERR_INOUI_FUNC_MISS: u32 = 204; // InoUI module function missing

pub const ERR_CB_THREAD: u32 = 210; // InoApi Thread for Callback function could not be started

pub const ERR_NOT_CONNECTED: u32 = 220; // Scanner not connected

pub const ERR_WRONG_STATE: u32 = 230; // Previous Function called in wrong state, see Error Text CStrData for more information
pub const ERR_SEQUENCE_ERROR: u32 = 231; // Function called at wrong time
pub const ERR_TIMEOUT: u32 = 232; // A Timeout in response from scanner occurred
pub const ERR_ANSWER: u32 = 233; // Wrong answer from scanner

pub const ERR_VERSION_MISMATCH: u32 = 240; // Version of API does not match to Application or Scanner

pub const ERR_NOT_ALLOWED: u32 = 250; // Function call not allowed
pub const ERR_WRONG_PARAM: u32 = 251; // Wrong parameter for function call

pub const ERR_INTERNAL_ERROR: u32 = 260; // Internal API error

// Error Codes InoUI
pub const ERR_UI_CREATION: u32 = 300; // UI / dialog cannot be created
pub const ERR_INOAPI: u32 = 301; // InoApi module not found
pub const ERR_INOAPI_FUNC_MIS: u32 = 302; // InoApi module function missing
pub const ERR_INOUI_PATH_MIS: u32 = 303; // Folder for local profiles not accessible

// Error Codes from Scanner
pub const ERR_SCANNER_NOTCONNECTED: u32 = 500; // Scanner not connected
pub const ERR_SCANNER_NOCONFIG: u32 = 501; // Scanner has no config/profile
pub const ERR_SCANNER_NOTREADY: u32 = 502; // Scanner not ready
pub const ERR_SCANNER_CONNECTED: u32 = 503; // Scanner already connected
pub const ERR_SCANNER_INVALIDCONFIG: u32 = 504; // config/profile is invalid
pub const ERR_SCANNER_OUTDATEDPC: u32 = 505; // PC is outdated
pub const ERR_SCANNER_OUTDATEDSCANNER: u32 = 506; // Scanner is outdated
pub const ERR_SCANNER_NOSCHEMA: u32 = 507; // PC submitted schema version
pub const ERR_SCANNER_NOTIDLE: u32 = 508; // Scanner is not idle
pub const ERR_SCANNER_ISSCANNING: u32 = 509; // Scanner is scanning
pub const ERR_SCANNER_NOTSCANNING: u32 = 510; // Scanner is not scanning
pub const ERR_SCANNER_ERRORACTIVE: u32 = 511; // Error active on scanner
pub const ERR_SCANNER_EDITING: u32 = 512; // User editing
pub const ERR_SCANNER_UNSUPPORTEDFEATURE: u32 = 513; // Feature not supported by scanner

pub const INO_IP_UNDEFINED: i32 = -42;

pub const INO_IP_ENDORSERTEXT: usize = 4096;
pub const INO_IP_STAMPTEXT: usize = 4096;
pub const INO_IP_FIXEDTEXT: usize = 2048;
pub const INO_IP_BARCODE2DSIZE: usize = 512;
pub const INO_IP_BARCODESIZE: usize = 128;

pub const INO_IP_RESERVED_GENERAL: usize = 4096;
pub const INO_IP_RESERVED_IMAGE: usize = 4096;
pub const INO_IP_RESERVED_SHEET: usize =
    4096 - (5 * std::mem::size_of::<i32>() + INO_IP_BARCODE2DSIZE + INO_IP_BARCODESIZE);
pub const INO_IP_RESERVED_ANNOTATIONS: usize = 4096;

pub const INO_IP_SCANSIDE_FRONT: i32 = 0;
pub const INO_IP_SCANSIDE_BACK: i32 = 1;

pub const INO_IP_SCAN_RESOLUTION_200DPI: i32 = 200;
pub const INO_IP_SCAN_RESOLUTION_300DPI: i32 = 300;
pub const INO_IP_SCAN_RESOLUTION_400DPI: i32 = 400;
pub const INO_IP_SCAN_RESOLUTION_600DPI: i32 = 600;

pub const INO_IP_INPUT_LEFT: i32 = 0;
pub const INO_IP_INPUT_RIGHT: i32 = 1;

pub const INO_IP_OUTPUT_REAR: i32 = 0;
pub const INO_IP_OUTPUT_FIRST: i32 = 1;
pub const INO_IP_OUTPUT_SECOND: i32 = 2;
pub const INO_IP_OUTPUT_THIRD: i32 = 3;
pub const INO_IP_OUTPUT_FOURTH: i32 = 4;

pub const INO_IP_RESOLUTION_75DPI: i32 = 75;
pub const INO_IP_RESOLUTION_100DPI: i32 = 100;
pub const INO_IP_RESOLUTION_150DPI: i32 = 150;
pub const INO_IP_RESOLUTION_200DPI: i32 = 200;
pub const INO_IP_RESOLUTION_240DPI: i32 = 240;
pub const INO_IP_RESOLUTION_300DPI: i32 = 300;
pub const INO_IP_RESOLUTION_400DPI: i32 = 400;
pub const INO_IP_RESOLUTION_600DPI: i32 = 600;

// Same numbers as ICAP_COMPRESSION
pub const INO_IP_COMPRESSION_NONE: i32 = 0;
pub const INO_IP_COMPRESSION_PACKBITS: i32 = 1;
pub const INO_IP_COMPRESSION_GROUP4: i32 = 5;
pub const INO_IP_COMPRESSION_JPEG: i32 = 6;

// Same numbers as ICAP_IMAGEFILEFORMAT
pub const INO_IP_FILEFORMAT_TIFF: i32 = 0;
pub const INO_IP_FILEFORMAT_BMP: i32 = 2;
pub const INO_IP_FILEFORMAT_JFIF: i32 = 4;

pub const INO_IP_AUTOROTATE_RESULT_OFF: i32 = 0;
pub const INO_IP_AUTOROTATE_RESULT_0DEG: i32 = 1;
pub const INO_IP_AUTOROTATE_RESULT_90DEG: i32 = 2;
pub const INO_IP_AUTOROTATE_RESULT_180DEG: i32 = 3;
pub const INO_IP_AUTOROTATE_RESULT_270DEG: i32 = 4;
pub const INO_IP_AUTOROTATE_RESULT_UNDETECTED: i32 = 5;

pub const INO_IP_PREF_COL_TYPE_UNKNOWN: i32 = 0; // Can also mean OFF
pub const INO_IP_PREF_COL_TYPE_BITONAL: i32 = 1;
pub const INO_IP_PREF_COL_TYPE_COLOR: i32 = 2;
pub const INO_IP_PREF_COL_TYPE_GRAY: i32 = 3;

pub const INO_IP_BARCODE_TYPE_UNDETECTED: i32 = 0;
pub const INO_IP_BARCODE_TYPE_CODE128: i32 = 1;
pub const INO_IP_BARCODE_TYPE_2OF5I: i32 = 2;
pub const INO_IP_BARCODE_TYPE_CODE39: i32 = 3;

pub const INO_IP_BARCODE2D_TYPE_NONE: i32 = 0;
pub const INO_IP_BARCODE2D_TYPE_QRCODE: i32 = 1;
pub const INO_IP_BARCODE2D_TYPE_DATAMATRIX: i32 = 2;

pub const INO_IP_PATCHCODE_NO_PATCH: i32 = 0;
pub const INO_IP_PATCHCODE_PATCH_T: i32 = 1;
pub const INO_IP_PATCHCODE_PATCH_2: i32 = 2;
pub const INO_IP_PATCHCODE_PATCH_3: i32 = 3;
pub const INO_IP_PATCHCODE_PATCH_1: i32 = 4;
pub const INO_IP_PATCHCODE_PATCH_4: i32 = 5;
pub const INO_IP_PATCHCODE_PATCH_6: i32 = 6;

pub const INO_IP_DOUBLEFEED_NONE: i32 = 0;
pub const INO_IP_DOUBLEFEED_YES: i32 = 1;
pub const INO_IP_DOUBLEFEED_TRANSFER: i32 = 2;

pub const INO_IP_BLANKPAGE_NONE: i32 = 0;
pub const INO_IP_BLANKPAGE_MARKED: i32 = 1;
pub const INO_IP_BLANKPAGE_DELETED: i32 = 2;

pub const INO_IP_INTEGRITY_OK: i32 = 0;
pub const INO_IP_INTEGRITY_FRONTFAILED: i32 = 1;
pub const INO_IP_INTEGRITY_BACKFAILED: i32 = 2;
pub const INO_IP_INTEGRITY_BOTHFAILED: i32 = 3;
pub const INO_IP_INTEGRITY_TRANSFER: i32 = 4;

pub const INO_IP_ENDORSED_POS_OFF: i32 = 0;
pub const INO_IP_ENDORSED_POS_PRE: i32 = 1;
pub const INO_IP_ENDORSED_POS_POST: i32 = 2;

/// `ImageProperties_t`, declared under `#pragma pack(1)`.
#[repr(C, packed)]
#[derive(Clone, Copy)]
pub struct ImageProperties_t {
    pub streamID: i32,
    pub scanSide: i32,

    // General
    pub seqID: i64,
    pub counter: [i64; 4],
    pub date: [c_char; 8 + 1], // [YYYYMMDD+\0]
    pub time: [c_char; 9 + 1], // [HHMMSSsss+\0]
    pub scanResolution: i32,
    pub input: i32,
    pub output: i32,
    pub reservedGeneral: [c_char; INO_IP_RESERVED_GENERAL],

    // Image
    pub resolution: i32,
    pub lines: i32,
    pub bytesPerLine: i32,
    pub pixelsPerLine: i32,
    pub bitsPerPixel: i32,
    pub size: i32,
    pub fileformat: i32,
    pub compression: i32,

    pub snipped: i32, // bool

    pub reservedImage: [c_char; INO_IP_RESERVED_IMAGE],

    // Sheet
    pub autorotateResult: i32,
    pub prefColType: i32,
    pub blankPageValue: i32, // 0..100 (higher value means more information on sheet)
    pub barcodeType: i32,
    pub unused: [c_char; 16 + 1], // old barcodeText
    pub patchCode: i32,
    pub doubleFeed: i32,
    pub blankPage: i32,
    pub sheetDeleted: i32,   // bool (Counters not triggered and image deleted)
    pub imageDeleted: i32,   // bool (Counters triggered and image deleted)
    pub feederSwitched: i32, // bool
    pub integrity: i32,
    pub integrityFrontDetail: i32, // bit field, use #define's to extract boolean results
    pub integritytBackDetail: i32, // (sic) spelled this way in the header
    pub barcode2DType: i32,
    pub barcode2DText: [c_char; INO_IP_BARCODE2DSIZE],
    pub barcodeText: [c_char; INO_IP_BARCODESIZE],
    pub autorotateConfidence: i32,
    pub reservedSheet: [c_char; INO_IP_RESERVED_SHEET],

    // Annotations
    pub endorsedPosFront: i32,
    pub endorserFrontText: [c_char; INO_IP_ENDORSERTEXT],

    pub endorsedPosBack: i32,
    pub endorserBackText: [c_char; INO_IP_ENDORSERTEXT],

    pub stamped: i32, // bool
    pub stampText: [c_char; INO_IP_STAMPTEXT],

    pub fixedText: [c_char; INO_IP_FIXEDTEXT],

    pub reservedAnnotations: [c_char; INO_IP_RESERVED_ANNOTATIONS],
}

/// `ImageInfo_t`. The library allocates one per image and the callee frees it.
#[repr(C, packed)]
#[derive(Clone, Copy)]
pub struct ImageInfo_t {
    pub version: i32, // Version of this structure
    pub size: i32,    // Size of this structure in bytes
    pub offset: i32,  // Offset to the Image Data from the beginning of this structure

    pub ImageProperties: ImageProperties_t,
}

pub const COMMANDLEN: usize = 16 * 1024;

/// `ScannerControl_t`.
#[repr(C, packed)]
#[derive(Clone, Copy)]
pub struct ScannerControl_t {
    pub CType: u32,                     // Type of Control
    pub CNumData: u32,                  // Additional numerical info
    pub CStrData: [c_char; COMMANDLEN], // Additional string info
}

/// `void func(char* str)`; the driver frees `str` after the call.
pub type LogFunctionCB = unsafe extern "C" fn(str_: *mut c_char);

/// `void func(ScannerControl_t*)`; the callee frees the struct.
pub type ScannerControlCB = unsafe extern "C" fn(pScannerControl: *mut ScannerControl_t);

/// `void func(ImageInfo_t*, BYTE* pImage)`; the callee frees both buffers.
pub type ImageCB = unsafe extern "C" fn(ImageInfo: *mut ImageInfo_t, pImage: *mut u8);

/// The entry points `inoapi.hpp` declares, plus the undocumented exports used here.
pub struct Symbols {
    pub ScannerConnect: unsafe extern "C" fn(*const c_char, i32, i32) -> u32,
    pub ScannerDisconnect: unsafe extern "C" fn() -> u32,
    pub GetScannerSetup: unsafe extern "C" fn(*mut *mut c_char) -> u32,
    pub SetScannerSetup: unsafe extern "C" fn(*mut c_char) -> u32,
    pub SetReady: unsafe extern "C" fn(i32) -> u32,
    pub ImagesAvailable: unsafe extern "C" fn() -> u32,
    pub GetScannerState: unsafe extern "C" fn() -> u32,
    pub ScanStart: unsafe extern "C" fn() -> u32,
    pub ScanStop: unsafe extern "C" fn() -> u32,
    pub ScanBreak: unsafe extern "C" fn() -> u32,
    pub ScanContinue: unsafe extern "C" fn() -> u32,
    pub GetScannerVersion: unsafe extern "C" fn(*mut *mut c_char) -> u32,
    pub GetApiVersion: unsafe extern "C" fn(*mut *mut c_char) -> u32,
    pub SetCB_LogFunctionCB: unsafe extern "C" fn(*mut c_void) -> u32,
    pub SetCB_ScannerControlCB: unsafe extern "C" fn(*mut c_void) -> u32,
    pub SetCB_ImageCB: unsafe extern "C" fn(*mut c_void) -> u32,
    pub AllocBuffer: unsafe extern "C" fn(i32) -> *mut c_void,
    pub FreeBuffer: unsafe extern "C" fn(*mut c_void) -> u32,

    // Undocumented; signatures inferred from the binary.
    pub GetFeederLoaded: unsafe extern "C" fn() -> u32,
    pub GetFeederNextLoaded: unsafe extern "C" fn() -> u32,
    pub GetFeederSide: unsafe extern "C" fn() -> u32,
    pub GetScannerOperationalState: unsafe extern "C" fn() -> u32,
    pub SetNumberOfSheets: unsafe extern "C" fn(u32) -> u32,
    pub SetPrinterstring: unsafe extern "C" fn(*const c_char) -> u32,
    pub SetCounter: unsafe extern "C" fn(u32, i64) -> u32,
    pub GetScannerSetupDefault: unsafe extern "C" fn(*mut *mut c_char) -> u32,
    pub GetScannerSetupListSync: unsafe extern "C" fn(*mut *mut c_char) -> u32,
    pub SelectScannerSetup: unsafe extern "C" fn(*const c_char) -> u32,
    pub GetLastLogs: unsafe extern "C" fn(*const c_char) -> u32,
    pub GetAllLogs: unsafe extern "C" fn(*const c_char) -> u32,
}

/// Why the driver could not be opened.
#[derive(Debug, thiserror::Error)]
pub enum LoadError {
    #[error("could not open {path}: {source}")]
    Open {
        path: String,
        #[source]
        source: libloading::Error,
    },

    #[error("{path} is missing the symbol `{symbol}`: {source}")]
    Symbol {
        path: String,
        symbol: &'static str,
        #[source]
        source: libloading::Error,
    },
}

/// Renders an error with its chain of sources, which is where `dlopen`'s diagnosis lives.
#[must_use]
pub fn describe(error: &dyn std::error::Error) -> String {
    let mut text = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        let cause_text = cause.to_string();
        if !text.contains(&cause_text) {
            text.push_str(": ");
            text.push_str(&cause_text);
        }
        source = cause.source();
    }
    text
}

/// Where `install_scamaxusb3.sh` puts the driver.
pub const DEFAULT_LIBRARY_PATH: &str = "/opt/inotec/scamaxusb3/lib/libinoapi.so";

/// Environment variable that overrides [`DEFAULT_LIBRARY_PATH`].
pub const LIBRARY_PATH_ENV: &str = "DESKPRO_INOAPI_PATH";

macro_rules! resolve {
    ($library:expr, $path:expr, $name:ident) => {{
        let symbol = concat!(stringify!($name), "\0").as_bytes();
        // SAFETY: the signature in `Symbols` mirrors `inoapi.hpp`; the library is never unloaded.
        let resolved: libloading::Symbol<_> =
            unsafe { $library.get(symbol) }.map_err(|source| LoadError::Symbol {
                path: $path.to_owned(),
                symbol: stringify!($name),
                source,
            })?;
        *resolved
    }};
}

impl Symbols {
    /// Opens the driver, resolves every entry point and points [`vendor_heap`] at its allocator.
    /// The library is never unloaded: its `STB_GNU_UNIQUE` symbols make it `NODELETE` anyway.
    ///
    /// # Safety
    /// The library at `path` must be the `InoTec` `libinoapi.so` these signatures were written
    /// against.
    ///
    /// # Errors
    /// If the library cannot be opened or is missing an entry point.
    pub unsafe fn load(path: &str) -> Result<Self, LoadError> {
        // SAFETY: caller's contract.
        let library: &'static libloading::Library = Box::leak(Box::new(
            unsafe { libloading::Library::new(path) }.map_err(|source| LoadError::Open {
                path: path.to_owned(),
                source,
            })?,
        ));

        let symbols = Self {
            ScannerConnect: resolve!(library, path, ScannerConnect),
            ScannerDisconnect: resolve!(library, path, ScannerDisconnect),
            GetScannerSetup: resolve!(library, path, GetScannerSetup),
            SetScannerSetup: resolve!(library, path, SetScannerSetup),
            SetReady: resolve!(library, path, SetReady),
            ImagesAvailable: resolve!(library, path, ImagesAvailable),
            GetScannerState: resolve!(library, path, GetScannerState),
            ScanStart: resolve!(library, path, ScanStart),
            ScanStop: resolve!(library, path, ScanStop),
            ScanBreak: resolve!(library, path, ScanBreak),
            ScanContinue: resolve!(library, path, ScanContinue),
            GetScannerVersion: resolve!(library, path, GetScannerVersion),
            GetApiVersion: resolve!(library, path, GetApiVersion),
            SetCB_LogFunctionCB: resolve!(library, path, SetCB_LogFunctionCB),
            SetCB_ScannerControlCB: resolve!(library, path, SetCB_ScannerControlCB),
            SetCB_ImageCB: resolve!(library, path, SetCB_ImageCB),
            AllocBuffer: resolve!(library, path, AllocBuffer),
            FreeBuffer: resolve!(library, path, FreeBuffer),
            GetFeederLoaded: resolve!(library, path, GetFeederLoaded),
            GetFeederNextLoaded: resolve!(library, path, GetFeederNextLoaded),
            GetFeederSide: resolve!(library, path, GetFeederSide),
            GetScannerOperationalState: resolve!(library, path, GetScannerOperationalState),
            SetNumberOfSheets: resolve!(library, path, SetNumberOfSheets),
            SetPrinterstring: resolve!(library, path, SetPrinterstring),
            SetCounter: resolve!(library, path, SetCounter),
            GetScannerSetupDefault: resolve!(library, path, GetScannerSetupDefault),
            GetScannerSetupListSync: resolve!(library, path, GetScannerSetupListSync),
            SelectScannerSetup: resolve!(library, path, SelectScannerSetup),
            GetLastLogs: resolve!(library, path, GetLastLogs),
            GetAllLogs: resolve!(library, path, GetAllLogs),
        };
        vendor_heap::install(symbols.AllocBuffer, symbols.FreeBuffer);
        Ok(symbols)
    }
}

/// The driver's own `AllocBuffer` / `FreeBuffer`, which every buffer crossing the API must use.
/// Process-wide so `Drop` impls can reach them; `malloc` / `free` until a driver is loaded.
pub mod vendor_heap {
    use std::ffi::{c_char, c_void};
    use std::sync::{PoisonError, RwLock};

    /// `void* AllocBuffer(int size)`.
    pub type AllocFn = unsafe extern "C" fn(i32) -> *mut c_void;
    /// `uint32_t FreeBuffer(void* ptr)`.
    pub type FreeFn = unsafe extern "C" fn(*mut c_void) -> u32;

    #[derive(Clone, Copy)]
    struct Heap {
        alloc: AllocFn,
        free: FreeFn,
    }

    mod libc {
        use std::ffi::c_void;
        unsafe extern "C" {
            pub fn malloc(size: usize) -> *mut c_void;
            pub fn free(ptr: *mut c_void);
        }
    }

    unsafe extern "C" fn fallback_alloc(size: i32) -> *mut c_void {
        match usize::try_from(size) {
            // SAFETY: plain allocation.
            Ok(size) if size > 0 => unsafe { libc::malloc(size) },
            _ => std::ptr::null_mut(),
        }
    }

    unsafe extern "C" fn fallback_free(ptr: *mut c_void) -> u32 {
        // SAFETY: caller's contract, as for `FreeBuffer`.
        unsafe { libc::free(ptr) };
        0
    }

    static HEAP: RwLock<Heap> = RwLock::new(Heap {
        alloc: fallback_alloc,
        free: fallback_free,
    });

    fn heap() -> Heap {
        *HEAP.read().unwrap_or_else(PoisonError::into_inner)
    }

    pub(super) fn install(alloc: AllocFn, free: FreeFn) {
        *HEAP.write().unwrap_or_else(PoisonError::into_inner) = Heap { alloc, free };
    }

    /// Allocates `size` uninitialized bytes on the driver's heap.
    ///
    /// # Panics
    /// If the allocation fails or `size` exceeds `i32::MAX`.
    #[must_use]
    pub fn alloc(size: usize) -> *mut c_void {
        let size = i32::try_from(size).expect("buffer larger than AllocBuffer's int size");
        // SAFETY: `AllocBuffer` has no preconditions.
        let p = unsafe { (heap().alloc)(size) };
        assert!(!p.is_null(), "AllocBuffer({size}) failed");
        p
    }

    /// Copies `bytes` and a trailing NUL onto the driver's heap.
    #[must_use]
    pub fn new_c_string(bytes: &[u8]) -> *mut c_char {
        let p = alloc(bytes.len() + 1).cast::<u8>();
        // SAFETY: `p` is a fresh, writable allocation of `bytes.len() + 1` bytes.
        unsafe {
            std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, bytes.len());
            *p.add(bytes.len()) = 0;
        }
        p.cast()
    }

    /// Frees a buffer the driver allocated, or one from [`alloc`]. Null is a no-op.
    ///
    /// # Safety
    /// `ptr` must have come from the driver (or [`alloc`]) and must not be freed twice.
    pub unsafe fn free(ptr: *mut c_void) {
        if !ptr.is_null() {
            // SAFETY: caller's contract. The only failure is for null, excluded above.
            let _ = unsafe { (heap().free)(ptr) };
        }
    }
}

/// With `[GUI] local=off` the driver calls its `lpfn_currentOperationalState` slot without a null
/// check, crashing on the first operational-state message. This points the slot at our own
/// handler, locating it through the library's `.symtab` and the mapping base from `dladdr`.
pub mod ui_shim {
    use std::ffi::{CStr, c_char, c_int, c_void};

    const SLOT_SYMBOL: &str = "lpfn_currentOperationalState";

    #[repr(C)]
    #[allow(clippy::struct_field_names)] // the C names
    struct DlInfo {
        dli_fname: *const c_char,
        dli_fbase: *mut c_void,
        dli_sname: *const c_char,
        dli_saddr: *mut c_void,
    }

    unsafe extern "C" {
        fn dladdr(addr: *const c_void, info: *mut DlInfo) -> c_int;
    }

    /// The driver's operational-state callback.
    pub type OperationalStateFn = unsafe extern "C" fn(c_int);

    /// What [`install`] did.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum Outcome {
        /// The slot now points at the given handler (it may already have, from an earlier connect).
        Patched,
        /// The slot was already set — the GUI module is loaded, or the driver has been fixed.
        AlreadySet,
    }

    /// Points the slot in the library that `exported_fn` belongs to at `handler`.
    ///
    /// # Safety
    /// `exported_fn` must be resolved from the `InoTec` driver, and nothing may use the slot
    /// concurrently (true before `ScannerConnect`).
    ///
    /// # Errors
    /// If the library's path, mapping base or symbol table cannot be found, with the reason.
    pub unsafe fn install(
        exported_fn: *const c_void,
        handler: OperationalStateFn,
    ) -> Result<Outcome, String> {
        let mut info = DlInfo {
            dli_fname: std::ptr::null(),
            dli_fbase: std::ptr::null_mut(),
            dli_sname: std::ptr::null(),
            dli_saddr: std::ptr::null_mut(),
        };
        // SAFETY: `info` is a valid out-parameter; `dladdr` only reads `exported_fn`'s value.
        if unsafe { dladdr(exported_fn, &raw mut info) } == 0
            || info.dli_fname.is_null()
            || info.dli_fbase.is_null()
        {
            return Err("dladdr could not identify the driver's mapping".to_owned());
        }
        // SAFETY: `dladdr` returns a NUL-terminated path owned by the loader.
        let path = unsafe { CStr::from_ptr(info.dli_fname) }
            .to_string_lossy()
            .into_owned();
        let image = std::fs::read(&path).map_err(|e| format!("could not read {path}: {e}"))?;
        let offset = find_symbol(&image, SLOT_SYMBOL)
            .ok_or_else(|| format!("{path} has no `{SLOT_SYMBOL}` in its symbol table"))?;
        let offset = usize::try_from(offset).map_err(|_| "symbol offset out of range")?;

        let slot = info
            .dli_fbase
            .wrapping_byte_add(offset)
            .cast::<Option<OperationalStateFn>>();
        // SAFETY: `slot` is the library's own `.bss` variable, writable and 8-aligned, and the
        // caller guarantees nothing reads it concurrently.
        unsafe {
            match slot.read() {
                None => slot.write(Some(handler)),
                Some(current) if current as usize == handler as usize => {}
                Some(_) => return Ok(Outcome::AlreadySet),
            }
        }
        Ok(Outcome::Patched)
    }

    fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
        Some(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
    }
    fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
        Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
    }
    fn u64_at(bytes: &[u8], at: usize) -> Option<u64> {
        Some(u64::from_le_bytes(bytes.get(at..at + 8)?.try_into().ok()?))
    }

    /// The `st_value` of `name` in an ELF64 little-endian image's `.symtab`, if present.
    #[must_use]
    pub fn find_symbol(image: &[u8], name: &str) -> Option<u64> {
        const ELF_MAGIC: &[u8] = b"\x7fELF\x02\x01";
        const SHT_SYMTAB: u32 = 2;
        const SYM_SIZE: usize = 24;
        if image.get(..ELF_MAGIC.len())? != ELF_MAGIC {
            return None;
        }
        let shoff = usize::try_from(u64_at(image, 0x28)?).ok()?;
        let shentsize = usize::from(u16_at(image, 0x3a)?);
        let shnum = usize::from(u16_at(image, 0x3c)?);

        let section = |index: usize| -> Option<(u32, usize, usize, u32)> {
            let base = shoff.checked_add(index.checked_mul(shentsize)?)?;
            Some((
                u32_at(image, base + 0x4)?,
                usize::try_from(u64_at(image, base + 0x18)?).ok()?,
                usize::try_from(u64_at(image, base + 0x20)?).ok()?,
                u32_at(image, base + 0x28)?,
            ))
        };

        for index in 0..shnum {
            let (kind, offset, size, link) = section(index)?;
            if kind != SHT_SYMTAB {
                continue;
            }
            let (_, str_offset, str_size, _) = section(usize::try_from(link).ok()?)?;
            let strtab = image.get(str_offset..str_offset.checked_add(str_size)?)?;
            let symtab = image.get(offset..offset.checked_add(size)?)?;
            for sym in symtab.as_chunks::<SYM_SIZE>().0 {
                let name_offset = usize::try_from(u32_at(sym, 0)?).ok()?;
                let rest = strtab.get(name_offset..)?;
                let end = rest.iter().position(|&b| b == 0)?;
                if &rest[..end] == name.as_bytes() {
                    return u64_at(sym, 8);
                }
            }
        }
        None
    }

    #[cfg(test)]
    mod tests {
        use super::find_symbol;

        #[test]
        fn finds_an_unmangled_symbol_in_this_test_binary() {
            let image = std::fs::read(std::env::current_exe().expect("exe")).expect("read");
            assert!(find_symbol(&image, "main").is_some());
            assert!(find_symbol(&image, "definitely_not_a_symbol_here").is_none());
            assert!(find_symbol(b"not an elf", "main").is_none());
        }
    }
}
