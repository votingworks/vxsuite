#![allow(clippy::too_many_lines)]

use std::path::{Path, PathBuf};

use ab_glyph::{FontRef, PxScale};
use image::{imageops::rotate180, DynamicImage, GrayImage, Rgb, RgbImage};
use imageproc::drawing::{
    draw_cross_mut, draw_filled_rect_mut, draw_hollow_rect_mut, draw_line_segment_mut,
    draw_text_mut, text_size,
};
use log::debug;
use types_rs::election::GridPosition;
use types_rs::geometry::{
    PixelPosition, PixelUnit, Quadrilateral, Rect, Segment, SubGridUnit, SubPixelUnit,
};

use crate::ballot_card::Geometry;

fn imageproc_rect_from_rect(rect: &Rect) -> imageproc::rect::Rect {
    imageproc::rect::Rect::at(rect.left(), rect.top()).of_size(rect.width(), rect.height())
}

use crate::image_utils::{dark_rainbow, rainbow};
use crate::layout::InterpretedContestLayout;
use crate::scoring::UnitIntervalScore;
use crate::timing_marks::{Corner, FilteredRects, ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH};
use crate::{
    image_utils::{
        BLUE, CYAN, DARK_BLUE, DARK_CYAN, DARK_GREEN, DARK_RED, GREEN, ORANGE, PINK, RED, WHITE_RGB,
    },
    qr_code::Detected,
    scoring::{ScoredBubbleMark, ScoredPositionAreas},
    timing_marks::{Partial, TimingMarkGrid},
};

const TOP_COLOR: Rgb<u8> = GREEN;
const BOTTOM_COLOR: Rgb<u8> = BLUE;
const LEFT_COLOR: Rgb<u8> = RED;
const RIGHT_COLOR: Rgb<u8> = CYAN;
const CORNER_COLOR: Rgb<u8> = PINK;

pub fn draw_qr_code_debug_image_mut(
    canvas: &mut RgbImage,
    qr_code: Option<&Detected>,
    detection_areas: &[Rect],
) {
    for detection_area in detection_areas {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(detection_area), ORANGE);
    }

    match qr_code {
        Some(qr_code) => {
            let scale = PxScale::from(20.0);
            let font = monospace_font();
            let fg = WHITE_RGB;
            let bg = DARK_GREEN;
            draw_hollow_rect_mut(
                canvas,
                imageproc_rect_from_rect(&qr_code.bounds()),
                DARK_GREEN,
            );
            draw_text_with_background_mut(
                canvas,
                &format!("QR code: {:x?}", qr_code.bytes()),
                0,
                0,
                scale,
                &font,
                fg,
                bg,
            );
            draw_text_with_background_mut(
                canvas,
                &format!("Detector: {:?}", qr_code.detector()),
                0,
                20,
                scale,
                &font,
                fg,
                bg,
            );
            draw_text_with_background_mut(
                canvas,
                &format!("Orientation: {:?}", qr_code.orientation()),
                0,
                40,
                scale,
                &font,
                fg,
                bg,
            );
        }
        None => {
            draw_text_mut(
                canvas,
                DARK_RED,
                0,
                0,
                PxScale::from(20.0),
                &monospace_font(),
                "No QR code found",
            );
        }
    }
}

pub fn draw_vertical_streaks_debug_image_mut(
    canvas: &mut RgbImage,
    streaks: &[(PixelUnit, f32, PixelUnit)],
) {
    for (i, ((x, percent_black_pixels, longest_white_gap_length), color)) in
        streaks.iter().zip(dark_rainbow()).enumerate()
    {
        let x = *x as PixelPosition;
        let y = 20 + (i as PixelPosition * 20);
        draw_cross_mut(canvas, color, x, y);
        draw_text_with_background_mut(
            canvas,
            &format!(
                "x={}, Black: {:.0}%, Gap: {}",
                x,
                100.0 * percent_black_pixels,
                longest_white_gap_length
            ),
            x + 5,
            y,
            PxScale::from(20.0),
            &monospace_font(),
            color,
            WHITE_RGB,
        );
    }
}

pub fn draw_contours_debug_image_mut(canvas: &mut RgbImage, contour_rects: &[Rect]) {
    for (rect, color) in contour_rects.iter().zip(rainbow()) {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(rect), color);
    }
}

