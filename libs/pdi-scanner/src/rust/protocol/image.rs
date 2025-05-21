use image::{DynamicImage, GrayImage};

use crate::client::ImageCalibrationTables;

use super::types::ScanSideMode;

pub const DEFAULT_IMAGE_WIDTH: u32 = 1728;

fn apply_image_calibration(
    row: &[u8],
    image_calibration_tables: &ImageCalibrationTables,
) -> Vec<u8> {
    assert!(
        row.len() == image_calibration_tables.white.len()
            && row.len() == image_calibration_tables.black.len(),
        "Image calibration tables must be the same length as the row"
    );
    row.iter()
        .enumerate()
        .map(|(index, pixel)| {
            let white_calibration = image_calibration_tables.white[index] as i16;
            let black_calibration = image_calibration_tables.black[index] as i16;
            let denominator = white_calibration - black_calibration;
            let white_adjustment = 1.0;
            let denominator = (denominator as f32 * white_adjustment).round() as i16;
            let numerator = (*pixel as i16 - black_calibration).clamp(0, 255);
            // if index == 10 {
            //     println!(
            //         "pixel: {}, white: {}, black: {}, denominator: {}, numerator: {}, result: {}",
            //         pixel,
            //         white_calibration,
            //         black_calibration,
            //         denominator,
            //         numerator,
            //         if denominator > 0 {
            //             ((numerator as u16 * 255) / denominator as u16).min(255) as i16
            //         } else {
            //             -1
            //         }
            //     );
            // }
            if denominator <= 0 {
                0
            } else {
                ((numerator as u16 * 255) / denominator as u16).min(255) as u8
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
        // the scanner sends the data XOR'd with 0x33
        self.data.extend(slice.iter().map(|byte| *byte)); // ^ 0x33));
    }

    /// Attempts to decode data as image(s) from the scanner. The data is
    /// assumed to be 1bpp, with the pixels being sent in rows from the scanner,
    /// each row of the given width. When scanning duplex, data is sent such
    /// that each byte alternates between the top and bottom side, with the top
    /// side first.
    ///
    /// The CIS sensor sends data from the same position on the sensor for both
    /// sides, meaning that the top side pixels are received right to left and the
    /// bottom side pixels are received left to right. This method corrects for
    /// this by reversing the order of the pixels for the top side when scanning
    /// simplex top only or duplex. This means that you must be sure of the
    /// scanning mode when calling this method in order to get the correct
    /// result.
    #[allow(clippy::missing_panics_doc)]
    pub fn try_decode_scan(
        &self,
        width: u32,
        scan_side_mode: ScanSideMode,
        image_calibration_tables: &ImageCalibrationTables,
    ) -> Result<Sheet<ScanPage>, Error> {
        let height = self.compute_expected_height(width, scan_side_mode)?;

        match scan_side_mode {
            ScanSideMode::SimplexBottomOnly => ScanPage::new(width, height, self.data.clone())
                .map(Sheet::Simplex)
                .ok_or_else(|| Error::InvalidData("unexpected data length".to_string())),

            ScanSideMode::SimplexTopOnly => ScanPage::new(
                width,
                height,
                self.data
                    .chunks_exact(width as usize / u8::BITS as usize)
                    .flat_map(|row| row.iter().rev().map(|byte| byte.reverse_bits()))
                    .collect(),
            )
            .map(Sheet::Simplex)
            .ok_or_else(|| Error::InvalidData("unexpected data length".to_string())),

            ScanSideMode::Duplex => {
                let (top_raw, bottom_raw): (Vec<u8>, Vec<u8>) = self
                    .data
                    .chunks_exact(2)
                    .into_iter()
                    .map(|pixel_pair| (pixel_pair[0], pixel_pair[1]))
                    .unzip();

                let top: Vec<u8> = top_raw
                    .chunks_exact(width as usize)
                    .map(|row| row.iter().copied().rev().collect::<Vec<_>>())
                    .map(|row| apply_image_calibration(&row, image_calibration_tables))
                    .flatten()
                    .collect();

                let bottom: Vec<u8> = bottom_raw
                    .chunks_exact(width as usize)
                    .map(|row| apply_image_calibration(row, image_calibration_tables))
                    .flatten()
                    .collect();

                GrayImage::from_raw(width, (top_raw.len() / width as usize) as u32, top_raw)
                    .unwrap()
                    .save("top-raw.png")
                    .unwrap();
                GrayImage::from_raw(
                    width,
                    (bottom_raw.len() / width as usize) as u32,
                    bottom_raw,
                )
                .unwrap()
                .save("bottom-raw.png")
                .unwrap();
                println!("top: {:?}", top.len());
                println!("bottom: {:?}", bottom.len());
                println!("white table: {:?}", image_calibration_tables.white.len());
                println!("black table: {:?}", image_calibration_tables.black.len());

                let top_page = ScanPage::new(width, height, top)
                    .ok_or_else(|| Error::InvalidData("unexpected data length".to_string()))?;
                let bottom_page = ScanPage::new(width, height, bottom)
                    .ok_or_else(|| Error::InvalidData("unexpected data length".to_string()))?;
                Ok(Sheet::Duplex(top_page, bottom_page))
            }
        }
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

        // for now we assume that the data is 1bpp
        let pixels = self.data.len();
        let pixels_per_side = pixels / page_count;
        Ok((pixels_per_side / width as usize) as u32)
    }
}

/// A single sheet of data, either simplex or duplex.
#[derive(Debug, PartialEq, Eq)]
pub enum Sheet<T> {
    Simplex(T),
    Duplex(T, T),
}

/// A single page of scanned data. Pixel data is stored as 1bpp.
#[derive(Debug, PartialEq, Eq)]
pub struct ScanPage {
    width: u32,
    height: u32,
    data: Vec<u8>,
}

impl ScanPage {
    #[must_use]
    pub fn new(width: u32, height: u32, data: Vec<u8>) -> Option<Self> {
        if data.len() as u32 * u8::BITS < width * height {
            return None;
        }

        Some(Self {
            width,
            height,
            data,
        })
    }

    /// Converts the page to an 8bpp grayscale image and crops off any all-black
    /// rows at the top and bottom. Returns None if the image is entirely black.
    #[must_use]
    pub fn to_cropped_image(&self) -> Option<GrayImage> {
        let data = self.data.clone(); //convert_1bpp_to_8bpp();
        let image =
            GrayImage::from_raw(self.width, (data.len() / self.width as usize) as u32, data)
                .expect("from_raw can only fail if the data buffer is not big enough for the dimensions, but we compute the dimensions from the data buffer");
        let image = DynamicImage::ImageLuma8(image);
        // let crop_start = self.find_crop_start();
        // let crop_end = self.find_crop_end();

        // if crop_start >= crop_end {
        //     return None;
        // }

        Some(
            image
                // .crop(0, crop_start, self.width, crop_end - crop_start)
                .into_luma8(),
        )
    }

    // Finds the start of the crop area by looking for the first row that is
    // not completely black. The value is returned as the row index, i.e. the
    // number of rows to skip from the top or the y-coordinate of the start of
    // the crop area, where the start is inclusive.
    // fn find_crop_start(&self) -> u32 {
    //     self.data
    //         .chunks_exact((self.width) as usize)
    //         .take_while(|row_data| row_data.iter().all(|byte| *byte == u8::MAX))
    //         .count() as u32
    // }

    // Finds the end of the crop area by looking for the first row that is not
    // completely black, starting from the bottom. The value is returned as
    // the row index, i.e. the number of rows to skip from the bottom or the
    // y-coordinate of the end of the crop area, where the end is exclusive.
    // fn find_crop_end(&self) -> u32 {
    //     self.height
    //         - self
    //             .data
    //             .chunks_exact((self.width) as usize)
    //             .rev()
    //             .take_while(|row_data| row_data.iter().all(|byte| *byte == u8::MAX))
    //             .count() as u32
    // }

    // Converts 1bpp data to 8bpp grayscale data.
    // fn convert_1bpp_to_8bpp(&self) -> Vec<u8> {
    //     self.data
    //         .iter()
    //         .copied()
    //         .flat_map(|byte| {
    //             (0..u8::BITS).rev().map(move |i| {
    //                 // convert `1` to black and `0` to white
    //                 if byte & (1 << i) == 0 {
    //                     u8::MAX
    //                 } else {
    //                     u8::MIN
    //                 }
    //             })
    //         })
    //         .collect()
    // }
}

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("invalid data: {0}")]
    InvalidData(String),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_raw_image_data_1bpp_simplex_top_only() {
        let mut data = RawImageData::new();
        data.extend_from_slice(&[0b10101010, 0b01010101]);
        assert_eq!(
            data.try_decode_scan(8, ScanSideMode::SimplexTopOnly)
                .unwrap(),
            Sheet::Simplex(ScanPage::new(8, 2, vec![0b10011001, 0b01100110]).unwrap())
        );
    }

    #[test]
    fn test_raw_image_data_1bpp_duplex() {
        let mut data = RawImageData::new();
        data.extend_from_slice(&[0b10101010, 0b01010101, 0b10101010, 0b01010101]);
        assert_eq!(
            data.try_decode_scan(8, ScanSideMode::Duplex).unwrap(),
            Sheet::Duplex(
                ScanPage::new(8, 2, vec![0b10011001, 0b10011001]).unwrap(),
                ScanPage::new(8, 2, vec![0b01100110, 0b01100110]).unwrap()
            )
        );
    }

    #[test]
    fn test_skip_starting_black_pixels() {
        let scan_page =
            ScanPage::new(8, 4, vec![0b11111111, 0b11111111, 0b10011001, 0b10011001]).unwrap();
        let image = scan_page.to_cropped_image().unwrap();
        assert_eq!(
            image.to_vec(),
            vec![
                0x00, 0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0xff,
                0xff, 0x00
            ]
        );
    }
}
