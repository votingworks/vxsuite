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
    let json_global = cx.global().get::<JsObject, _, _>(cx, "JSON")?;
    let json_parse: Handle<JsFunction> = json_global.get(cx, "parse")?;
    json_parse.call_with(cx).arg(json).apply(cx)
}

/// Convert a JS value to a Rust value.
pub fn from_js<'a, T: DeserializeOwned, C: Context<'a>>(
    cx: &mut C,
    js_value: Handle<'a, JsValue>,
) -> NeonResult<T> {
    let json_global = cx.global().get::<JsObject, _, _>(cx, "JSON")?;
    let json_stringify: Handle<JsFunction> = json_global.get(cx, "stringify")?;
    let json: Handle<JsString> = json_stringify.call_with(cx).arg(js_value).apply(cx)?;
    let json = json.value(cx);
    serde_json::from_str(&json)
        .or_else(|err| cx.throw_error(format!("deserialization from JSON failed: {err}")))
}
