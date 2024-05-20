use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy)]
pub enum Resolution {
    /// 400 DPI for Pagescan 5
    Native,

    /// 300 DPI, only compatible with Pagescan 5
    Medium,

    /// 200 DPI for Pagescan 5
    Half,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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

impl PartialEq<Side> for &Side {
    fn eq(&self, other: &Side) -> bool {
        **self == *other
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub enum ColorMode {
    /// 24-bit color for the color scanner, or 8-bit grayscale for the grayscale
    /// scanner.
    Native,

    /// 8-bit grayscale for the color scanner, or 1-bit bitonal for the grayscale
    /// scanner.
    #[default]
    LowColor,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum Speed {
    #[default]
    Full,
    Half,
}

#[derive(Debug, Clone, Copy)]
pub enum Direction {
    Increase,
    Decrease,
}

#[derive(Debug, Clone, Copy)]
pub struct BitonalAdjustment {
    pub side: Side,
    pub direction: Direction,
}

impl BitonalAdjustment {
    #[must_use]
    pub const fn new(side: Side, direction: Direction) -> Self {
        Self { side, direction }
    }
}

#[derive(Debug, Clone, Copy)]
pub enum ScanSideMode {
    Duplex,
    SimplexTopOnly,
    SimplexBottomOnly,
}

impl ScanSideMode {
    #[must_use]
    pub const fn page_count(&self) -> u8 {
        match self {
            Self::Duplex => 2,
            Self::SimplexTopOnly | Self::SimplexBottomOnly => 1,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EjectMotion {
    ToRear,
    ToFront,
    ToFrontAndHold,
    ToFrontAndRescan,
}

#[derive(Debug, Clone)]
pub struct Version {
    pub product_id: String,
    pub major: String,
    pub minor: String,
    pub cpld_version: String,
}

impl Version {
    #[must_use]
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
#[derive(Debug, PartialEq, Eq, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    /// Byte 0, Bit 0 (0x01)
    pub rear_left_sensor_covered: bool,
    /// Byte 0, Bit 1 (0x02) – omitted in UltraScan
    pub rear_right_sensor_covered: bool,
    /// Byte 0, Bit 2 (0x04)
    pub brander_position_sensor_covered: bool,
    /// Byte 0, Bit 3 (0x08)
    pub hi_speed_mode: bool,
    /// Byte 0, Bit 4 (0x10)
    pub cover_open: bool,
    /// Byte 0, Bit 5 (0x20) – not defined
    /// future_use: bool,
    /// Byte 0, Bit 6 (0x40)
    pub scanner_enabled: bool,

    /// Byte 1, Bit 0 (0x01)
    pub front_left_sensor_covered: bool,
    /// Byte 1, Bit 1 (0x02) – omitted in UltraScan
    pub front_m1_sensor_covered: bool,
    /// Byte 1, Bit 2 (0x04) – omitted in UltraScan
    pub front_m2_sensor_covered: bool,
    /// Byte 1, Bit 3 (0x08) – omitted in UltraScan
    pub front_m3_sensor_covered: bool,
    /// Byte 1, Bit 4 (0x10) – omitted in UltraScan
    pub front_m4_sensor_covered: bool,
    /// Byte 1, Bit 5 (0x20) – omitted in Duplex and UltraScan
    pub front_m5_sensor_covered: bool,
    /// Byte 1, Bit 6 (0x40) – omitted in Duplex and UltraScan
    pub front_right_sensor_covered: bool,

    /// Byte 2, Bit 0 (0x01)
    pub scanner_ready: bool,
    /// Byte 2, Bit 1 (0x02) – com error
    pub xmt_aborted: bool,
    /// Byte 2, Bit 2 (0x04)
    pub document_jam: bool,
    /// Byte 2, Bit 3 (0x08)
    pub scan_array_pixel_error: bool,
    /// Byte 2, Bit 4 (0x10)
    pub in_diagnostic_mode: bool,
    /// Byte 2, Bit 5 (0x20)
    pub document_in_scanner: bool,
    /// Byte 2, Bit 6 (0x40)
    pub calibration_of_unit_needed: bool,
}

impl Status {
    #[allow(clippy::too_many_arguments)]
    #[must_use]
    pub const fn new(
        rear_left_sensor_covered: bool,
        rear_right_sensor_covered: bool,
        brander_position_sensor_covered: bool,
        hi_speed_mode: bool,
        cover_open: bool,
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
            cover_open,
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

    #[must_use]
    pub const fn rear_sensors_covered(&self) -> bool {
        self.rear_left_sensor_covered && self.rear_right_sensor_covered
    }
}

#[derive(Debug, Clone)]
pub struct Settings {
    pub dpi_setting: u16,
    pub bits_per_pixel: u16,
    pub total_array_pixels: u16,
    pub num_of_arrays: u16,
    pub calibration_status: CalibrationStatus,
    pub number_of_calibration_tables: Option<u16>,
}

impl Settings {
    #[must_use]
    pub const fn new(
        dpi_setting: u16,
        bits_per_pixel: u16,
        total_array_pixels: u16,
        num_of_arrays: u16,
        calibration_status: CalibrationStatus,
        number_of_calibration_tables: Option<u16>,
    ) -> Self {
        Self {
            dpi_setting,
            bits_per_pixel,
            total_array_pixels,
            num_of_arrays,
            calibration_status,
            number_of_calibration_tables,
        }
    }
}

#[derive(Debug, Clone)]
pub enum CalibrationStatus {
    CalibrationNeeded,
    CalibrationOk,
}

impl TryFrom<u16> for CalibrationStatus {
    type Error = ();

    fn try_from(value: u16) -> Result<Self, Self::Error> {
        match value {
            0 => Ok(Self::CalibrationOk),
            1 => Ok(Self::CalibrationNeeded),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum DoubleFeedDetectionCalibrationType {
    #[serde(rename = "single")]
    SingleSheet,

    #[serde(rename = "double")]
    DoubleSheet,
}

impl TryFrom<u8> for DoubleFeedDetectionCalibrationType {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::SingleSheet),
            2 => Ok(Self::DoubleSheet),
            _ => Err(()),
        }
    }
}

impl From<DoubleFeedDetectionCalibrationType> for u8 {
    fn from(value: DoubleFeedDetectionCalibrationType) -> Self {
        match value {
            DoubleFeedDetectionCalibrationType::SingleSheet => 1,
            DoubleFeedDetectionCalibrationType::DoubleSheet => 2,
        }
    }
}

/// A percentage value clamped to the range 0..=100.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ClampedPercentage(u8);

impl ClampedPercentage {
    /// Create a new `ClampedPercentage` if the value is in the range 0..=100.
    #[must_use]
    pub const fn new(value: u8) -> Option<Self> {
        if value <= 100 {
            Some(Self(value))
        } else {
            None
        }
    }

    /// Create a new `ClampedPercentage` without checking the value. The
    /// caller must ensure that the value is in the range 0..=100.
    #[must_use]
    pub const fn new_unchecked(value: u8) -> Self {
        Self(value)
    }

    /// Get the value as a percentage.
    ///
    /// # Example
    ///
    /// ```
    /// use pdi_scanner::protocol::types::ClampedPercentage;
    ///
    /// let percentage = ClampedPercentage::new(50).unwrap();
    /// assert_eq!(percentage.value(), 50);
    /// ```
    #[must_use]
    pub const fn value(&self) -> u8 {
        self.0
    }
}

impl TryFrom<u8> for ClampedPercentage {
    type Error = ();

    fn try_from(value: u8) -> Result<Self, Self::Error> {
        Self::new(value).ok_or(())
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub enum AutoRunOutAtEndOfScanBehavior {
    #[default]
    HoldPaperInEscrow,
    ContinueMotorsToEjectFromRear,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum PickOnCommandMode {
    #[default]
    FeederStaysEnabledBetweenScans,
    FeederMustBeReenabledBetweenScans,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum DoubleFeedDetectionMode {
    #[default]
    Disabled,
    RejectDoubleFeeds,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum FeederMode {
    #[default]
    Disabled,
    AutoScanSheets,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum EjectPauseMode {
    #[default]
    DoNotCheckForInputPaper,
    PauseWhileInputPaperDetected,
}
