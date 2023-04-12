use ballot_card::load_oval_template;
use image::{DynamicImage, GrayImage};
use neon::{prelude::*, types::buffer::TypedArray};
use serde::Serialize;
use std::{borrow::BorrowMut, path::Path};

mod ballot_card;
mod debug;
mod election;
mod geometry;
mod image_utils;
mod interpret;
mod layout;
mod metadata;
mod scoring;
mod timing_marks;
mod types;

use crate::interpret::{interpret_ballot_card, Options};

fn make_interpret_result<'a>(
    cx: &mut FunctionContext<'a>,
    result: Result<Handle<JsString>, Handle<JsString>>,
) -> JsResult<'a, JsObject> {
    let result_object = cx.empty_object();
    let (success, value) = match result {
        Ok(value) => (cx.boolean(true), value),
        Err(error) => (cx.boolean(false), error),
    };
    result_object.set(cx, "success", success)?;
    result_object.set(cx, "value", value)?;
    Ok(result_object)
}

#[derive(Debug, Serialize)]
struct InterpretError {
    #[serde(rename = "type")]
    error_type: &'static str,
    message: String,
}

/// "unknown" error type for errors that are not specific to the interpretation process.
impl InterpretError {
    const fn new(message: String) -> Self {
        Self {
            error_type: "unknown",
            message,
        }
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| {
            r#"{"type": "unknown", "message": "Failed to serialize error"}"#.to_string()
        })
    }

    fn json(message: String) -> String {
        Self::new(message).to_json()
    }
}

/// Interpret a ballot card.
///
/// From JavaScript, this function takes three arguments:
/// 1. The election definition as a JSON string.
/// 2. The path to the image of one side of the ballot card.
/// 3. The path to the image of the other side of the ballot card.
/// 4. A boolean indicating whether to output debug images.
///
/// The return value is an object with the following properties:
/// 1. `success`: a boolean indicating whether the interpretation succeeded.
/// 3. `value`: the JSON-encoded result of the interpretation.
fn interpret(mut cx: FunctionContext) -> JsResult<JsObject> {
    let election_json = cx.argument::<JsString>(0)?.value(&mut cx);
    let side_a_path = cx.argument::<JsString>(1)?.value(&mut cx);
    let side_b_path = cx.argument::<JsString>(2)?.value(&mut cx);
    let debug = cx.argument::<JsBoolean>(3)?.value(&mut cx);

    let election = match serde_json::from_str(election_json.as_str()) {
        Ok(election) => election,
        Err(err) => {
            let error = Err(cx.string(InterpretError::json(format!(
                "Failed to parse election JSON: {err}"
            ))));
            return make_interpret_result(&mut cx, error);
        }
    };

    let interpret_result = interpret_ballot_card(
        Path::new(side_a_path.as_str()),
        Path::new(side_b_path.as_str()),
        &Options {
            election,
            oval_template: load_oval_template().expect("Failed to load oval template"),
            debug,
        },
    );

    let card = match interpret_result {
        Ok(interpreted) => interpreted,
        Err(err) => {
            if let Ok(error_json) = serde_json::to_string(&err) {
                let error = Err(cx.string(error_json));
                return make_interpret_result(&mut cx, error);
            }

            let error = Err(cx.string(InterpretError::json(format!(
                "Failed to interpret ballot card; further, the error could not be serialized: {:?}",
                err
            ))));
            return make_interpret_result(&mut cx, error);
        }
    };

    let json = match serde_json::to_string(&card) {
        Ok(json) => json,
        Err(err) => {
            let error = Err(cx.string(InterpretError::json(format!(
                "Ballot card interpretation succeeded, but serialization as JSON failed: {err}"
            ))));
            return make_interpret_result(&mut cx, error);
        }
    };

    let value = Ok(cx.string(json));
    let result_object = make_interpret_result(&mut cx, value)?;

    let front_js_normalized_image_obj =
        make_js_image_data_object(&mut cx, card.front.normalized_image)?;
    let back_js_normalized_image_obj =
        make_js_image_data_object(&mut cx, card.back.normalized_image)?;
    result_object.set(
        &mut cx,
        "frontNormalizedImage",
        front_js_normalized_image_obj,
    )?;
    result_object.set(&mut cx, "backNormalizedImage", back_js_normalized_image_obj)?;

    Ok(result_object)
}

/// Creates a JavaScript object compatible with the `ImageData` interface.
fn make_js_image_data_object<'a>(
    cx: &mut FunctionContext<'a>,
    image: GrayImage,
) -> JsResult<'a, JsObject> {
    let js_object = cx.empty_object();
    let rgba_image = DynamicImage::ImageLuma8(image).into_rgba8();
    let mut data = cx.buffer(rgba_image.len())?;
    data.borrow_mut()
        .as_mut_slice(cx)
        .copy_from_slice(rgba_image.as_ref());
    let (width, height) = rgba_image.dimensions();
    let (width, height) = (cx.number(f64::from(width)), cx.number(f64::from(height)));
    js_object.set(cx, "data", data)?;
    js_object.set(cx, "width", width)?;
    js_object.set(cx, "height", height)?;
    Ok(js_object)
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("interpret", interpret)?;
    Ok(())
}
