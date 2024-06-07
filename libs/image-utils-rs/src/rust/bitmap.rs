use image::DynamicImage;
use itertools::Itertools;

pub struct BinaryImage {
    pub data: Vec<bool>,
    pub width: u32,
    pub height: u32,
}

pub struct BitmapOptions {
    pub white_threshold: u8,
}

pub fn image_to_bitmap(image: &DynamicImage, options: &BitmapOptions) -> BinaryImage {
    let data = image
        .to_luma8()
        .pixels()
        .map(|pixel| pixel[0] < options.white_threshold)
        .collect_vec();

    BinaryImage {
        data,
        width: image.width(),
        height: image.height(),
    }
}
