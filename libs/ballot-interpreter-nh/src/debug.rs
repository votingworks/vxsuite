use std::path::{Path, PathBuf};

use image::{imageops::rotate180, DynamicImage, GrayImage, Rgb, RgbImage};
use imageproc::drawing::{
    draw_cross_mut, draw_filled_rect_mut, draw_hollow_rect_mut, draw_line_segment_mut,
    draw_text_mut, text_size,
};
use log::debug;
use rusttype::{Font, Scale};

use crate::{
    ballot_card::Geometry,
    election::GridPosition,
    geometry::{PixelPosition, PixelUnit, Rect, Segment, SubPixelUnit},
    image_utils::{
        BLUE, CYAN, DARK_BLUE, DARK_CYAN, DARK_GREEN, DARK_RED, GREEN, ORANGE, PINK, RAINBOW, RED,
        WHITE_RGB,
    },
    scoring::ScoredBubbleMark,
    timing_marks::{Partial, TimingMarkGrid},
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
    draw_legend(
        canvas,
        &vec![
            (
                GREEN,
                format!("Top ({})", partial_timing_marks.top_rects.len()).as_str(),
            ),
            (
                BLUE,
                format!("Bottom ({})", partial_timing_marks.bottom_rects.len()).as_str(),
            ),
            (
                RED,
                format!("Left ({})", partial_timing_marks.left_rects.len()).as_str(),
            ),
            (
                CYAN,
                format!("Right ({})", partial_timing_marks.right_rects.len()).as_str(),
            ),
            (PINK, format!("Corners ({})", 4).as_str()),
        ],
    );

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

    let font = &monospace_font();
    let font_scale = 15.0;
    let scale = Scale::uniform(font_scale);

    for (i, rect) in partial_timing_marks.top_rects.iter().enumerate() {
        let center = rect.center();
        let text = format!("{i}");
        let (text_width, text_height) = text_size(scale, font, text.as_str());
        draw_filled_rect_mut(canvas, (*rect).into(), GREEN);
        draw_text_mut(
            canvas,
            DARK_GREEN,
            (center.x - text_width as SubPixelUnit / 2.0) as PixelPosition,
            (rect.bottom() as SubPixelUnit + text_height as SubPixelUnit / 4.0) as PixelPosition,
            scale,
            font,
            text.as_str(),
        );
    }

    for (i, rect) in partial_timing_marks.bottom_rects.iter().enumerate() {
        let center = rect.center();
        let text = format!("{i}");
        let (text_width, text_height) = text_size(scale, font, text.as_str());
        draw_filled_rect_mut(canvas, (*rect).into(), BLUE);
        draw_text_mut(
            canvas,
            DARK_BLUE,
            (center.x - text_width as SubPixelUnit / 2.0) as PixelPosition,
            (rect.top() as SubPixelUnit - text_height as SubPixelUnit * 5.0 / 4.0) as PixelPosition,
            scale,
            font,
            text.as_str(),
        );
    }

    for (i, rect) in partial_timing_marks.left_rects.iter().enumerate() {
        let center = rect.center();
        let text = format!("{i}");
        let (_, text_height) = text_size(scale, font, text.as_str());
        draw_filled_rect_mut(canvas, (*rect).into(), RED);
        draw_text_mut(
            canvas,
            DARK_RED,
            (rect.right() as SubPixelUnit + text_height as SubPixelUnit / 4.0) as PixelPosition,
            (center.y - text_height as SubPixelUnit / 2.0) as PixelPosition,
            scale,
            font,
            text.as_str(),
        );
    }

    for (i, rect) in partial_timing_marks.right_rects.iter().enumerate() {
        let center = rect.center();
        let text = format!("{i}");
        let (text_width, text_height) = text_size(scale, font, text.as_str());
        draw_filled_rect_mut(canvas, (*rect).into(), CYAN);
        draw_text_mut(
            canvas,
            DARK_CYAN,
            (rect.left() as SubPixelUnit
                - text_width as SubPixelUnit
                - text_height as SubPixelUnit / 4.0) as PixelPosition,
            (center.y - text_height as SubPixelUnit / 2.0) as PixelPosition,
            scale,
            font,
            text.as_str(),
        );
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
        partial_timing_marks.top_left_corner.x.round() as PixelPosition,
        partial_timing_marks.top_left_corner.y.round() as PixelPosition,
    );

    draw_cross_mut(
        canvas,
        WHITE_RGB,
        partial_timing_marks.top_right_corner.x.round() as PixelPosition,
        partial_timing_marks.top_right_corner.y.round() as PixelPosition,
    );

    draw_cross_mut(
        canvas,
        WHITE_RGB,
        partial_timing_marks.bottom_left_corner.x.round() as PixelPosition,
        partial_timing_marks.bottom_left_corner.y.round() as PixelPosition,
    );

    draw_cross_mut(
        canvas,
        WHITE_RGB,
        partial_timing_marks.bottom_right_corner.x.round() as PixelPosition,
        partial_timing_marks.bottom_right_corner.y.round() as PixelPosition,
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
        let expected_top_timing_mark_center = Segment::new(
            partial_timing_marks.top_left_corner,
            partial_timing_marks.top_right_corner,
        )
        .with_length(top_line_distance * (i as SubPixelUnit))
        .end;

        draw_cross_mut(
            canvas,
            DARK_GREEN,
            expected_top_timing_mark_center.x.round() as PixelPosition,
            expected_top_timing_mark_center.y.round() as PixelPosition,
        );

        let expected_bottom_timing_mark_center = Segment::new(
            partial_timing_marks.bottom_left_corner,
            partial_timing_marks.bottom_right_corner,
        )
        .with_length(bottom_line_distance * (i as SubPixelUnit))
        .end;

        draw_cross_mut(
            canvas,
            DARK_BLUE,
            expected_bottom_timing_mark_center.x.round() as PixelPosition,
            expected_bottom_timing_mark_center.y.round() as PixelPosition,
        );
    }

    let left_line_distance = Segment::new(
        partial_timing_marks.top_left_corner,
        partial_timing_marks.bottom_left_corner,
    )
    .length();
    let left_line_distance_per_segment =
        left_line_distance / ((geometry.grid_size.height - 1) as SubPixelUnit);
    let right_line_distance = Segment::new(
        partial_timing_marks.top_right_corner,
        partial_timing_marks.bottom_right_corner,
    )
    .length();
    let right_line_distance_per_segment =
        right_line_distance / ((geometry.grid_size.height - 1) as SubPixelUnit);
    for i in 0..geometry.grid_size.height {
        let expected_left_timing_mark_center = Segment::new(
            partial_timing_marks.top_left_corner,
            partial_timing_marks.bottom_left_corner,
        )
        .with_length(left_line_distance_per_segment * (i as SubPixelUnit))
        .end;

        draw_cross_mut(
            canvas,
            DARK_RED,
            expected_left_timing_mark_center.x.round() as PixelPosition,
            expected_left_timing_mark_center.y.round() as PixelPosition,
        );

        let expected_right_timing_mark_center = Segment::new(
            partial_timing_marks.top_right_corner,
            partial_timing_marks.bottom_right_corner,
        )
        .with_length(right_line_distance_per_segment * (i as SubPixelUnit))
        .end;

        draw_cross_mut(
            canvas,
            DARK_CYAN,
            expected_right_timing_mark_center.x.round() as PixelPosition,
            expected_right_timing_mark_center.y.round() as PixelPosition,
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
            draw_cross_mut(
                canvas,
                PINK,
                point.x.round() as PixelPosition,
                point.y.round() as PixelPosition,
            );
        }
    }
}

