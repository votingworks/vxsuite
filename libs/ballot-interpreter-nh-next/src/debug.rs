use std::path::{Path, PathBuf};

use image::{DynamicImage, GrayImage, Rgb, RgbImage};
use imageproc::drawing::{
    draw_cross_mut, draw_filled_rect_mut, draw_hollow_rect_mut, draw_line_segment_mut,
    draw_text_mut, text_size,
};
use log::debug;
use rusttype::{Font, Scale};

use crate::{
    ballot_card::Geometry,
    election::GridPosition,
    geometry::{segment_with_length, Rect, Segment},
    image_utils::{
        BLUE, CYAN, DARK_BLUE, DARK_CYAN, DARK_GREEN, DARK_RED, GREEN, PINK, RAINBOW, RED,
        WHITE_RGB,
    },
    timing_marks::{Partial, ScoredOvalMark, TimingMarkGrid},
};

pub fn draw_contours_debug_image_mut(canvas: &mut RgbImage, contour_rects: &[Rect]) {
    for (i, rect) in contour_rects.iter().enumerate() {
        draw_hollow_rect_mut(canvas, (*rect).into(), RAINBOW[i % RAINBOW.len()]);
    }
}

/// Draws a debug image of the rectangles found using the contour algorithm.
pub fn draw_candidate_timing_marks_debug_image_mut(
    canvas: &mut RgbImage,
    contour_rects: &[Rect],
    candidate_timing_marks: &[Rect],
) {
    for (i, rect) in contour_rects.iter().enumerate() {
        draw_hollow_rect_mut(canvas, (*rect).into(), RAINBOW[i % RAINBOW.len()]);
    }

    for (i, rect) in candidate_timing_marks.iter().enumerate() {
        draw_filled_rect_mut(canvas, (*rect).into(), RAINBOW[i % RAINBOW.len()]);
    }
}

