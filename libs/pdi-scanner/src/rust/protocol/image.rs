use rayon::{prelude::ParallelIterator, slice::ParallelSlice};

use image::GrayImage;

use crate::client::ImageCalibrationTables;

use super::types::ScanSideMode;

pub const DEFAULT_IMAGE_WIDTH: u32 = 1728;

/// Applies image calibration to a single row of pixel data based on the
/// provided white and black calibration tables (retrieved from the scanner).
/// The formula used is based on guidance from PDI.
fn apply_image_calibration(
    row: &[u8],
    white_calibration_table: &[u8],
    black_calibration_table: &[u8],
) -> Vec<u8> {
    assert!(
        row.len() == white_calibration_table.len() && row.len() == black_calibration_table.len(),
        "Image calibration tables must be the same length as the row"
    );

    row.iter()
        .zip(white_calibration_table.iter())
        .zip(black_calibration_table.iter())
        .map(|((&pixel, &white_calibration), &black_calibration)| {
            let denominator = white_calibration.saturating_sub(black_calibration);
            let numerator = pixel.saturating_sub(black_calibration);
            #[allow(clippy::cast_possible_truncation)]
            if denominator == 0 {
                0
            } else {
                ((u32::from(numerator) * u32::from(u8::MAX)) / u32::from(denominator))
                    .min(u32::from(u8::MAX)) as u8
            }
        })
        .collect()
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

        let (top_raw, bottom_raw): (Vec<u8>, Vec<u8>) = self
            .data
            .par_chunks_exact(2)
            .map(|pixel_pair| (pixel_pair[0], pixel_pair[1]))
            .unzip();

        let (top, bottom) = rayon::join(
            || {
                top_raw
                    .par_chunks_exact(width as usize)
                    .map(|row| row.iter().copied().rev().collect::<Vec<_>>())
                    .map(|row| {
                        apply_image_calibration(
                            &row,
                            &image_calibration_tables.front_white,
                            &image_calibration_tables.front_black,
                        )
                    })
                    .flatten()
                    .collect()
            },
            || {
                bottom_raw
                    .par_chunks_exact(width as usize)
                    .map(|row| {
                        apply_image_calibration(
                            row,
                            &image_calibration_tables.back_white,
                            &image_calibration_tables.back_black,
                        )
                    })
                    .flatten()
                    .collect()
            },
        );

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
