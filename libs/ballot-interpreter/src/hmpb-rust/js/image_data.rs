use std::borrow::{Borrow, BorrowMut};

use image::{DynamicImage, GrayImage};
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
    pub fn new(width: u32, height: u32, data: Vec<u8>) -> Self {
        Self {
            width,
            height,
            data,
        }
    }

    /// Converts a JavaScript object compatible with the `ImageData` interface.
    pub fn convert_gray_image_to_js_object<'a>(
        cx: &mut FunctionContext<'a>,
        image: GrayImage,
    ) -> JsResult<'a, JsObject> {
        let (width, height) = image.dimensions();
        let data = DynamicImage::ImageLuma8(image).into_rgba8().into_raw();
        let image_data = Self::new(width, height, data);
        image_data.to_js_object(cx)
    }

    /// Converts a JavaScript `ImageData` object to a Rust `ImageData`.
    pub fn from_js_object(cx: &mut FunctionContext, js_object: Handle<JsObject>) -> Option<Self> {
        let width = js_object.get::<JsNumber, _, _>(cx, "width").ok()?.value(cx) as u32;
        let height = js_object
            .get::<JsNumber, _, _>(cx, "height")
            .ok()?
            .value(cx) as u32;
        let data = js_object
            .get::<JsBuffer, _, _>(cx, "data")
            .ok()?
            .borrow()
            .as_slice(cx)
            .to_vec();
        Some(Self::new(width, height, data))
    }

    pub fn to_js_object<'a>(&self, cx: &mut FunctionContext<'a>) -> JsResult<'a, JsObject> {
        let js_object = cx.empty_object();
        let width = cx.number(f64::from(self.width));
        let height = cx.number(f64::from(self.height));
        js_object.set(cx, "width", width)?;
        js_object.set(cx, "height", height)?;
        let mut data = cx.buffer(self.data.len())?;
        data.borrow_mut()
            .as_mut_slice(cx)
            .copy_from_slice(self.data.as_slice());
        js_object.set(cx, "data", data)?;
        Ok(js_object)
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
