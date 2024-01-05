use std::{ops::Deref, sync::Arc, time::Duration};

use image_data::ImageData;
use neon::prelude::*;
use pdiscan::{ColorDepth, Event, Scanner};

mod image_data;
mod pdiscan;

impl Finalize for Scanner {}

fn open_scanner(mut cx: FunctionContext) -> JsResult<JsBox<Arc<Scanner>>> {
    match Scanner::connect(Default::default()) {
        Ok(scanner) => Ok(cx.boxed(scanner)),
        Err(err) => cx.throw_error(err.to_string()),
    }
}

fn get_scanner_status(mut cx: FunctionContext) -> JsResult<JsObject> {
    let json_global = cx.global().get::<JsObject, _, _>(&mut cx, "JSON")?;
    let json_parse: Handle<JsFunction> = json_global.get(&mut cx, "parse")?;
    let scanner = cx.argument::<JsBox<Arc<Scanner>>>(0)?;

    let status = scanner
        .get_scanner_status()
        .or_else(|err| cx.throw_error(err.to_string()))?;

    let json = serde_json::to_string(&status)
        .or_else(|err| cx.throw_error(format!("serialization as JSON failed: {err}")))?;
    json_parse
        .call_with(&mut cx)
        .arg(cx.string(json))
        .apply(&mut cx)
}

fn set_resolution(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let scanner = cx.argument::<JsBox<Arc<Scanner>>>(0)?;
    let resolution = cx.argument::<JsNumber>(1)?.value(&mut cx) as i64;
    scanner
        .set_resolution(resolution)
        .or_else(|err| cx.throw_error(err.to_string()))?;
    Ok(cx.undefined())
}

fn set_feeder_enabled(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let scanner = cx.argument::<JsBox<Arc<Scanner>>>(0)?;
    let enabled = cx.argument::<JsBoolean>(1)?.value(&mut cx);
    scanner
        .set_feeder_enabled(enabled)
        .or_else(|err| cx.throw_error(err.to_string()))?;
    Ok(cx.undefined())
}

fn set_color_depth(mut cx: FunctionContext) -> JsResult<JsUndefined> {
    let scanner = cx.argument::<JsBox<Arc<Scanner>>>(0)?;
    let color_depth = cx.argument::<JsNumber>(1)?.value(&mut cx) as u8;
    let color_depth: ColorDepth = color_depth.try_into().or_else(|err| {
        cx.throw_error(format!(
            "invalid color depth value: {value}: {err}",
            value = color_depth,
            err = err
        ))
    })?;
    scanner
        .set_color_depth(color_depth)
        .or_else(|err| cx.throw_error(err.to_string()))?;
    Ok(cx.undefined())
}

fn get_last_scanned_document(mut cx: FunctionContext) -> JsResult<JsValue> {
    let scanner = cx.argument::<JsBox<Arc<Scanner>>>(0)?;

    let Some(document) = scanner.wait_for_document(Duration::from_millis(1)).ok() else {
        return Ok(cx.undefined().upcast());
    };

    let js_document = cx.empty_object();

    if let Some(front_side_image) = document.front_side_image {
        let js_front_side_image =
            ImageData::convert_gray_image_to_js_object(&mut cx, front_side_image.into_luma8())
                .or_else(|err| cx.throw_error(err.to_string()))?;
        js_document
            .set(&mut cx, "frontSideImage", js_front_side_image)
            .or_else(|err| cx.throw_error(err.to_string()))?;
    }

    if let Some(back_side_image) = document.back_side_image {
        let js_back_side_image =
            ImageData::convert_gray_image_to_js_object(&mut cx, back_side_image.into_luma8())
                .or_else(|err| cx.throw_error(err.to_string()))?;
        js_document
            .set(&mut cx, "backSideImage", js_back_side_image)
            .or_else(|err| cx.throw_error(err.to_string()))?;
    }

    Ok(js_document.upcast())
}

fn get_last_scanner_event(mut cx: FunctionContext) -> JsResult<JsValue> {
    let scanner = cx.argument::<JsBox<Arc<Scanner>>>(0)?;

    let Ok(event) = scanner.wait_for_event(Duration::from_millis(1)) else {
        return Ok(cx.undefined().upcast());
    };

    let event = match event {
        Event::BeginScan => "beginScan",
        Event::EndScan => "endScan",
        Event::AbortScan => "abortScan",
        Event::EjectPaused => "ejectPaused",
        Event::EjectResumed => "ejectResumed",
        Event::FeederDisabled => "feederDisabled",
    };

    Ok(cx.string(event).upcast())
}

/// Entry point for the Neon module. Exports values to JavaScript.
#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("openScanner", open_scanner)?;
    cx.export_function("getScannerStatus", get_scanner_status)?;
    cx.export_function("setResolution", set_resolution)?;
    cx.export_function("setColorDepth", set_color_depth)?;
    cx.export_function("setFeederEnabled", set_feeder_enabled)?;
    cx.export_function("getLastScannedDocument", get_last_scanned_document)?;
    cx.export_function("getLastScannerEvent", get_last_scanner_event)?;
    Ok(())
}