fn monospace_font() -> Font<'static> {
    Font::try_from_bytes(include_bytes!("../data/fonts/Inconsolata-Regular.ttf"))
        .expect("font is valid")
}

/// Draws a debug image outlining all the scored bubble marks.
pub fn draw_scored_bubble_marks_debug_image_mut(
    canvas: &mut RgbImage,
    scored_bubble_marks: &Vec<(GridPosition, Option<ScoredBubbleMark>)>,
) {
    let option_color = PINK;
    let matched_bubble_color = DARK_GREEN;
    let original_bubble_color = DARK_BLUE;
    let match_score_color = ORANGE;
    let fill_score_color = DARK_CYAN;
    let font = &monospace_font();
    let font_scale = 20.0;
    let scale = Scale::uniform(font_scale);

    draw_legend(
        canvas,
        &vec![
            (original_bubble_color, "Expected Bubble Bounds"),
            (matched_bubble_color, "Matched Bubble Bounds"),
            (
                match_score_color,
                "Bubble Match Score (100% = perfect alignment)",
            ),
            (
                fill_score_color,
                "Bubble Fill Score (0% = no fill, 100% = perfect fill)",
            ),
        ],
    );

    for (grid_position, scored_bubble_mark) in scored_bubble_marks {
        if let Some(scored_bubble_mark) = scored_bubble_mark {
            let mut option_text = grid_position.to_string();
            option_text.truncate(25);

            let (option_text_width, option_text_height) =
                text_size(scale, font, option_text.as_str());

            let match_score_text = scored_bubble_mark.match_score.to_string();
            let fill_score_text = scored_bubble_mark.fill_score.to_string();
            let (match_score_text_width, match_score_text_height) =
                text_size(scale, font, match_score_text.as_str());
            let (fill_score_text_width, _) = text_size(scale, font, fill_score_text.as_str());

            draw_text_with_background_mut(
                canvas,
                &option_text,
                scored_bubble_mark
                    .expected_bounds
                    .left()
                    .min(scored_bubble_mark.matched_bounds.left())
                    - option_text_width
                    - 5,
                (scored_bubble_mark
                    .expected_bounds
                    .top()
                    .min(scored_bubble_mark.matched_bounds.top())
                    + scored_bubble_mark
                        .expected_bounds
                        .bottom()
                        .max(scored_bubble_mark.matched_bounds.bottom()))
                    / 2
                    - (option_text_height / 2),
                scale,
                font,
                option_color,
                WHITE_RGB,
            );

            draw_text_with_background_mut(
                canvas,
                &match_score_text,
                (scored_bubble_mark
                    .expected_bounds
                    .left()
                    .min(scored_bubble_mark.matched_bounds.left())
                    + scored_bubble_mark
                        .expected_bounds
                        .right()
                        .max(scored_bubble_mark.matched_bounds.right()))
                    / 2
                    - (match_score_text_width / 2),
                scored_bubble_mark
                    .expected_bounds
                    .top()
                    .min(scored_bubble_mark.matched_bounds.top())
                    - 5
                    - match_score_text_height,
                scale,
                font,
                match_score_color,
                WHITE_RGB,
            );

            draw_text_with_background_mut(
                canvas,
                &fill_score_text,
                (scored_bubble_mark
                    .expected_bounds
                    .left()
                    .min(scored_bubble_mark.matched_bounds.left())
                    + scored_bubble_mark
                        .expected_bounds
                        .right()
                        .max(scored_bubble_mark.matched_bounds.right()))
                    / 2
                    - (fill_score_text_width / 2),
                scored_bubble_mark
                    .expected_bounds
                    .bottom()
                    .max(scored_bubble_mark.matched_bounds.bottom())
                    + 5,
                scale,
                font,
                fill_score_color,
                WHITE_RGB,
            );

            draw_hollow_rect_mut(
                canvas,
                scored_bubble_mark.expected_bounds.into(),
                original_bubble_color,
            );
            draw_hollow_rect_mut(
                canvas,
                scored_bubble_mark.matched_bounds.into(),
                matched_bubble_color,
            );
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_text_with_background_mut(
    canvas: &mut RgbImage,
    text: &str,
    x: PixelPosition,
    y: PixelPosition,
    scale: Scale,
    font: &Font,
    text_color: Rgb<u8>,
    background_color: Rgb<u8>,
) {
    let (text_width, text_height) = text_size(scale, font, text);

    draw_filled_rect_mut(
        canvas,
        imageproc::rect::Rect::at(x, y).of_size(text_width as PixelUnit, text_height as PixelUnit),
        background_color,
    );
    draw_text_mut(canvas, text_color, x, y, scale, font, text);
}

fn draw_legend(canvas: &mut RgbImage, colored_labels: &Vec<(Rgb<u8>, &str)>) {
    let font = &monospace_font();
    let font_scale = 12.0;
    let scale = Scale::uniform(font_scale);

    let padding = 10;
    let spacing = 5;
    let legend_left = padding;
    let legend_top = padding;

    let mut legend_top = legend_top;
    for (color, label) in colored_labels {
        let (_, label_height) = text_size(scale, font, label);

        draw_text_with_background_mut(
            canvas,
            label,
            legend_left,
            legend_top,
            scale,
            font,
            *color,
            WHITE_RGB,
        );
        legend_top += label_height + spacing;
    }
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

    pub fn rotate180(&mut self) {
        self.input_image = self.input_image.as_ref().map(rotate180);
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
