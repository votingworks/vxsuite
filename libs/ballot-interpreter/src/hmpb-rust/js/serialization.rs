use neon::prelude::*;
use neon::types::JsValue;
use serde::de::DeserializeOwned;

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
