use neon::types::JsObject;
use neon::{prelude::*, result::Throw};
use std::path::PathBuf;
use types_rs::election::Election;

use super::image_data::ImageData;
use super::serialization::from_js;

/// Image arguments can be either a path or an `ImageData` object.
#[derive(Debug)]
pub enum ImageSource {
    Path(PathBuf),
    ImageData(ImageData),
}

impl ImageSource {
    /// Gets a label for display purposes, either the image path or a default.
    pub fn as_label_or<S: Into<String>>(&self, default: S) -> String {
        match self {
            Self::Path(path) => path.to_string_lossy().to_string(),
            Self::ImageData(_) => default.into(),
        }
    }
}

/// Gets an `ImageSource` from the argument at the given index.
pub fn get_image_data_or_path_from_arg(
    cx: &mut FunctionContext,
    argument: usize,
) -> Result<ImageSource, Throw> {
    let argument = cx.argument::<JsValue>(argument)?;
    if let Ok(path) = argument.downcast::<JsString, _>(cx) {
        let path = path.value(&mut *cx);
        Ok(ImageSource::Path(PathBuf::from(path)))
    } else if let Ok(image_data) = argument.downcast::<JsObject, _>(cx) {
        ImageData::from_js_object(cx, image_data).map_or_else(
            || cx.throw_type_error("unable to read argument as ImageData"),
            |image| Ok(ImageSource::ImageData(image)),
        )
    } else {
        cx.throw_type_error("expected image data or path")
    }
}

/// Gets a `PathBuf` from the argument at the given index, if it exists.
pub fn get_path_from_arg_opt(cx: &mut FunctionContext, argument: usize) -> Option<PathBuf> {
    let argument = cx.argument_opt(argument)?;
    let js_string = argument.downcast::<JsString, _>(cx).ok()?;
    let string = js_string.value(cx);
    Some(PathBuf::from(string))
}

/// Gets an `Election` from the argument at the given index.
pub fn get_election_definition_from_arg(
    cx: &mut FunctionContext,
    argument: usize,
) -> Result<Election, Throw> {
    let Some(js_election) = cx.argument_opt(argument) else {
        return cx.throw_type_error(format!(
            "election definition expected at argument {argument}"
        ));
    };

    from_js(cx, js_election)
}
