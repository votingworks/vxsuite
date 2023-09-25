#![allow(non_snake_case)]

use std::{ffi::c_void, io::Cursor, slice};

use image::{codecs::bmp::BmpDecoder, DynamicImage, ImageResult};

const MAX_BITMAP_SIZE: usize = 0x1000000;

pub(crate) unsafe fn read_bitmap_from_ptr(data: *const c_void) -> ImageResult<DynamicImage> {
    let slice = unsafe { slice::from_raw_parts(data as *const u8, MAX_BITMAP_SIZE) };
    let decoder = BmpDecoder::new_without_file_header(Cursor::new(slice)).unwrap();
    DynamicImage::from_decoder(decoder)
}
