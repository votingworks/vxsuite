use rayon::{
    iter::{IndexedParallelIterator, ParallelIterator},
    slice::ParallelSliceMut,
};

use image::GrayImage;

use crate::client::ImageCalibrationTables;

use super::types::ScanSideMode;

pub const DEFAULT_IMAGE_WIDTH: u32 = 1728;

/// Applies image calibration to a single pixel based on the white and black
/// calibration values for its column (retrieved from the scanner). The
/// formula used is based on guidance from PDI.
fn apply_image_calibration(pixel: u8, white_calibration: u8, black_calibration: u8) -> u8 {
    let denominator = white_calibration.saturating_sub(black_calibration);
    if denominator == 0 {
        return 0;
    }
    let numerator = pixel.saturating_sub(black_calibration);
    #[allow(clippy::cast_possible_truncation)]
    {
        ((u32::from(numerator) * u32::from(u8::MAX)) / u32::from(denominator))
            .min(u32::from(u8::MAX)) as u8
    }
}

/// Container for raw image data from the scanner. Decodes the data as images
/// (see [`RawImageData::try_decode_scan`]).
#[derive(Debug, Default)]
pub struct RawImageData {
    data: Vec<u8>,
}

impl RawImageData {
    #[must_use]
    pub const fn new() -> Self {
        Self { data: Vec::new() }
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.data.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    pub fn clear(&mut self) {
        self.data.clear();
    }

    /// Extends the data with the given slice. This is intended to be given the
    /// raw data from the scanner.
    pub fn extend_from_slice(&mut self, slice: &[u8]) {
        self.data.extend(slice);
    }

    /// Attempts to decode data as image(s) from the scanner. The data is
    /// assumed to be 1 byte per pixel, with the pixels being sent in rows from
    /// the scanner, each row of the given width. When scanning duplex, data is
    /// sent such that each byte alternates between the top and bottom side,
    /// with the top side first.
    ///
    /// The CIS sensor sends data from the same position on the sensor for both
    /// sides, meaning that the top side pixels are received right to left and the
    /// bottom side pixels are received left to right. This method corrects for
    /// this by reversing the order of the pixels for the top side.
    ///
    /// It also applies the image calibration tables to the raw image data,
    /// normalizing the pixel values based on the calibration data acquired from
    /// the scanner.
    ///
    /// # Errors
    ///
    /// Fails if the image data is empty or otherwise the wrong length.
    #[allow(clippy::missing_panics_doc)]
    pub fn try_decode_scan(
        &self,
        width: u32,
        scan_side_mode: ScanSideMode,
        image_calibration_tables: &ImageCalibrationTables,
    ) -> Result<Sheet<GrayImage>, Error> {
        assert!(
            matches!(scan_side_mode, ScanSideMode::Duplex),
            "Only duplex scanning is supported"
        );

        if self.data.is_empty() {
            return Err(Error::InvalidData("empty image data".to_string()));
        }
        let height = self.compute_expected_height(width, scan_side_mode)?;
        let width = width as usize;

        let tables = image_calibration_tables;
        assert!(
            tables.front_white.len() == width
                && tables.front_black.len() == width
                && tables.back_white.len() == width
                && tables.back_black.len() == width,
            "Image calibration tables must be the same length as the row"
        );

        // Decode in a single parallel pass, writing each output pixel exactly
        // once into preallocated buffers: de-interleave the duplex byte
        // stream (even bytes are the top side, odd bytes the bottom),
        // reverse the top side's pixel order within each row, and apply the
        // per-column calibration.
        let mut top = vec![0u8; width * height as usize];
        let mut bottom = vec![0u8; width * height as usize];
        top.par_chunks_exact_mut(width)
            .zip(bottom.par_chunks_exact_mut(width))
            .enumerate()
            .for_each(|(row_index, (top_row, bottom_row))| {
                let input_row = &self.data[row_index * 2 * width..(row_index + 1) * 2 * width];
                for x in 0..width {
                    top_row[x] = apply_image_calibration(
                        input_row[2 * (width - 1 - x)],
                        tables.front_white[x],
                        tables.front_black[x],
                    );
                    bottom_row[x] = apply_image_calibration(
                        input_row[2 * x + 1],
                        tables.back_white[x],
                        tables.back_black[x],
                    );
                }
            });

        #[allow(clippy::cast_possible_truncation)]
        let width = width as u32;
        let top_page = GrayImage::from_raw(width, height, top)
            .ok_or_else(|| Error::InvalidData("unexpected data length".to_string()))?;
        let bottom_page = GrayImage::from_raw(width, height, bottom)
            .ok_or_else(|| Error::InvalidData("unexpected data length".to_string()))?;
        Ok(Sheet::Duplex(top_page, bottom_page))
    }

    /// Computes the expected height of the image(s) based on the width and the
    /// scan side mode.
    ///
    /// # Errors
    ///
    /// Returns an error if the data length is not divisible by the page count
    /// of the scan side mode. For example, if the data length is 555 and the
    /// scan side mode is `Duplex`, then an error will be returned because 555
    /// is not divisible by 2.
    fn compute_expected_height(
        &self,
        width: u32,
        scan_side_mode: ScanSideMode,
    ) -> Result<u32, Error> {
        let page_count = scan_side_mode.page_count() as usize;

        if !self.data.len().is_multiple_of(page_count) {
            return Err(Error::InvalidData(format!(
                "data length {} is not divisible by {}",
                self.data.len(),
                page_count
            )));
        }

        let pixels_per_side = self.data.len() / page_count;
        #[allow(clippy::cast_possible_truncation)]
        Ok((pixels_per_side / width as usize) as u32)
    }
}

/// A single sheet of data, either simplex or duplex.
#[derive(Debug, PartialEq, Eq)]
pub enum Sheet<T> {
    Simplex(T),
    Duplex(T, T),
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum Error {
    #[error("invalid data: {0}")]
    InvalidData(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_raw_image_data_duplex() {
        let mut data = RawImageData::new();
        let image_calibration_tables = ImageCalibrationTables {
            front_white: vec![255; 2],
            front_black: vec![0; 2],
            back_white: vec![255; 2],
            back_black: vec![0; 2],
        };
        data.extend_from_slice(&[
            0b1010_1010,
            0b0101_0101,
            0b1010_1010,
            0b0101_0101,
            0b1010_1010,
            0b0101_0101,
            0b1010_1010,
            0b0101_0101,
        ]);
        assert_eq!(
            data.try_decode_scan(2, ScanSideMode::Duplex, &image_calibration_tables)
                .unwrap(),
            Sheet::Duplex(
                GrayImage::from_raw(
                    2,
                    2,
                    vec![0b1010_1010, 0b1010_1010, 0b1010_1010, 0b1010_1010]
                )
                .unwrap(),
                GrayImage::from_raw(
                    2,
                    2,
                    vec![0b0101_0101, 0b0101_0101, 0b0101_0101, 0b0101_0101]
                )
                .unwrap(),
            )
        );
    }

    /// Pins the full decode semantics with asymmetric data: de-interleaving,
    /// the top side's right-to-left pixel reversal, per-output-column
    /// calibration (applied after the reversal), and clamping to 255.
    #[test]
    fn test_duplex_reversal_calibration_and_clamping() {
        let mut data = RawImageData::new();
        let image_calibration_tables = ImageCalibrationTables {
            // Output column 0 of the top side is scaled by 255/51 = 5x
            front_white: vec![51, 255, 255],
            front_black: vec![0, 0, 0],
            // Output column 1 of the bottom side is scaled by 5x
            back_white: vec![255, 51, 255],
            back_black: vec![0, 0, 0],
        };
        // Interleaved: top stream [10, 20, 30, 40, 50, 60],
        // bottom stream [1, 2, 3, 4, 5, 6]; width 3, so 2 rows per side
        data.extend_from_slice(&[10, 1, 20, 2, 30, 3, 40, 4, 50, 5, 60, 6]);
        assert_eq!(
            data.try_decode_scan(3, ScanSideMode::Duplex, &image_calibration_tables)
                .unwrap(),
            Sheet::Duplex(
                // Top rows reverse ([10, 20, 30] -> [30, 20, 10]), then
                // column 0 scales 5x; 60 * 5 = 300 clamps to 255
                GrayImage::from_raw(3, 2, vec![150, 20, 10, 255, 50, 40]).unwrap(),
                // Bottom rows keep their order; column 1 scales 5x
                GrayImage::from_raw(3, 2, vec![1, 10, 3, 4, 25, 6]).unwrap(),
            )
        );
    }

    /// A white calibration value equal to the black value would divide by
    /// zero; those pixels are forced to 0.
    #[test]
    fn test_zero_calibration_denominator() {
        let mut data = RawImageData::new();
        let image_calibration_tables = ImageCalibrationTables {
            front_white: vec![100, 255],
            front_black: vec![100, 0],
            back_white: vec![255, 100],
            back_black: vec![0, 100],
        };
        data.extend_from_slice(&[10, 1, 20, 2]);
        assert_eq!(
            data.try_decode_scan(2, ScanSideMode::Duplex, &image_calibration_tables)
                .unwrap(),
            Sheet::Duplex(
                GrayImage::from_raw(2, 1, vec![0, 10]).unwrap(),
                GrayImage::from_raw(2, 1, vec![1, 0]).unwrap(),
            )
        );
    }

    #[test]
    fn test_empty_raw_image_data() {
        let data = RawImageData::new();
        let image_calibration_tables = ImageCalibrationTables {
            front_white: vec![],
            front_black: vec![],
            back_white: vec![],
            back_black: vec![],
        };
        assert_eq!(
            data.try_decode_scan(2, ScanSideMode::Duplex, &image_calibration_tables),
            Err(Error::InvalidData("empty image data".to_string()))
        );
    }
}