/// Draws a debug image of the timing marks.
pub fn draw_timing_mark_debug_image_mut(
    canvas: &mut RgbImage,
    geometry: &Geometry,
    partial_timing_marks: &Partial,
) {
    draw_line_segment_mut(
        canvas,
        (
            partial_timing_marks.top_left_corner.x,
            partial_timing_marks.top_left_corner.y,
        ),
        (
            partial_timing_marks.top_right_corner.x,
            partial_timing_marks.top_right_corner.y,
        ),
        GREEN,
    );

    draw_line_segment_mut(
        canvas,
        (
            partial_timing_marks.bottom_left_corner.x,
            partial_timing_marks.bottom_left_corner.y,
        ),
        (
            partial_timing_marks.bottom_right_corner.x,
            partial_timing_marks.bottom_right_corner.y,
        ),
        BLUE,
    );

    draw_line_segment_mut(
        canvas,
        (
            partial_timing_marks.top_left_corner.x,
            partial_timing_marks.top_left_corner.y,
        ),
        (
            partial_timing_marks.bottom_left_corner.x,
            partial_timing_marks.bottom_left_corner.y,
        ),
        RED,
    );

    draw_line_segment_mut(
        canvas,
        (
            partial_timing_marks.top_right_corner.x,
            partial_timing_marks.top_right_corner.y,
        ),
        (
            partial_timing_marks.bottom_right_corner.x,
            partial_timing_marks.bottom_right_corner.y,
        ),
        CYAN,
    );

    for rect in &partial_timing_marks.top_rects {
        draw_filled_rect_mut(canvas, (*rect).into(), GREEN);
    }
    for rect in &partial_timing_marks.bottom_rects {
        draw_filled_rect_mut(canvas, (*rect).into(), BLUE);
    }
    for rect in &partial_timing_marks.left_rects {
        draw_filled_rect_mut(canvas, (*rect).into(), RED);
    }
    for rect in &partial_timing_marks.right_rects {
        draw_filled_rect_mut(canvas, (*rect).into(), CYAN);
    }

    if let Some(top_left_corner) = partial_timing_marks.top_left_rect {
        draw_filled_rect_mut(canvas, top_left_corner.into(), PINK);
    }

    if let Some(top_right_corner) = partial_timing_marks.top_right_rect {
        draw_filled_rect_mut(canvas, top_right_corner.into(), PINK);
    }

    if let Some(bottom_left_corner) = partial_timing_marks.bottom_left_rect {
        draw_filled_rect_mut(canvas, bottom_left_corner.into(), PINK);
    }

    if let Some(bottom_right_corner) = partial_timing_marks.bottom_right_rect {
        draw_filled_rect_mut(canvas, bottom_right_corner.into(), PINK);
    }

    draw_cross_mut(
        canvas,
        WHITE_RGB,
        partial_timing_marks.top_left_corner.x.round() as i32,
        partial_timing_marks.top_left_corner.y.round() as i32,
    );

    draw_cross_mut(
        canvas,
        WHITE_RGB,
        partial_timing_marks.top_right_corner.x.round() as i32,
        partial_timing_marks.top_right_corner.y.round() as i32,
    );

    draw_cross_mut(
        canvas,
        WHITE_RGB,
        partial_timing_marks.bottom_left_corner.x.round() as i32,
        partial_timing_marks.bottom_left_corner.y.round() as i32,
    );

    draw_cross_mut(
        canvas,
        WHITE_RGB,
        partial_timing_marks.bottom_right_corner.x.round() as i32,
        partial_timing_marks.bottom_right_corner.y.round() as i32,
    );

    let top_line_distance = Segment::new(
        partial_timing_marks.top_left_corner,
        partial_timing_marks.top_right_corner,
    )
    .length();
    let bottom_line_distance = Segment::new(
        partial_timing_marks.bottom_left_corner,
        partial_timing_marks.bottom_right_corner,
    )
    .length();
    for i in 0..geometry.grid_size.width {
        let expected_top_timing_mark_center = segment_with_length(
            &Segment::new(
                partial_timing_marks.top_left_corner,
                partial_timing_marks.top_right_corner,
            ),
            top_line_distance * (i as f32),
        )
        .end;

        draw_cross_mut(
            canvas,
            DARK_GREEN,
            expected_top_timing_mark_center.x.round() as i32,
            expected_top_timing_mark_center.y.round() as i32,
        );

        let expected_bottom_timing_mark_center = segment_with_length(
            &Segment::new(
                partial_timing_marks.bottom_left_corner,
                partial_timing_marks.bottom_right_corner,
            ),
            bottom_line_distance * (i as f32),
        )
        .end;

        draw_cross_mut(
            canvas,
            DARK_BLUE,
            expected_bottom_timing_mark_center.x.round() as i32,
            expected_bottom_timing_mark_center.y.round() as i32,
        );
    }

    let left_line_distance = Segment::new(
        partial_timing_marks.top_left_corner,
        partial_timing_marks.bottom_left_corner,
    )
    .length();
    let left_line_distance_per_segment =
        left_line_distance / ((geometry.grid_size.height - 1) as f32);
    let right_line_distance = Segment::new(
        partial_timing_marks.top_right_corner,
        partial_timing_marks.bottom_right_corner,
    )
    .length();
    let right_line_distance_per_segment =
        right_line_distance / ((geometry.grid_size.height - 1) as f32);
    for i in 0..geometry.grid_size.height {
        let expected_left_timing_mark_center = segment_with_length(
            &Segment::new(
                partial_timing_marks.top_left_corner,
                partial_timing_marks.bottom_left_corner,
            ),
            left_line_distance_per_segment * (i as f32),
        )
        .end;

        draw_cross_mut(
            canvas,
            DARK_RED,
            expected_left_timing_mark_center.x.round() as i32,
            expected_left_timing_mark_center.y.round() as i32,
        );

        let expected_right_timing_mark_center = segment_with_length(
            &Segment::new(
                partial_timing_marks.top_right_corner,
                partial_timing_marks.bottom_right_corner,
            ),
            right_line_distance_per_segment * (i as f32),
        )
        .end;

        draw_cross_mut(
            canvas,
            DARK_CYAN,
            expected_right_timing_mark_center.x.round() as i32,
            expected_right_timing_mark_center.y.round() as i32,
        );
    }
}

/// Draws a debug image showing all the points of the timing mark grid.
pub fn draw_timing_mark_grid_debug_image_mut(
    canvas: &mut RgbImage,
    timing_mark_grid: &TimingMarkGrid,
    geometry: &Geometry,
) {
    for column in 0..geometry.grid_size.width {
        for row in 0..geometry.grid_size.height {
            let point = timing_mark_grid
                .point_for_location(column, row)
                .expect("grid point is defined");
            draw_cross_mut(canvas, PINK, point.x.round() as i32, point.y.round() as i32);
        }
    }
}

fn monospace_font() -> Font<'static> {
    Font::try_from_bytes(include_bytes!("../data/fonts/Inconsolata-Regular.ttf"))
        .expect("font is valid")
}