/// Draws a debug image of the rectangles found using the contour algorithm.
pub fn draw_candidate_timing_marks_debug_image_mut(
    canvas: &mut RgbImage,
    contour_rects: &[Rect],
    candidate_timing_marks: &[Rect],
) {
    for (rect, color) in contour_rects.iter().zip(rainbow()) {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(rect), color);
    }

    for (rect, color) in candidate_timing_marks.iter().zip(rainbow()) {
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), color);
    }
}

/// Draws a debug image of the timing marks.
pub fn draw_timing_mark_debug_image_mut(
    canvas: &mut RgbImage,
    geometry: &Geometry,
    partial_timing_marks: &Partial,
) {
    let allowed_inset =
        (ALLOWED_TIMING_MARK_INSET_PERCENTAGE_OF_WIDTH * geometry.canvas_size.width as f32) as i32;
    let inset_rect = imageproc::rect::Rect::at(allowed_inset, allowed_inset).of_size(
        geometry.canvas_size.width - (allowed_inset * 2) as u32,
        geometry.canvas_size.height - (allowed_inset * 2) as u32,
    );
    draw_hollow_rect_mut(canvas, inset_rect, DARK_RED);

    draw_legend(
        canvas,
        &[
            (
                TOP_COLOR,
                format!(
                    "Top ({}/{} found, rotation {})",
                    partial_timing_marks.top_rects.len(),
                    geometry.grid_size.width,
                    partial_timing_marks.top_side_rotation().to_degrees(),
                )
                .as_str(),
            ),
            (
                BOTTOM_COLOR,
                format!(
                    "Bottom ({}/{} found, rotation {})",
                    partial_timing_marks.bottom_rects.len(),
                    geometry.grid_size.width,
                    partial_timing_marks.bottom_side_rotation().to_degrees(),
                )
                .as_str(),
            ),
            (
                LEFT_COLOR,
                format!(
                    "Left ({}/{} found, rotation {})",
                    partial_timing_marks.left_rects.len(),
                    geometry.grid_size.height,
                    partial_timing_marks.left_side_rotation().to_degrees(),
                )
                .as_str(),
            ),
            (
                RIGHT_COLOR,
                format!(
                    "Right ({}/{} found, rotation {})",
                    partial_timing_marks.right_rects.len(),
                    geometry.grid_size.height,
                    partial_timing_marks.right_side_rotation().to_degrees(),
                )
                .as_str(),
            ),
            (
                CORNER_COLOR,
                format!(
                    "Corners ({}/4)",
                    u32::from(partial_timing_marks.top_left_rect.is_some())
                        + u32::from(partial_timing_marks.top_right_rect.is_some())
                        + u32::from(partial_timing_marks.bottom_left_rect.is_some())
                        + u32::from(partial_timing_marks.bottom_right_rect.is_some()),
                )
                .as_str(),
            ),
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
        TOP_COLOR,
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
        BOTTOM_COLOR,
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
        LEFT_COLOR,
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
        RIGHT_COLOR,
    );

    let font = &monospace_font();
    let font_scale = 15.0;
    let scale = PxScale::from(font_scale);

    for (i, rect) in partial_timing_marks.top_rects.iter().enumerate() {
        let center = rect.center();
        let text = format!("{i}");
        let (text_width, text_height) = text_size(scale, font, text.as_str());
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), TOP_COLOR);
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
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), BOTTOM_COLOR);
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
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), LEFT_COLOR);
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
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), RIGHT_COLOR);
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
        draw_filled_rect_mut(
            canvas,
            imageproc_rect_from_rect(&top_left_corner),
            CORNER_COLOR,
        );
    }

    if let Some(top_right_corner) = partial_timing_marks.top_right_rect {
        draw_filled_rect_mut(
            canvas,
            imageproc_rect_from_rect(&top_right_corner),
            CORNER_COLOR,
        );
    }

    if let Some(bottom_left_corner) = partial_timing_marks.bottom_left_rect {
        draw_filled_rect_mut(
            canvas,
            imageproc_rect_from_rect(&bottom_left_corner),
            CORNER_COLOR,
        );
    }

    if let Some(bottom_right_corner) = partial_timing_marks.bottom_right_rect {
        draw_filled_rect_mut(
            canvas,
            imageproc_rect_from_rect(&bottom_right_corner),
            CORNER_COLOR,
        );
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

/// Draws a debug image showing all the timing marks rects that were filtered out.
pub fn draw_filtered_timing_marks_debug_image_mut(
    canvas: &mut RgbImage,
    top_line_filtered: &FilteredRects,
    bottom_line_filtered: &FilteredRects,
    left_line_filtered: &FilteredRects,
    right_line_filtered: &FilteredRects,
) {
    draw_legend(
        canvas,
        &[
            (
                TOP_COLOR,
                &format!(
                    "Top Line ({} removed): mean = {:.2}×{:.2}, stddev = {:.2}×{:.2}, range = {:.2}×{:.2}..{:.2}×{:.2} (± {:.2} stddev)",
                    top_line_filtered.removed_rects.len(),
                    top_line_filtered.mean_width,
                    top_line_filtered.mean_height,
                    top_line_filtered.stddev_width,
                    top_line_filtered.stddev_height,
                    top_line_filtered.width_range.start,
                    top_line_filtered.height_range.start,
                    top_line_filtered.width_range.end,
                    top_line_filtered.height_range.end,
                    top_line_filtered.stddev_threshold,
                ),
            ),
            (
                BOTTOM_COLOR,
                &format!(
                    "Bottom Line ({} removed): mean = {:.2}×{:.2}, stddev = {:.2}×{:.2}, range = {:.2}×{:.2}..{:.2}×{:.2} (± {:.2} stddev)",
                    bottom_line_filtered.removed_rects.len(),
                    bottom_line_filtered.mean_width,
                    bottom_line_filtered.mean_height,
                    bottom_line_filtered.stddev_width,
                    bottom_line_filtered.stddev_height,
                    bottom_line_filtered.width_range.start,
                    bottom_line_filtered.height_range.start,
                    bottom_line_filtered.width_range.end,
                    bottom_line_filtered.height_range.end,
                    bottom_line_filtered.stddev_threshold,
                ),
            ),
            (
                LEFT_COLOR,
                &format!(
                    "Left Line ({} removed): mean = {:.2}×{:.2}, stddev = {:.2}×{:.2}, range = {:.2}×{:.2}..{:.2}×{:.2} (± {:.2} stddev)",
                    left_line_filtered.removed_rects.len(),
                    left_line_filtered.mean_width,
                    left_line_filtered.mean_height,
                    left_line_filtered.stddev_width,
                    left_line_filtered.stddev_height,
                    left_line_filtered.width_range.start,
                    left_line_filtered.height_range.start,
                    left_line_filtered.width_range.end,
                    left_line_filtered.height_range.end,
                    left_line_filtered.stddev_threshold,
                ),
            ),
            (
                RIGHT_COLOR,
                &format!(
                    "Right Line ({} removed): mean = {:.2}×{:.2}, stddev = {:.2}×{:.2}, range = {:.2}×{:.2}..{:.2}×{:.2} (± {:.2} stddev)",
                    right_line_filtered.removed_rects.len(),
                    right_line_filtered.mean_width,
                    right_line_filtered.mean_height,
                    right_line_filtered.stddev_width,
                    right_line_filtered.stddev_height,
                    right_line_filtered.width_range.start,
                    right_line_filtered.height_range.start,
                    right_line_filtered.width_range.end,
                    right_line_filtered.height_range.end,
                    right_line_filtered.stddev_threshold,
                ),
            ),
        ],
    );

    let font = &monospace_font();
    let scale = PxScale::from(18.0);
    let margin = 5;

    for rect in &top_line_filtered.rects {
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), TOP_COLOR);
    }

    for rect in &top_line_filtered.removed_rects {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(rect), TOP_COLOR);
    }

    for rect in top_line_filtered
        .rects
        .iter()
        .chain(top_line_filtered.removed_rects.iter())
    {
        let text = format!("{}×{}", rect.width(), rect.height());
        let (text_width, _) = text_size(scale, font, &text);

        draw_text_mut(
            canvas,
            TOP_COLOR,
            (rect.center().x - (text_width as f32 / 2.0)) as PixelPosition,
            rect.bottom() + margin,
            scale,
            font,
            &text,
        );
    }

    for rect in &bottom_line_filtered.rects {
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), BOTTOM_COLOR);
    }

    for rect in &bottom_line_filtered.removed_rects {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(rect), BOTTOM_COLOR);
    }

    for rect in bottom_line_filtered
        .rects
        .iter()
        .chain(bottom_line_filtered.removed_rects.iter())
    {
        let text = format!("{}×{}", rect.width(), rect.height());
        let (text_width, text_height) = text_size(scale, font, &text);
        draw_text_mut(
            canvas,
            BOTTOM_COLOR,
            (rect.center().x - (text_width as f32 / 2.0)) as PixelPosition,
            rect.top() - margin - text_height as PixelPosition,
            scale,
            font,
            &text,
        );
    }

    for rect in &left_line_filtered.rects {
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), LEFT_COLOR);
    }

    for rect in &left_line_filtered.removed_rects {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(rect), LEFT_COLOR);
    }

    for rect in left_line_filtered
        .rects
        .iter()
        .chain(left_line_filtered.removed_rects.iter())
    {
        let text = format!("{}×{}", rect.width(), rect.height());
        let (_, text_height) = text_size(scale, font, &text);
        draw_text_mut(
            canvas,
            LEFT_COLOR,
            rect.right() + margin,
            (rect.center().y - (text_height as f32 / 2.0)) as PixelPosition,
            scale,
            font,
            &text,
        );
    }

    for rect in &right_line_filtered.rects {
        draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), RIGHT_COLOR);
    }

    for rect in &right_line_filtered.removed_rects {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(rect), RIGHT_COLOR);
    }

    for rect in right_line_filtered
        .rects
        .iter()
        .chain(right_line_filtered.removed_rects.iter())
    {
        let text = format!("{}×{}", rect.width(), rect.height());
        let (text_width, text_height) = text_size(scale, font, &text);
        draw_text_mut(
            canvas,
            RIGHT_COLOR,
            rect.left() - margin - text_width as i32,
            (rect.center().y - (text_height as f32 / 2.0)) as PixelPosition,
            scale,
            font,
            &text,
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
                .point_for_location(column as SubGridUnit, row as SubGridUnit)
                .expect("grid point is defined");
            draw_cross_mut(
                canvas,
                CORNER_COLOR,
                point.x.round() as PixelPosition,
                point.y.round() as PixelPosition,
            );
        }
    }
}

