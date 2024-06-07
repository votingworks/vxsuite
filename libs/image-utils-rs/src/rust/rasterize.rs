use image::DynamicImage;
use itertools::Itertools;
use pdfium_render::prelude::*;

pub struct RasterizeOptions {
    pub width: i32,
}

pub fn pdf_to_images(pdf_data: Vec<u8>, options: &RasterizeOptions) -> Vec<DynamicImage> {
    let pdfium = Pdfium::new(
        Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(
            "./pdfium/arm64/lib/",
        ))
        .unwrap(),
    );

    let document = pdfium.load_pdf_from_byte_vec(pdf_data, None).unwrap();
    let render_config = PdfRenderConfig::new().set_target_width(options.width);

    // map the pages to images
    document
        .pages()
        .iter()
        .map(|page| page.render_with_config(&render_config).unwrap().as_image())
        .collect_vec()
}
