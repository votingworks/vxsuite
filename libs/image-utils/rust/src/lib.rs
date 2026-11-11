//! PDF rasterization via `hayro`. Pages are rendered in parallel on the rayon
//! thread pool, off the JS thread.

use hayro::hayro_interpret::InterpreterSettings;
use hayro::hayro_interpret::util::TransformExt;
use hayro::hayro_syntax::Pdf;
use hayro::kurbo::Affine;
use hayro::vello_cpu::color::palette::css::{TRANSPARENT, WHITE};
use hayro::vello_cpu::peniko::ImageAlphaType;
use hayro::vello_cpu::{Pixmap, RasterizerSettings, RenderContext, Resources, TargetInit};
use hayro::{RenderCache, RenderSettings, render_into};
use napi::bindgen_prelude::{AsyncTask, Buffer, Uint8Array};
use napi::{Env, Error, Result, Task};
use napi_derive::napi;
use rayon::prelude::*;

/// Size of a PDF page in PDF points, accounting for rotation.
#[napi(object)]
pub struct PdfPageSize {
    pub width: f64,
    pub height: f64,
}

/// Encoding of a rendered page.
#[derive(Clone, Copy)]
pub enum PageFormat {
    /// Unpremultiplied RGBA pixels.
    Rgba,
    /// 8-bit grayscale pixels.
    Gray,
    /// A PNG file, RGB on a white background or RGBA on a transparent one.
    Png,
}

impl std::str::FromStr for PageFormat {
    type Err = Error;

    fn from_str(format: &str) -> Result<Self> {
        match format {
            "rgba" => Ok(Self::Rgba),
            "gray" => Ok(Self::Gray),
            "png" => Ok(Self::Png),
            _ => Err(Error::from_reason(format!("Unknown page format: {format}"))),
        }
    }
}

/// A rendered PDF page in the requested format.
#[napi(object)]
pub struct PdfPageImage {
    pub width: u32,
    pub height: u32,
    pub data: Buffer,
}

fn load_pdf(data: Vec<u8>) -> Result<Pdf> {
    Pdf::new(data).map_err(|err| Error::from_reason(format!("Unable to load PDF: {err:?}")))
}

pub struct GetPdfPageSizes {
    data: Option<Vec<u8>>,
}

impl Task for GetPdfPageSizes {
    type Output = Vec<PdfPageSize>;
    type JsValue = Vec<PdfPageSize>;