pub fn draw_corner_match_info_debug_image_mut(
    canvas: &mut RgbImage,
    corner_match_info: &[(Rect, Option<UnitIntervalScore>, Corner)],
) {
    for (rect, match_score, corner) in corner_match_info {
        let color = match corner {
            Corner::TopLeft => TOP_COLOR,
            Corner::TopRight => RIGHT_COLOR,
            Corner::BottomLeft => LEFT_COLOR,
            Corner::BottomRight => BOTTOM_COLOR,
        };
        if let Some(match_score) = match_score {
            draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(rect), color);
            draw_text_mut(
                canvas,
                color,
                rect.left(),
                rect.bottom(),
                PxScale::from(20.0),
                &monospace_font(),
                &format!("{match_score:.2}"),
            );
        } else {
            draw_filled_rect_mut(canvas, imageproc_rect_from_rect(rect), color);
        }
    }
}

fn monospace_font() -> FontRef<'static> {
    FontRef::try_from_slice(include_bytes!("../../data/fonts/Inconsolata-Regular.ttf"))
        .expect("font is valid")
}

macro_rules! i32ify {
    ($x:expr) => {
        i32::try_from($x).expect(format!("{} fits within i32", stringify!($x)).as_str())
    };
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
    let scale = PxScale::from(font_scale);

    draw_legend(
        canvas,
        &[
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
                    - i32ify!(option_text_width)
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
                    - i32ify!(option_text_height / 2),
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
                    - i32ify!(match_score_text_width / 2),
                scored_bubble_mark
                    .expected_bounds
                    .top()
                    .min(scored_bubble_mark.matched_bounds.top())
                    - 5
                    - i32ify!(match_score_text_height),
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
                    - i32ify!(fill_score_text_width / 2),
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
                imageproc_rect_from_rect(&scored_bubble_mark.expected_bounds),
                original_bubble_color,
            );
            draw_hollow_rect_mut(
                canvas,
                imageproc_rect_from_rect(&scored_bubble_mark.matched_bounds),
                matched_bubble_color,
            );
        }
    }
}

