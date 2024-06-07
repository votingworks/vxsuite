use image::DynamicImage;
use itertools::Itertools;
use pdfium_render::prelude::*;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::str;

#[cfg(target_arch = "x86_64")]
const ARCH_DIR: &str = "x86_64";

#[cfg(target_arch = "aarch64")]
const ARCH_DIR: &str = "aarch64";

#[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
compile_error!("Unsupported target architecture!");

fn get_pdfium_path() -> PathBuf {
    let output = Command::new("cargo")
        .args(&["locate-project", "--workspace", "--message-format", "plain"])
        .output()
        .expect("Failed to execute cargo command");

    let path = str::from_utf8(&output.stdout).unwrap().trim();
    Path::new(path)
        .parent()
        .unwrap()
        .join("prebuilds")
        .join("pdfium")
        .join(ARCH_DIR)
        .join("lib")
}

fn get_pdfium() -> Pdfium {
    Pdfium::new(
        Pdfium::bind_to_library(Pdfium::pdfium_platform_library_name_at_path(
            &get_pdfium_path(),
        ))
        .unwrap(),
    )
}

pub struct PdfOptions {
    pub scale: f32,
}

pub fn pdf_to_images(pdf_data: Vec<u8>, options: &PdfOptions) -> Vec<DynamicImage> {
    let pdfium = get_pdfium();
    let document = pdfium.load_pdf_from_byte_vec(pdf_data, None).unwrap();
    let render_config = PdfRenderConfig::new().scale_page_by_factor(options.scale);

    // map the pages to images
    document
        .pages()
        .iter()
        .map(|page| page.render_with_config(&render_config).unwrap().as_image())
        .collect_vec()
}