    fn compute(&mut self) -> Result<Self::Output> {
        let pdf = load_pdf(self.data.take().unwrap_or_default())?;
        Ok(pdf
            .pages()
            .iter()
            .map(|page| {
                let (width, height) = page.render_dimensions();
                PdfPageSize {
                    width: f64::from(width),
                    height: f64::from(height),
                }
            })
            .collect())
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

/// Parses a PDF and returns the size of each of its pages.
#[must_use]
#[napi(ts_return_type = "Promise<PdfPageSize[]>")]
#[allow(clippy::needless_pass_by_value)] // napi arguments must be owned
pub fn get_pdf_page_sizes(pdf: Uint8Array) -> AsyncTask<GetPdfPageSizes> {
    AsyncTask::new(GetPdfPageSizes {
        data: Some(pdf.to_vec()),
    })
}

pub struct RenderedPage {
    width: u16,
    height: u16,
    data: Vec<u8>,
}

fn pixel_length(points: f32, scale: f64) -> Result<u16> {
    let pixels = (f64::from(points) * scale).floor();
    if !(1.0..=f64::from(u16::MAX)).contains(&pixels) {
        return Err(Error::from_reason(format!(
            "Rendered page dimension out of range: {pixels}px"
        )));
    }
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    Ok(pixels as u16)
}

fn render_page<'a>(
    pdf: &'a Pdf,
    cache: &RenderCache<'a>,
    page_index: u32,
    scale: f64,
    transparent: bool,
    format: PageFormat,
    threads: u16,
) -> Result<RenderedPage> {
    let page = pdf
        .pages()
        .get(page_index as usize)
        .ok_or_else(|| Error::from_reason(format!("No page at index {page_index}")))?;
    let (page_width, page_height) = page.render_dimensions();
    let width = pixel_length(page_width, scale)?;
    let height = pixel_length(page_height, scale)?;

    let mut context = RenderContext::new_with(
        width,
        height,
        vello_cpu::RenderSettings {
            num_threads: threads,
            ..Default::default()
        },
    );
    let transform = Affine::scale(scale) * page.initial_transform(true).to_kurbo();
    render_into(
        page,
        cache,
        &InterpreterSettings::default(),
        &RenderSettings::default(),
        &mut context,
        transform,
    );
    context.flush();

    let mut pixmap = Pixmap::new(width, height);
    context.render_with(
        &mut pixmap,
        &mut Resources::default(),
        RasterizerSettings {
            target_init: TargetInit::Clear(if transparent { TRANSPARENT } else { WHITE }),
            ..Default::default()
        },
    );

    let rgba = pixmap.take_rgba8(ImageAlphaType::Alpha);
    let data = match format {
        PageFormat::Rgba => rgba,
        PageFormat::Gray => rgba_to_gray(&rgba),
        PageFormat::Png => encode_png(&rgba, width, height, transparent)?,
    };
    Ok(RenderedPage {
        width,
        height,
        data,
    })
}

fn encode_png(rgba: &[u8], width: u16, height: u16, transparent: bool) -> Result<Vec<u8>> {
    let mut png = Vec::new();
    let mut encoder = png::Encoder::new(&mut png, u32::from(width), u32::from(height));
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_compression(png::Compression::Balanced);
    let to_error =
        |err: png::EncodingError| Error::from_reason(format!("PNG encoding failed: {err}"));
    if transparent {
        encoder.set_color(png::ColorType::Rgba);
        encoder
            .write_header()
            .map_err(to_error)?
            .write_image_data(rgba)
            .map_err(to_error)?;
    } else if rgba
        .as_chunks::<4>()
        .0
        .iter()
        .all(|pixel| pixel[0] == pixel[1] && pixel[1] == pixel[2])
    {
        encoder.set_color(png::ColorType::Grayscale);
        let gray: Vec<u8> = rgba
            .as_chunks::<4>()
            .0
            .iter()
            .map(|pixel| pixel[0])
            .collect();
        encoder
            .write_header()
            .map_err(to_error)?
            .write_image_data(&gray)
            .map_err(to_error)?;
    } else {
        encoder.set_color(png::ColorType::Rgb);
        let rgb: Vec<u8> = rgba
            .as_chunks::<4>()
            .0
            .iter()
            .flat_map(|pixel| [pixel[0], pixel[1], pixel[2]])
            .collect();
        encoder
            .write_header()
            .map_err(to_error)?
            .write_image_data(&rgb)
            .map_err(to_error)?;
    }
    Ok(png)
}

/// Matches `rgbToGrayscale` stored into a `Uint8ClampedArray`.
fn rgba_to_gray(rgba: &[u8]) -> Vec<u8> {
    rgba.as_chunks::<4>()
        .0
        .iter()
        .map(|pixel| {
            let luma = 0.299 * f64::from(pixel[0])
                + 0.587 * f64::from(pixel[1])
                + 0.114 * f64::from(pixel[2]);
            // Adding and subtracting 2^52 rounds half to even without a libm call.
            let rounded = (luma + 4_503_599_627_370_496.0) - 4_503_599_627_370_496.0;
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            let value = rounded as u8;
            value
        })
        .collect()
}

pub struct RenderPdfPages {
    data: Option<Vec<u8>>,
    page_indices: Vec<u32>,
    scale: f64,
    transparent: bool,
    format: PageFormat,
}

impl Task for RenderPdfPages {
    type Output = Vec<RenderedPage>;
    type JsValue = Vec<PdfPageImage>;

    fn compute(&mut self) -> Result<Self::Output> {
        let pdf = load_pdf(self.data.take().unwrap_or_default())?;
        let threads_per_page =
            u16::try_from(rayon::current_num_threads() / self.page_indices.len().max(1))
                .unwrap_or(u16::MAX);
        let threads = if threads_per_page > 1 {
            threads_per_page
        } else {
            0
        };
        self.page_indices
            .par_iter()
            .map_init(RenderCache::new, |cache, &page_index| {
                render_page(
                    &pdf,
                    cache,
                    page_index,
                    self.scale,
                    self.transparent,
                    self.format,
                    threads,
                )
            })
            .collect()
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output
            .into_iter()
            .map(|page| PdfPageImage {
                width: u32::from(page.width),
                height: u32::from(page.height),
                data: page.data.into(),
            })
            .collect())
    }
}

/// Renders the given zero-based pages of a PDF, scaling 1 PDF point to `scale`
/// pixels, on a white or transparent background.
///
/// # Errors
///
/// Fails if `format` is not `rgba`, `gray` or `png`.
#[napi(
    ts_args_type = "pdf: Uint8Array, pageIndices: number[], scale: number, transparent: boolean, format: 'rgba' | 'gray' | 'png'",
    ts_return_type = "Promise<PdfPageImage[]>"
)]
#[allow(clippy::needless_pass_by_value)] // napi arguments must be owned
pub fn render_pdf_pages(
    pdf: Uint8Array,
    page_indices: Vec<u32>,
    scale: f64,
    transparent: bool,
    format: String,
) -> Result<AsyncTask<RenderPdfPages>> {
    let format = format.parse()?;
    Ok(AsyncTask::new(RenderPdfPages {
        data: Some(pdf.to_vec()),
        page_indices,
        scale,
        transparent,
        format,
    }))
}