pub fn draw_scored_write_in_areas(
    canvas: &mut RgbImage,
    scored_write_in_areas: &ScoredPositionAreas,
) {
    let font = &monospace_font();
    let font_scale = 20.0;
    let scale = PxScale::from(font_scale);

    draw_legend(
        canvas,
        &[
            (DARK_GREEN, "Write-In Area Bounds"),
            (ORANGE, "Write-In Area Score (100% = completely filled)"),
        ],
    );

    for scored_write_in_area in scored_write_in_areas {
        let mut option_text = scored_write_in_area.grid_position.to_string();
        option_text.truncate(25);

        let (option_text_width, option_text_height) = text_size(scale, font, option_text.as_str());

        let score_text = scored_write_in_area.score.to_string();
        let (score_text_width, score_text_height) = text_size(scale, font, score_text.as_str());
        let bounds = scored_write_in_area.shape.bounds();

        draw_text_with_background_mut(
            canvas,
            &option_text,
            bounds.left()
                - i32::try_from(option_text_width).expect("option_text_width fits within i32")
                - 5,
            (bounds.top() + bounds.bottom()) / 2 - i32ify!(option_text_height / 2),
            scale,
            font,
            DARK_GREEN,
            WHITE_RGB,
        );

        draw_text_with_background_mut(
            canvas,
            &score_text,
            (bounds.left() + bounds.right()) / 2 - i32ify!(score_text_width / 2),
            bounds.top() - 5 - i32ify!(score_text_height),
            scale,
            font,
            ORANGE,
            WHITE_RGB,
        );

        draw_quadrilateral_mut(canvas, &scored_write_in_area.shape, DARK_GREEN);
    }
}