/// Draws a debug image outlining all the scored oval marks.
pub fn draw_scored_oval_marks_debug_image_mut(
    canvas: &mut RgbImage,
    scored_oval_marks: &Vec<(GridPosition, Option<ScoredOvalMark>)>,
) {
    let option_color = PINK;
    let matched_oval_color = DARK_GREEN;
    let original_oval_color = DARK_BLUE;
    let score_color = DARK_GREEN;
    let font = &monospace_font();
    let font_scale = 20.0;
    let scale = Scale::uniform(font_scale);

    for (grid_position, scored_oval_mark) in scored_oval_marks {
        if let Some(scored_oval_mark) = scored_oval_mark {
            let mut option_text = grid_position.to_string();
            option_text.truncate(25);

            let (option_text_width, option_text_height) =
                text_size(scale, font, option_text.as_str());

            let score_text = scored_oval_mark.fill_score.to_string();
            let (score_text_width, _) = text_size(scale, font, score_text.as_str());

            draw_text_with_background_mut(
                canvas,
                &option_text,
                scored_oval_mark
                    .expected_bounds
                    .left()
                    .min(scored_oval_mark.matched_bounds.left())
                    - option_text_width
                    - 5,
                (scored_oval_mark
                    .expected_bounds
                    .top()
                    .min(scored_oval_mark.matched_bounds.top())
                    + scored_oval_mark
                        .expected_bounds
                        .bottom()
                        .max(scored_oval_mark.matched_bounds.bottom()))
                    / 2
                    - (option_text_height / 2),
                scale,
                font,
                option_color,
                WHITE_RGB,
            );

            draw_text_with_background_mut(
                canvas,
                &score_text,
                (scored_oval_mark
                    .expected_bounds
                    .left()
                    .min(scored_oval_mark.matched_bounds.left())
                    + scored_oval_mark
                        .expected_bounds
                        .right()
                        .max(scored_oval_mark.matched_bounds.right()))
                    / 2
                    - (score_text_width / 2),
                scored_oval_mark
                    .expected_bounds
                    .bottom()
                    .max(scored_oval_mark.matched_bounds.bottom())
                    + 5,
                scale,
                font,
                score_color,
                WHITE_RGB,
            );

            draw_hollow_rect_mut(
                canvas,
                scored_oval_mark.expected_bounds.into(),
                original_oval_color,
            );
            draw_hollow_rect_mut(
                canvas,
                scored_oval_mark.matched_bounds.into(),
                matched_oval_color,
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_text_with_background_mut(
    canvas: &mut RgbImage,
    text: &str,
    x: i32,
    y: i32,
    scale: Scale,
    font: &Font,
    text_color: Rgb<u8>,
    background_color: Rgb<u8>,
) {
    let (text_width, text_height) = text_size(scale, font, text);

    draw_filled_rect_mut(
        canvas,
        imageproc::rect::Rect::at(x, y).of_size(text_width as u32, text_height as u32),
        background_color,
    );
    draw_text_mut(canvas, text_color, x, y, scale, font, text);
}

#[derive(Debug)]
pub struct ImageDebugWriter {
    input_path: PathBuf,
    input_image: Option<GrayImage>,
}

/// Creates a path for a debug image.
fn output_path_from_original(base: &Path, label: &str) -> PathBuf {
    let mut result = PathBuf::from(base);
    result.set_file_name(format!(
        "{}_debug_{}.png",
        base.file_stem()
            .unwrap_or_default()
            .to_str()
            .unwrap_or_default(),
        label
    ));
    result
}

impl ImageDebugWriter {
    pub const fn new(input_path: PathBuf, input_image: GrayImage) -> Self {
        Self {
            input_path,
            input_image: Some(input_image),
        }
    }

    pub fn disabled() -> Self {
        Self {
            input_path: PathBuf::new(),
            input_image: None,
        }
    }

    pub fn write(&self, label: &str, draw: impl FnOnce(&mut RgbImage)) -> Option<PathBuf> {
        self.input_image.as_ref().map(|input_image| {
            let mut output_image = DynamicImage::ImageLuma8(input_image.clone()).into_rgb8();
            draw(&mut output_image);

            let output_path = output_path_from_original(&self.input_path, label);
            output_image.save(&output_path).expect("image is saved");
            debug!("{}", output_path.display());
            output_path
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_output_path_from_original() {
        use std::path::Path;

        let base = Path::new("foo/bar/baz.png");
        let result = output_path_from_original(base, "test");
        assert_eq!(result, Path::new("foo/bar/baz_debug_test.png"));
    }

    #[test]
    fn test_output_path_from_original_no_extension() {
        use std::path::Path;

        let base = Path::new("foo/bar/baz");
        let result = output_path_from_original(base, "test");
        assert_eq!(result, Path::new("foo/bar/baz_debug_test.png"));
    }

    #[test]
    fn test_debug_writer() {
        use image::GrayImage;

        let file = tempfile::NamedTempFile::new().unwrap();
        let input_image = GrayImage::new(10, 10);
        let debug_writer = ImageDebugWriter::new(file.path().to_path_buf(), input_image);

        let mut called = false;
        let output_path = debug_writer
            .write("test", |image| {
                called = true;
                assert_eq!(image.width(), 10);
                assert_eq!(image.height(), 10);
            })
            .unwrap();
        assert!(called);
        assert!(output_path.as_os_str().to_str().unwrap().contains("test"));
        assert_eq!(
            image::open(output_path).unwrap().to_luma8().dimensions(),
            (10, 10)
        );
    }

    #[test]
    fn test_debug_writer_disabled() {
        let debug_writer = ImageDebugWriter::disabled();

        let mut called = false;
        let output_path = debug_writer.write("test", |_| {
            called = true;
        });
        assert!(!called);
        assert!(output_path.is_none());
    }
}
