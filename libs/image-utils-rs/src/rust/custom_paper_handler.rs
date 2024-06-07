use bitvec::prelude::*;
use itertools::Itertools;

use crate::bitmap::image_to_bitmap;
use crate::bitmap::BitmapOptions;
use crate::rasterize::pdf_to_images;
use crate::rasterize::RasterizeOptions;

const BITMAP_HEIGHT: u32 = 24;

pub struct CustomPaperHandlerBitmap {
    pub data: Vec<u8>,
    pub width: u32,
}

pub struct CustomPaperHandlerBitmapOptions {
    pub width: i32,
    pub white_threshold: u8,
}

pub fn pdf_to_custom_paper_handler_bitmap_series(
    pdf_data: Vec<u8>,
    options: CustomPaperHandlerBitmapOptions,
) -> Vec<Option<CustomPaperHandlerBitmap>> {
    let images = pdf_to_images(
        pdf_data,
        &RasterizeOptions {
            width: options.width,
        },
    );

    // we do not support multi-page PDF printing on the custom paper handler
    let image = images.first().unwrap();
    let image = image_to_bitmap(
        image,
        &BitmapOptions {
            white_threshold: options.white_threshold,
        },
    );

    let num_bitmaps = image.data.len() as u32 / BITMAP_HEIGHT;
    (0..num_bitmaps)
        .into_iter()
        .map(|_k| {
            let mut bitmap: BitVec<u8, Msb0> = bitvec![u8, Msb0;];
            let mut empty: bool = true;

            for j in 0..image.width {
                for i in 0..BITMAP_HEIGHT {
                    if image.data[(j * image.width + i) as usize] {
                        bitmap.push(true);
                        empty = false;
                    } else {
                        bitmap.push(false);
                    }
                }
            }

            if empty {
                None
            } else {
                Some(CustomPaperHandlerBitmap {
                    data: bitmap.into_vec(),
                    width: image.width,
                })
            }
        })
        .collect_vec()
}