pub fn draw_quadrilateral_mut(
    canvas: &mut RgbImage,
    Quadrilateral {
        top_left,
        top_right,
        bottom_left,
        bottom_right,
    }: &Quadrilateral,
    color: Rgb<u8>,
) {
    draw_line_segment_mut(
        canvas,
        (top_left.x, top_left.y),
        (top_right.x, top_right.y),
        color,
    );

    draw_line_segment_mut(
        canvas,
        (top_right.x, top_right.y),
        (bottom_right.x, bottom_right.y),
        color,
    );

    draw_line_segment_mut(
        canvas,
        (bottom_right.x, bottom_right.y),
        (bottom_left.x, bottom_left.y),
        color,
    );

    draw_line_segment_mut(
        canvas,
        (bottom_left.x, bottom_left.y),
        (top_left.x, top_left.y),
        color,
    );
}

pub fn draw_contest_layouts_debug_image_mut(
    canvas: &mut RgbImage,
    contest_layouts: &[InterpretedContestLayout],
) {
    let font = &monospace_font();
    let font_scale = 20.0;
    let scale = PxScale::from(font_scale);

    for contest_layout in contest_layouts {
        for (option_layout, color) in contest_layout
            .options
            .iter()
            .zip([DARK_BLUE, DARK_GREEN].into_iter().cycle())
        {
            let option_label = option_layout.option_id.to_string();
            draw_text_with_background_mut(
                canvas,
                &option_label,
                option_layout.bounds.left(),
                option_layout.bounds.top(),
                scale,
                font,
                WHITE_RGB,
                color,
            );
            draw_hollow_rect_mut(
                canvas,
                imageproc_rect_from_rect(&option_layout.bounds),
                color,
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
    scale: PxScale,
    font: &FontRef,
    text_color: Rgb<u8>,
    background_color: Rgb<u8>,
) {
    let (text_width, text_height) = text_size(scale, font, text);

    draw_filled_rect_mut(
        canvas,
        imageproc::rect::Rect::at(x, y).of_size(
            text_width as PixelUnit,
            (text_height as f32 * 1.3) as PixelUnit,
        ),
        background_color,
    );
    draw_text_mut(canvas, text_color, x, y, scale, font, text);
}

fn draw_legend(canvas: &mut RgbImage, colored_labels: &[(Rgb<u8>, &str)]) {
    let font = &monospace_font();
    let font_scale = 12.0;
    let scale = PxScale::from(font_scale);

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
        legend_top += i32ify!(label_height + spacing);
    }
}

pub fn draw_diagnostic_cells(canvas: &mut RgbImage, passed_cells: &[Rect], failed_cells: &[Rect]) {
    for cell in passed_cells {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(cell), GREEN);
    }

    for cell in failed_cells {
        draw_hollow_rect_mut(canvas, imageproc_rect_from_rect(cell), RED);
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

    pub const fn is_disabled(&self) -> bool {
        self.input_image.is_none()
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
#[allow(clippy::unwrap_used)]
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
