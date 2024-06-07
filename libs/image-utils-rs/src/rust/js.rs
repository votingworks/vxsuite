use crate::custom_paper_handler::CustomPaperHandlerBitmapOptions;
use neon::types::buffer::TypedArray;
use neon::types::JsBuffer;
use neon::{prelude::*, result::Throw};

fn get_pdf_data_from_arg(cx: &mut FunctionContext, argument: usize) -> Result<Vec<u8>, Throw> {
    let js_buffer = cx.argument::<JsBuffer>(argument)?;
    Ok(js_buffer.as_slice(cx).to_vec())
}

fn get_options_from_arg(
    cx: &mut FunctionContext,
    argument: usize,
) -> Result<CustomPaperHandlerBitmapOptions, Throw> {
    let options = cx.argument::<JsObject>(argument)?;

    let scale: f32 = options
        .get::<JsNumber, _, _>(cx, "scale")
        .ok()
        .map_or(0.0, |b| b.value(cx)) as f32;

    let white_threshold: u8 = options
        .get::<JsNumber, _, _>(cx, "whiteThreshold")
        .ok()
        .map_or(0.0, |b| b.value(cx)) as u8;

    Ok(CustomPaperHandlerBitmapOptions {
        scale,
        white_threshold,
    })
}

pub fn pdf_to_custom_paper_handler_bitmap_series(mut cx: FunctionContext) -> JsResult<JsArray> {
    let pdf_data = get_pdf_data_from_arg(&mut cx, 0)?;
    let options = get_options_from_arg(&mut cx, 1)?;

    let custom_paper_handler_bitmap_series =
        crate::custom_paper_handler::pdf_to_custom_paper_handler_bitmap_series(pdf_data, options);

    let js_array = cx.empty_array();
    for (i, custom_paper_handler_bitmap) in custom_paper_handler_bitmap_series.iter().enumerate() {
        match custom_paper_handler_bitmap {
            None => {
                let js_null = cx.null();
                js_array.set(&mut cx, i as u32, js_null)?
            }
            Some(custom_paper_handler_bitmap) => {
                let js_object = cx.empty_object();
                let js_width = cx.number(custom_paper_handler_bitmap.width);
                js_object.set(&mut cx, "width", js_width)?;
                let js_data =
                    JsUint8Array::from_slice(&mut cx, custom_paper_handler_bitmap.data.as_slice())
                        .expect("failed to create TypedArray");
                js_object.set(&mut cx, "data", js_data)?;
                js_array.set(&mut cx, i as u32, js_object)?
            }
        };
    }
    Ok(js_array)
}
