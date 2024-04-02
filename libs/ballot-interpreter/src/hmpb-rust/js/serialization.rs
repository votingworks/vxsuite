use neon::prelude::*;
use neon::types::JsValue;
use serde::{de::DeserializeOwned, Serialize};

/// Convert a Rust value to a JS value.
pub fn to_js<'a, T: Serialize, C: Context<'a>>(
    cx: &mut C,
    value: T,
) -> NeonResult<Handle<'a, JsValue>> {
    let json = serde_json::to_string(&value)
        .or_else(|err| cx.throw_error(format!("serialization as JSON failed: {err}")))?;
    let json = cx.string(json);
    let json_global = cx.global::<JsObject>("JSON")?;
    let json_parse: Handle<JsFunction> = json_global.get(cx, "parse")?;
    json_parse.call_with(cx).arg(json).apply(cx)
}

/// Convert a JS value to a Rust value.
pub fn from_js<'a, T: DeserializeOwned, C: Context<'a>>(
    cx: &mut C,
    js_value: Handle<'a, JsValue>,
) -> NeonResult<T> {
    let json_global = cx.global::<JsObject>("JSON")?;
    let json_stringify: Handle<JsFunction> = json_global.get(cx, "stringify")?;
    let json: Handle<JsString> = json_stringify.call_with(cx).arg(js_value).apply(cx)?;
    let json = json.value(cx);
    serde_json::from_str(&json)
        .or_else(|err| cx.throw_error(format!("deserialization from JSON failed: {err}")))
}

/// Converts a Rust 2-tuple to a JS array.
pub fn tuple2_to_js<'a, T1: Serialize, T2: Serialize, C: Context<'a>>(
    cx: &mut C,
    tuple: (T1, T2),
) -> NeonResult<Handle<'a, JsArray>> {
    let array = JsArray::new(cx, 2);
    let element0 = to_js(cx, tuple.0)?;
    let element1 = to_js(cx, tuple.1)?;
    array.set(cx, 0, element0)?;
    array.set(cx, 1, element1)?;
    Ok(array)
}
