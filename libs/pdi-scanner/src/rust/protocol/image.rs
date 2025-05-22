use image::{DynamicImage, GrayImage};

use crate::client::ImageCalibrationTables;

use super::types::ScanSideMode;

pub const DEFAULT_IMAGE_WIDTH: u32 = 1728;

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
        .enumerate()
        .map(|(index, pixel)| {
            // TODO optimize this so we're not recomputing it for every pixel
            let white_calibration = white_calibration_table[index] as i16;
            let black_calibration = black_calibration_table[index] as i16;
            let denominator = (white_calibration - black_calibration) as u16;
            let numerator = (*pixel as i16 - black_calibration).clamp(0, 255) as u16;
            if denominator <= 0 {
                0
            } else {
                (numerator * 255 / denominator).min(255) as u8
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

        let height = self.compute_expected_height(width, scan_side_mode)?;

        let (top_raw, bottom_raw): (Vec<u8>, Vec<u8>) = self
            .data
            .chunks_exact(2)
            .into_iter()
            .map(|pixel_pair| (pixel_pair[0], pixel_pair[1]))
            .unzip();

        let top: Vec<u8> = top_raw
            .chunks_exact(width as usize)
            .map(|row| row.iter().copied().rev().collect::<Vec<_>>())
            .map(|row| {
                apply_image_calibration(
                    &row,
                    &image_calibration_tables.front_white,
                    &image_calibration_tables.front_black,
                )
            })
            .flatten()
            .collect();

        let bottom: Vec<u8> = bottom_raw
            .chunks_exact(width as usize)
            .map(|row| {
                apply_image_calibration(
                    row,
                    &image_calibration_tables.back_white,
                    &image_calibration_tables.back_black,
                )
            })
            .flatten()
            .collect();

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

        if self.data.len() % page_count != 0 {
            return Err(Error::InvalidData(format!(
                "data length {} is not divisible by {}",
                self.data.len(),
                page_count
            )));
        }

        let pixels_per_side = self.data.len() / page_count;
        Ok((pixels_per_side / width as usize) as u32)
    }
}

/// A single sheet of data, either simplex or duplex.
#[derive(Debug, PartialEq, Eq)]
pub enum Sheet<T> {
    Simplex(T),
    Duplex(T, T),
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid data: {0}")]
    InvalidData(String),
}

#[cfg(test)]
mod tests {
    // use super::*;

    // TODO
    // #[test]
    // fn test_raw_image_data_8bpp_duplex() {
    //     let mut data = RawImageData::new();
    //     data.extend_from_slice(&[0b10101010, 0b01010101, 0b10101010, 0b01010101]);
    //     assert_eq!(
    //         data.try_decode_scan(8, ScanSideMode::Duplex).unwrap(),
    //         Sheet::Duplex(
    //             ScanPage::new(8, 2, vec![0b10011001, 0b10011001]).unwrap(),
    //             ScanPage::new(8, 2, vec![0b01100110, 0b01100110]).unwrap()
    //         )
    //     );
    // }

    // #[test]
    // fn test_skip_starting_black_pixels() {
    //     let scan_page =
    //         ScanPage::new(8, 4, vec![0b11111111, 0b11111111, 0b10011001, 0b10011001]).unwrap();
    //     let image = scan_page.to_cropped_image().unwrap();
    //     assert_eq!(
    //         image.to_vec(),
    //         vec![
    //             0x00, 0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0xff,
    //             0xff, 0x00
    //         ]
    //     );
    // }
}
