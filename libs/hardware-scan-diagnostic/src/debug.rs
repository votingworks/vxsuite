use image::{DynamicImage, GrayImage, Rgba};
use imageproc::drawing::{draw_hollow_circle_mut, draw_line_segment_mut};

use crate::shape::PageShapeAnalysis;

const RED: Rgba<u8> = Rgba([255, 0, 0, 255]);
const GREEN: Rgba<u8> = Rgba([0, 255, 0, 255]);
const BLUE: Rgba<u8> = Rgba([0, 0, 255, 255]);
const CYAN: Rgba<u8> = Rgba([0, 255, 255, 255]);
const PINK: Rgba<u8> = Rgba([255, 0, 255, 255]);
const TOP_COLOR: Rgba<u8> = GREEN;
const BOTTOM_COLOR: Rgba<u8> = BLUE;
const LEFT_COLOR: Rgba<u8> = RED;
const RIGHT_COLOR: Rgba<u8> = CYAN;
const CORNER_COLOR: Rgba<u8> = PINK;

/// Generates a debug image based on the existing analysis of an original image.
pub fn analysis_image(original_image: GrayImage, analysis: &PageShapeAnalysis) -> image::RgbaImage {
    let mut debug_image = DynamicImage::ImageLuma8(original_image).into_rgba8();

    let (width, height) = debug_image.dimensions();
    let top_line = &analysis.top_line;
    let bottom_line = &analysis.bottom_line;
    let left_line = &analysis.left_line;
    let right_line = &analysis.right_line;
    let top_line_left = top_line.point_at(0.0);
    let top_line_right = top_line.point_at((width - 1) as f32);
    let bottom_line_left = bottom_line.point_at(0.0);
    let bottom_line_right = bottom_line.point_at((width - 1) as f32);
    let left_line_top = left_line.point_at(0.0);
    let left_line_bottom = left_line.point_at((height - 1) as f32);
    let right_line_top = right_line.point_at(0.0);
    let right_line_bottom = right_line.point_at((height - 1) as f32);

    draw_line_segment_mut(&mut debug_image, top_line_left, top_line_right, TOP_COLOR);
    draw_line_segment_mut(
        &mut debug_image,
        bottom_line_left,
        bottom_line_right,
        BOTTOM_COLOR,
    );
    draw_line_segment_mut(
        &mut debug_image,
        left_line_top,
        left_line_bottom,
        LEFT_COLOR,
    );
    draw_line_segment_mut(
        &mut debug_image,
        right_line_top,
        right_line_bottom,
        RIGHT_COLOR,
    );

    draw_hollow_circle_mut(
        &mut debug_image,
        analysis.top_left_corner.into(),
        4,
        CORNER_COLOR,
    );
    draw_hollow_circle_mut(
        &mut debug_image,
        analysis.top_right_corner.into(),
        4,
        CORNER_COLOR,
    );
    draw_hollow_circle_mut(
        &mut debug_image,
        analysis.bottom_left_corner.into(),
        4,
        CORNER_COLOR,
    );
    draw_hollow_circle_mut(
        &mut debug_image,
        analysis.bottom_right_corner.into(),
        4,
        CORNER_COLOR,
    );

    debug_image
}
