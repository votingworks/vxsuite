use std::borrow::Borrow;

use image::DynamicImage;
use neon::prelude::*;
use neon::types::{buffer::TypedArray, JsNumber, JsObject};

/// Represents an image as stored in JavaScript. Used to convert between
/// JavaScript and Rust. Expected to be RGBA8.
#[derive(Debug)]
pub struct ImageData {
    width: u32,
    height: u32,
    data: Vec<u8>,
}

impl ImageData {
    /// Creates a new `ImageData` object.
    pub const fn new(width: u32, height: u32, data: Vec<u8>) -> Self {
        Self {
            width,
            height,
            data,
        }
    }

    /// Converts a JavaScript `ImageData` object to a Rust `ImageData`.
    pub fn from_js_object(
        cx: &mut FunctionContext,
        js_object: Handle<JsObject>,
    ) -> NeonResult<Self> {
        let width = js_object.get::<JsNumber, _, _>(cx, "width")?.value(cx) as u32;
        let height = js_object.get::<JsNumber, _, _>(cx, "height")?.value(cx) as u32;
        let data = js_object
            .get::<JsBuffer, _, _>(cx, "data")?
            .borrow()
            .as_slice(cx)
            .to_vec();
        Ok(Self::new(width, height, data))
    }
}

impl From<DynamicImage> for ImageData {
    fn from(image: DynamicImage) -> Self {
        let image = image.into_rgba8();
        let (width, height) = image.dimensions();
        let data = image.into_raw();
        Self::new(width, height, data)
    }
}

impl From<ImageData> for DynamicImage {
    fn from(image_data: ImageData) -> Self {
        let ImageData {
            width,
            height,
            data,
        } = image_data;
        let image = image::ImageBuffer::from_raw(width, height, data).expect("Invalid image data");
        Self::ImageRgba8(image)
    }
}
