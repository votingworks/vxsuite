use std::{
    f32::consts::PI,
    fmt::{Display, Formatter},
    path::Path,
};

use image::{imageops::rotate180, GenericImageView, GrayImage};
use imageproc::{
    contours::{find_contours_with_threshold, BorderType, Contour},
    contrast::otsu_level,
};
use logging_timer::time;
use rayon::iter::ParallelIterator;
use rayon::prelude::IntoParallelRefIterator;
use serde::Serialize;

use crate::{
    ballot_card::{BallotSide, Geometry, Orientation},
    debug,
    debug::{draw_timing_mark_debug_image_mut, ImageDebugWriter},
    election::{GridLayout, GridLocation, GridPosition},
    geometry::{
        center_of_rect, find_best_line_through_items, intersection_of_lines, Point, Rect, Segment,
        Size,
    },
    image_utils::{diff, expand_image, ratio, Inset, BLACK, WHITE},
    interpret::Error,
    metadata::{decode_metadata_from_timing_marks, BallotPageMetadata},
};

/// Represents partial timing marks found in a ballot card.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Partial {
    pub geometry: Geometry,
    pub top_left_corner: Point<f32>,
    pub top_right_corner: Point<f32>,
    pub bottom_left_corner: Point<f32>,
    pub bottom_right_corner: Point<f32>,
    pub top_rects: Vec<Rect>,
    pub bottom_rects: Vec<Rect>,
    pub left_rects: Vec<Rect>,
    pub right_rects: Vec<Rect>,
    pub top_left_rect: Option<Rect>,
    pub top_right_rect: Option<Rect>,
    pub bottom_left_rect: Option<Rect>,
    pub bottom_right_rect: Option<Rect>,
}

impl From<Complete> for Partial {
    fn from(complete_timing_marks: Complete) -> Self {
        Self {
            geometry: complete_timing_marks.geometry,
            top_left_corner: complete_timing_marks.top_left_corner,
            top_right_corner: complete_timing_marks.top_right_corner,
            bottom_left_corner: complete_timing_marks.bottom_left_corner,
            bottom_right_corner: complete_timing_marks.bottom_right_corner,
            top_rects: complete_timing_marks.top_rects,
            bottom_rects: complete_timing_marks.bottom_rects,
            left_rects: complete_timing_marks.left_rects,
            right_rects: complete_timing_marks.right_rects,
            top_left_rect: Some(complete_timing_marks.top_left_rect),
            top_right_rect: Some(complete_timing_marks.top_right_rect),
            bottom_left_rect: Some(complete_timing_marks.bottom_left_rect),
            bottom_right_rect: Some(complete_timing_marks.bottom_right_rect),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Complete {
    pub geometry: Geometry,
    pub top_left_corner: Point<f32>,
    pub top_right_corner: Point<f32>,
    pub bottom_left_corner: Point<f32>,
    pub bottom_right_corner: Point<f32>,
    pub top_rects: Vec<Rect>,
    pub bottom_rects: Vec<Rect>,
    pub left_rects: Vec<Rect>,
    pub right_rects: Vec<Rect>,
    pub top_left_rect: Rect,
    pub top_right_rect: Rect,
    pub bottom_left_rect: Rect,
    pub bottom_right_rect: Rect,
}

/// Represents a grid of timing marks and provides access to the expected
/// location of ovals in the grid. Note that all coordinates are based in an
/// image that may have been rotated, cropped, and scaled. To recreate the image
/// that corresponds to the grid, follow these steps starting with the original:
///   1. rotate 180 degrees if `orientation` is `PortraitReversed`.
///   2. crop the image edges by `border_inset`.
///   3. scale the image to `scaled_size`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingMarkGrid {
    /// The geometry of the ballot card.
    pub geometry: Geometry,

    /// The orientation of the ballot card.
    pub orientation: Orientation,

    /// Inset to crop to exclude the border.
    pub border_inset: Inset,

    /// The size of the image after scaling.
    pub scaled_size: Size<u32>,

    /// Timing marks found by examining the image.
    pub partial_timing_marks: Partial,

    /// Timing marks inferred from the partial timing marks.
    pub complete_timing_marks: Complete,

    /// Areas of the ballot card that contain shapes that may be timing marks.
    pub candidate_timing_marks: Vec<Rect>,

    /// Metadata from the ballot card bottom timing marks.
    pub metadata: BallotPageMetadata,
}

impl TimingMarkGrid {
    pub fn new(
        geometry: Geometry,
        orientation: Orientation,
        border_inset: Inset,
        scaled_size: Size<u32>,
        partial_timing_marks: Partial,
        complete_timing_marks: Complete,
        candidate_timing_marks: Vec<Rect>,
        metadata: BallotPageMetadata,
    ) -> Self {
        Self {
            geometry,
            orientation,
            border_inset,
            scaled_size,
            partial_timing_marks,
            complete_timing_marks,
            candidate_timing_marks,
            metadata,
        }
    }

    /// Returns the center of the grid position at the given coordinates. Timing
    /// marks are at the edges of the grid, and the inside of the grid is where
    /// the ovals are.
    ///
    /// For example, if the grid is 34x51, then:
    ///
    ///   - (0, 0) is the top left corner of the grid
    ///   - (33, 0) is the top right corner of the grid
    ///   - (0, 50) is the bottom left corner of the grid
    ///   - (33, 50) is the bottom right corner of the grid
    ///   - (c, r) where 0 < c < 33 and 0 < r < 50 is the oval at column c and
    ///     row r
    pub fn point_for_location(&self, column: u32, row: u32) -> Option<Point<f32>> {
        if column >= self.geometry.grid_size.width || row >= self.geometry.grid_size.height {
            return None;
        }

        let left = self.complete_timing_marks.left_rects.get(row as usize)?;
        let right = self.complete_timing_marks.right_rects.get(row as usize)?;
        let top = self.complete_timing_marks.top_rects.get(column as usize)?;
        let bottom = self
            .complete_timing_marks
            .bottom_rects
            .get(column as usize)?;
        let horizontal_segment = Segment::new(center_of_rect(left), center_of_rect(right));
        let vertical_segment = Segment::new(center_of_rect(top), center_of_rect(bottom));

        intersection_of_lines(&horizontal_segment, &vertical_segment, false)
    }
}

/// Finds the timing marks in the given image and computes the grid of timing
/// marks, i.e. the locations of all the possible ovals.
#[time]
pub fn find_timing_mark_grid(
    image_path: &Path,
    geometry: &Geometry,
    img: &GrayImage,
    border_inset: Inset,
    debug: &mut ImageDebugWriter,
) -> Result<(TimingMarkGrid, Option<GrayImage>), Error> {
    let candidate_timing_marks = find_timing_mark_shapes(geometry, img, debug);

    let Some(partial_timing_marks) = find_partial_timing_marks_from_candidate_rects(
        geometry,
        &candidate_timing_marks,
        debug,
    ) else {
        return Err(Error::MissingTimingMarks {
            rects: candidate_timing_marks,
        })
    };

    let orientation =
        if partial_timing_marks.top_rects.len() >= partial_timing_marks.bottom_rects.len() {
            Orientation::Portrait
        } else {
            Orientation::PortraitReversed
        };

    let (partial_timing_marks, normalized_img, border_inset) =
        if orientation == Orientation::Portrait {
            (partial_timing_marks, None, border_inset)
        } else {
            let (width, height) = img.dimensions();
            debug.rotate180();
            (
                rotate_partial_timing_marks(&Size { width, height }, partial_timing_marks),
                Some(rotate180(img)),
                Inset {
                    top: border_inset.bottom,
                    bottom: border_inset.top,
                    left: border_inset.right,
                    right: border_inset.left,
                },
            )
        };

    debug.write(
        "partial_timing_marks_after_orientation_correction",
        |canvas| draw_timing_mark_debug_image_mut(canvas, geometry, &partial_timing_marks),
    );

    let Some(complete_timing_marks) = find_complete_timing_marks_from_partial_timing_marks(
        geometry,
        &partial_timing_marks,
        debug,
    ) else {
        return Err(Error::MissingTimingMarks {
            rects: candidate_timing_marks,
        })
    };

    let metadata =
        match decode_metadata_from_timing_marks(&partial_timing_marks, &complete_timing_marks) {
            Ok(metadata) => metadata,
            Err(error) => {
                return Err(Error::InvalidMetadata {
                    path: image_path.to_str().unwrap_or_default().to_string(),
                    error,
                })
            }
        };

    let scaled_size = Size {
        width: img.width(),
        height: img.height(),
    };

    let timing_mark_grid = TimingMarkGrid::new(
        *geometry,
        orientation,
        border_inset,
        scaled_size,
        partial_timing_marks,
        complete_timing_marks,
        candidate_timing_marks,
        metadata,
    );

    debug.write("timing_mark_grid", |canvas| {
        debug::draw_timing_mark_grid_debug_image_mut(canvas, &timing_mark_grid, geometry);
    });

    Ok((timing_mark_grid, normalized_img))
}

/// Determines if the given contour is rectangular. This is not an exact test,
/// but it is a good approximation.
fn is_contour_rectangular(contour: &Contour<u32>) -> bool {
    let rect = get_contour_bounding_rect(contour);

    let error_value = contour
        .points
        .iter()
        .map(|p| {
            (p.x - rect.left() as u32)
                .min(p.y - rect.top() as u32)
                .min(rect.right() as u32 - p.x)
                .min(rect.bottom() as u32 - p.y)
        })
        .sum::<u32>();
    let rectangular_score = error_value as f32 / contour.points.len() as f32;
    rectangular_score < 1.0
}

/// Returns the bounding rectangle of the given contour such that the rectangle
/// is the smallest rectangle that contains all of the points in the contour.
fn get_contour_bounding_rect(contour: &Contour<u32>) -> Rect {
    let min_x = contour.points.iter().map(|p| p.x).min().unwrap_or(0);
    let max_x = contour.points.iter().map(|p| p.x).max().unwrap_or(0);
    let min_y = contour.points.iter().map(|p| p.y).min().unwrap_or(0);
    let max_y = contour.points.iter().map(|p| p.y).max().unwrap_or(0);
    Rect::new(
        min_x as i32,
        min_y as i32,
        max_x - min_x + 1,
        max_y - min_y + 1,
    )
}

const BORDER_SIZE: u8 = 1;

/// Looks for possible timing mark shapes in the image without trying to
/// determine if they are actually timing marks.
#[time]
pub fn find_timing_mark_shapes(
    geometry: &Geometry,
    img: &GrayImage,
    debug: &ImageDebugWriter,
) -> Vec<Rect> {
    let threshold = otsu_level(img);

    // `find_contours_with_threshold` does not consider timing marks on the edge
    // of the image to be contours, so we expand the image and add whitespace
    // around the edges to ensure no timing marks are on the edge of the image
    let Ok(img) =  expand_image(img, BORDER_SIZE.into(), WHITE) else {
        return vec![];
    };

    let contours = find_contours_with_threshold(&img, threshold);
    debug.write("contours", |canvas| {
        debug::draw_contours_debug_image_mut(
            canvas,
            &contours
                .iter()
                .map(get_contour_bounding_rect)
                .collect::<Vec<_>>(),
        );
    });
    let candidate_timing_marks = contours
        .iter()
        .enumerate()
        .filter_map(|(i, contour)| {
            if contour.border_type == BorderType::Hole {
                let contour_bounds = get_contour_bounding_rect(contour)
                    .offset(-i32::from(BORDER_SIZE), -i32::from(BORDER_SIZE));
                if rect_could_be_timing_mark(geometry, &contour_bounds)
                    && is_contour_rectangular(contour)
                    && contours.iter().all(|c| c.parent != Some(i))
                {
                    return Some(contour_bounds);
                }
            }
            None
        })
        .collect::<Vec<_>>();

    debug.write("candidate_timing_marks", |canvas| {
        debug::draw_candidate_timing_marks_debug_image_mut(
            canvas,
            &contours
                .iter()
                .map(|c| {
                    get_contour_bounding_rect(c)
                        .offset(-i32::from(BORDER_SIZE), -i32::from(BORDER_SIZE))
                })
                .collect::<Vec<_>>(),
            &candidate_timing_marks,
        );
    });

    candidate_timing_marks
}

#[time]
pub fn find_partial_timing_marks_from_candidate_rects(
    geometry: &Geometry,
    rects: &[Rect],
    debug: &ImageDebugWriter,
) -> Option<Partial> {
    let half_height = (geometry.canvas_size.height / 2) as i32;
    let top_half_rects = rects
        .iter()
        .filter(|r| r.top() < half_height)
        .copied()
        .collect::<Vec<Rect>>();
    let bottom_half_rects = rects
        .iter()
        .filter(|r| r.top() >= half_height)
        .copied()
        .collect::<Vec<Rect>>();
    let left_half_rects = rects
        .iter()
        .filter(|r| r.left() < half_height)
        .copied()
        .collect::<Vec<Rect>>();
    let right_half_rects = rects
        .iter()
        .filter(|r| r.left() >= half_height)
        .copied()
        .collect::<Vec<Rect>>();
    let mut top_line = find_best_line_through_items(&top_half_rects, 0.0, 5.0_f32.to_radians());
    let mut bottom_line =
        find_best_line_through_items(&bottom_half_rects, 0.0, 5.0_f32.to_radians());
    let mut left_line =
        find_best_line_through_items(&left_half_rects, PI / 2.0, 5.0_f32.to_radians());
    let mut right_line =
        find_best_line_through_items(&right_half_rects, PI / 2.0, 5.0_f32.to_radians());

    top_line.sort_by_key(Rect::left);
    bottom_line.sort_by_key(Rect::left);
    left_line.sort_by_key(Rect::top);
    right_line.sort_by_key(Rect::top);

    let top_start_rect_center = center_of_rect(top_line.first()?);
    let top_last_rect_center = center_of_rect(top_line.last()?);

    let bottom_start_rect_center = center_of_rect(bottom_line.first()?);
    let bottom_last_rect_center = center_of_rect(bottom_line.last()?);

    let left_start_rect_center = center_of_rect(left_line.first()?);
    let left_last_rect_center = center_of_rect(left_line.last()?);

    let right_start_rect_center = center_of_rect(right_line.first()?);
    let right_last_rect_center = center_of_rect(right_line.last()?);

    let top_left_corner = if top_line.first() == left_line.first() {
        top_line.first()
    } else {
        None
    };
    let top_right_corner = if top_line.last() == right_line.first() {
        top_line.last()
    } else {
        None
    };
    let bottom_left_corner = if bottom_line.first() == left_line.last() {
        bottom_line.first()
    } else {
        None
    };
    let bottom_right_corner = if bottom_line.last() == right_line.last() {
        bottom_line.last()
    } else {
        None
    };

    let top_left_intersection = intersection_of_lines(
        &Segment::new(top_start_rect_center, top_last_rect_center),
        &Segment::new(left_start_rect_center, left_last_rect_center),
        false,
    )?;

    let top_right_intersection = intersection_of_lines(
        &Segment::new(top_start_rect_center, top_last_rect_center),
        &Segment::new(right_start_rect_center, right_last_rect_center),
        false,
    )?;

    let bottom_left_intersection = intersection_of_lines(
        &Segment::new(bottom_start_rect_center, bottom_last_rect_center),
        &Segment::new(left_start_rect_center, left_last_rect_center),
        false,
    )?;

    let bottom_right_intersection = intersection_of_lines(
        &Segment::new(bottom_start_rect_center, bottom_last_rect_center),
        &Segment::new(right_start_rect_center, right_last_rect_center),
        false,
    )?;

    let partial_timing_marks = Partial {
        geometry: *geometry,
        top_left_corner: top_left_intersection,
        top_right_corner: top_right_intersection,
        bottom_left_corner: bottom_left_intersection,
        bottom_right_corner: bottom_right_intersection,
        top_left_rect: top_left_corner.copied(),
        top_right_rect: top_right_corner.copied(),
        bottom_left_rect: bottom_left_corner.copied(),
        bottom_right_rect: bottom_right_corner.copied(),
        top_rects: top_line,
        bottom_rects: bottom_line,
        left_rects: left_line,
        right_rects: right_line,
    };

    debug.write("partial_timing_marks", |canvas| {
        debug::draw_timing_mark_debug_image_mut(canvas, geometry, &partial_timing_marks);
    });

    Some(partial_timing_marks)
}

struct Rotator180 {
    canvas_area: Rect,
}

impl Rotator180 {
    pub const fn new(canvas_size: Size<u32>) -> Self {
        Self {
            canvas_area: Rect::new(0, 0, canvas_size.width, canvas_size.height),
        }
    }

    pub fn rotate_rect(&self, rect: &Rect) -> Rect {
        Rect::from_points(
            self.rotate_point_i32(rect.bottom_right()),
            self.rotate_point_i32(rect.top_left()),
        )
    }

    fn rotate_point_i32(&self, point: Point<i32>) -> Point<i32> {
        Point::new(
            self.canvas_area.width() as i32 - 1 - point.x,
            self.canvas_area.height() as i32 - 1 - point.y,
        )
    }

    fn rotate_point_f32(&self, point: Point<f32>) -> Point<f32> {
        Point::new(
            (self.canvas_area.width() as i32 - 1) as f32 - point.x,
            (self.canvas_area.height() as i32 - 1) as f32 - point.y,
        )
    }
}

#[time]
pub fn rotate_partial_timing_marks(
    image_size: &Size<u32>,
    partial_timing_marks: Partial,
) -> Partial {
    let Partial {
        geometry,
        top_left_corner,
        top_right_corner,
        bottom_left_corner,
        bottom_right_corner,
        top_left_rect,
        top_right_rect,
        bottom_left_rect,
        bottom_right_rect,
        top_rects,
        bottom_rects,
        left_rects,
        right_rects,
    } = partial_timing_marks;

    let rotator = Rotator180::new(*image_size);

    let (top_left_corner, top_right_corner, bottom_left_corner, bottom_right_corner) = (
        rotator.rotate_point_f32(bottom_right_corner),
        rotator.rotate_point_f32(bottom_left_corner),
        rotator.rotate_point_f32(top_right_corner),
        rotator.rotate_point_f32(top_left_corner),
    );

    let (top_left_rect, top_right_rect, bottom_left_rect, bottom_right_rect) = (
        bottom_right_rect.map(|r| rotator.rotate_rect(&r)),
        bottom_left_rect.map(|r| rotator.rotate_rect(&r)),
        top_right_rect.map(|r| rotator.rotate_rect(&r)),
        top_left_rect.map(|r| rotator.rotate_rect(&r)),
    );

    let mut rotated_top_rects: Vec<Rect> =
        top_rects.iter().map(|r| rotator.rotate_rect(r)).collect();
    let mut rotated_bottom_rects: Vec<Rect> = bottom_rects
        .iter()
        .map(|r| rotator.rotate_rect(r))
        .collect();
    let mut rotated_left_rects: Vec<Rect> =
        left_rects.iter().map(|r| rotator.rotate_rect(r)).collect();
    let mut rotated_right_rects: Vec<Rect> =
        right_rects.iter().map(|r| rotator.rotate_rect(r)).collect();

    rotated_bottom_rects.sort_by_key(Rect::left);
    rotated_top_rects.sort_by_key(Rect::left);
    rotated_left_rects.sort_by_key(Rect::top);
    rotated_right_rects.sort_by_key(Rect::top);

    Partial {
        geometry,
        top_left_corner,
        top_right_corner,
        bottom_left_corner,
        bottom_right_corner,
        top_left_rect,
        top_right_rect,
        bottom_left_rect,
        bottom_right_rect,
        top_rects: rotated_bottom_rects,
        bottom_rects: rotated_top_rects,
        left_rects: rotated_right_rects,
        right_rects: rotated_left_rects,
    }
}

#[time]
pub fn find_complete_timing_marks_from_partial_timing_marks(
    geometry: &Geometry,
    partial_timing_marks: &Partial,
    debug: &ImageDebugWriter,
) -> Option<Complete> {
    let top_line = &partial_timing_marks.top_rects;
    let bottom_line = &partial_timing_marks.bottom_rects;
    let left_line = &partial_timing_marks.left_rects;
    let right_line = &partial_timing_marks.right_rects;

    let mut all_distances = vec![];
    all_distances.append(&mut distances_between_rects(top_line));
    all_distances.append(&mut distances_between_rects(bottom_line));
    all_distances.append(&mut distances_between_rects(left_line));
    all_distances.append(&mut distances_between_rects(right_line));
    all_distances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    if all_distances.is_empty() {
        return None;
    }

    let median_distance = all_distances[all_distances.len() / 2];

    let top_line = infer_missing_timing_marks_on_segment(
        top_line,
        &Segment::new(
            partial_timing_marks.top_left_corner,
            partial_timing_marks.top_right_corner,
        ),
        median_distance,
        geometry.grid_size.width,
        geometry,
    );

    let bottom_line = infer_missing_timing_marks_on_segment(
        bottom_line,
        &Segment::new(
            partial_timing_marks.bottom_left_corner,
            partial_timing_marks.bottom_right_corner,
        ),
        median_distance,
        geometry.grid_size.width,
        geometry,
    );

    let left_line = infer_missing_timing_marks_on_segment(
        left_line,
        &Segment::new(
            partial_timing_marks.top_left_corner,
            partial_timing_marks.bottom_left_corner,
        ),
        median_distance,
        geometry.grid_size.height,
        geometry,
    );

    let right_line = infer_missing_timing_marks_on_segment(
        right_line,
        &Segment::new(
            partial_timing_marks.top_right_corner,
            partial_timing_marks.bottom_right_corner,
        ),
        median_distance,
        geometry.grid_size.height,
        geometry,
    );

    if top_line.len() != bottom_line.len() || left_line.len() != right_line.len() {
        return None;
    }

    let (Some(top_left_rect), Some(top_right_rect), Some(bottom_left_rect), Some(bottom_right_rect)) = (
        top_line.first().copied(),
        top_line.last().copied(),
        bottom_line.first().copied(),
        bottom_line.last().copied(),
    ) else {
        return None;
    };

    let complete_timing_marks = Complete {
        geometry: *geometry,
        top_rects: top_line,
        bottom_rects: bottom_line,
        left_rects: left_line,
        right_rects: right_line,
        top_left_corner: partial_timing_marks.top_left_corner,
        top_right_corner: partial_timing_marks.top_right_corner,
        bottom_left_corner: partial_timing_marks.bottom_left_corner,
        bottom_right_corner: partial_timing_marks.bottom_right_corner,
        top_left_rect,
        top_right_rect,
        bottom_left_rect,
        bottom_right_rect,
    };

    debug.write("complete_timing_marks", |canvas| {
        debug::draw_timing_mark_debug_image_mut(
            canvas,
            geometry,
            &complete_timing_marks.clone().into(),
        );
    });

    Some(complete_timing_marks)
}

/// Infers missing timing marks along a segment. It's expected that there are
/// timing marks centered at the start and end of the segment and that the
/// distance between them is roughly `expected_distance`. There should be
/// exactly `expected_count` timing marks along the segment.
fn infer_missing_timing_marks_on_segment(
    timing_marks: &[Rect],
    segment: &Segment,
    expected_distance: f32,
    expected_count: u32,
    geometry: &Geometry,
) -> Vec<Rect> {
    if timing_marks.is_empty() {
        return vec![];
    }

    let mut inferred_timing_marks = vec![];
    let mut current_timing_mark_center = segment.start;
    let next_point_vector = segment.with_length(expected_distance).vector();
    let maximum_error = expected_distance / 2.0;
    while inferred_timing_marks.len() < expected_count as usize {
        // find the closest existing timing mark
        let closest_rect = timing_marks
            .iter()
            .min_by(|a, b| {
                let a_distance =
                    Segment::new(center_of_rect(a), current_timing_mark_center).length();
                let b_distance =
                    Segment::new(center_of_rect(b), current_timing_mark_center).length();
                a_distance
                    .partial_cmp(&b_distance)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map_or_else(
                || unreachable!("there will always be a closest timing mark"),
                |rect| rect,
            );

        // if the closest timing mark is close enough, use it
        if Segment::new(center_of_rect(closest_rect), current_timing_mark_center).length()
            <= maximum_error
        {
            inferred_timing_marks.push(*closest_rect);
            current_timing_mark_center = center_of_rect(closest_rect) + next_point_vector;
        } else {
            // otherwise, we need to fill in a point
            inferred_timing_marks.push(Rect::new(
                (current_timing_mark_center.x - geometry.timing_mark_size.width / 2.0).round()
                    as i32,
                (current_timing_mark_center.y - geometry.timing_mark_size.height / 2.0).round()
                    as i32,
                geometry.timing_mark_size.width.round() as u32,
                geometry.timing_mark_size.height.round() as u32,
            ));
            current_timing_mark_center += next_point_vector;
        }
    }
    inferred_timing_marks
}

/// Determines whether a rect could be a timing mark based on its size.
pub fn rect_could_be_timing_mark(geometry: &Geometry, rect: &Rect) -> bool {
    let min_timing_mark_width = (geometry.timing_mark_size.width * 1.0 / 4.0).floor() as u32;
    let max_timing_mark_width = (geometry.timing_mark_size.width * 3.0 / 2.0).ceil() as u32;
    let min_timing_mark_height = (geometry.timing_mark_size.height * 2.0 / 3.0).floor() as u32;
    let max_timing_mark_height = (geometry.timing_mark_size.height * 3.0 / 2.0).ceil() as u32;
    rect.width() >= min_timing_mark_width
        && rect.width() <= max_timing_mark_width
        && rect.height() >= min_timing_mark_height
        && rect.height() <= max_timing_mark_height
}

/// Gets all the distances between adjacent rects in a list of rects.
pub fn distances_between_rects(rects: &[Rect]) -> Vec<f32> {
    let mut distances = rects
        .windows(2)
        .map(|w| Segment::new(center_of_rect(&w[1]), center_of_rect(&w[0])).length())
        .collect::<Vec<f32>>();
    distances.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    distances
}

#[derive(Clone, Serialize)]
pub struct OvalMarkScore(pub f32);

impl Display for OvalMarkScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{:.2}%", self.0 * 100.0)
    }
}

impl core::fmt::Debug for OvalMarkScore {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(f, "{:.2}%", self.0 * 100.0)
    }
}

impl PartialEq for OvalMarkScore {
    fn eq(&self, other: &Self) -> bool {
        self.0.eq(&other.0)
    }
}

impl PartialOrd for OvalMarkScore {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoredOvalMark {
    /// The location of the oval mark in the grid. Uses side/column/row, not
    /// x/y.
    pub location: GridLocation,

    /// The score for the match between the source image and the template. This
    /// is the highest value found when looking around `expected_bounds` for the
    /// oval. 100% is a perfect match.
    pub match_score: OvalMarkScore,

    /// The score for the fill of the oval at `matched_bounds`. 100% is
    /// perfectly filled.
    pub fill_score: OvalMarkScore,

    /// The expected bounds of the oval mark in the scanned source image.
    pub expected_bounds: Rect,

    /// The bounds of the oval mark in the scanned source image that was
    /// determined to be the best match.
    pub matched_bounds: Rect,

    /// The cropped source image at `matched_bounds`.
    #[serde(skip_serializing)]
    pub source_image: GrayImage,

    /// The cropped source image at `matched_bounds` with each pixel binarized
    /// to either 0 (black) or 255 (white).
    #[serde(skip_serializing)]
    pub binarized_source_image: GrayImage,

    /// A binarized diff image of `binarized_source_image` with the template.
    /// The more white pixels, the better the match.
    #[serde(skip_serializing)]
    pub match_diff_image: GrayImage,

    /// A binarized diff image of `binarized_source_image` with the fill of the
    /// template. The more black pixels, the better the fill.
    #[serde(skip_serializing)]
    pub fill_diff_image: GrayImage,
}

impl std::fmt::Debug for ScoredOvalMark {
    fn fmt(&self, f: &mut Formatter) -> std::fmt::Result {
        write!(
            f,
            "ScoredOvalMark {{ location: {:?}, match_score: {}, fill_score: {}, matched_bounds: {:?} }}",
            self.location, self.match_score, self.fill_score, self.matched_bounds
        )
    }
}

pub const DEFAULT_MAXIMUM_SEARCH_DISTANCE: u32 = 7;

pub type ScoredOvalMarks = Vec<(GridPosition, Option<ScoredOvalMark>)>;

#[time]
pub fn score_oval_marks_from_grid_layout(
    img: &GrayImage,
    oval_template: &GrayImage,
    timing_mark_grid: &TimingMarkGrid,
    grid_layout: &GridLayout,
    side: BallotSide,
    debug: &ImageDebugWriter,
) -> ScoredOvalMarks {
    let threshold = otsu_level(img);

    let scored_ovals = &grid_layout
        .grid_positions
        .par_iter()
        .flat_map(|grid_position| {
            let location = grid_position.location();

            if location.side != side {
                return vec![];
            }

            timing_mark_grid
                .point_for_location(location.column, location.row)
                .map_or_else(
                    || vec![(grid_position.clone(), None)],
                    |expected_oval_center| {
                        vec![(
                            grid_position.clone(),
                            score_oval_mark(
                                img,
                                oval_template,
                                expected_oval_center,
                                &location,
                                DEFAULT_MAXIMUM_SEARCH_DISTANCE,
                                threshold,
                            ),
                        )]
                    },
                )
        })
        .collect::<ScoredOvalMarks>();

    debug.write("scored_oval_marks", |canvas| {
        debug::draw_scored_oval_marks_debug_image_mut(canvas, scored_ovals);
    });

    scored_ovals.clone()
}

/// Scores an oval mark within a scanned ballot image.
pub fn score_oval_mark(
    img: &GrayImage,
    oval_template: &GrayImage,
    expected_oval_center: Point<f32>,
    location: &GridLocation,
    maximum_search_distance: u32,
    threshold: u8,
) -> Option<ScoredOvalMark> {
    let center_x = expected_oval_center.x.round() as u32;
    let center_y = expected_oval_center.y.round() as u32;
    let left = center_x - oval_template.width() / 2;
    let top = center_y - oval_template.height() / 2;
    let width = oval_template.width();
    let height = oval_template.height();
    let expected_bounds = Rect::new(left as i32, top as i32, width, height);
    let mut best_match_score = OvalMarkScore(f32::NEG_INFINITY);
    let mut best_match_bounds: Option<Rect> = None;
    let mut best_match_diff: Option<GrayImage> = None;

    for offset_x in -(maximum_search_distance as i32)..(maximum_search_distance as i32) {
        let x = left as i32 + offset_x;
        if x < 0 {
            continue;
        }

        for offset_y in -(maximum_search_distance as i32)..(maximum_search_distance as i32) {
            let y = top as i32 + offset_y;
            if y < 0 {
                continue;
            }

            let cropped = img.view(x as u32, y as u32, width, height).to_image();
            let cropped_and_thresholded = imageproc::contrast::threshold(&cropped, threshold);

            let match_diff = diff(&cropped_and_thresholded, oval_template);
            let match_score = OvalMarkScore(ratio(&match_diff, WHITE));

            if match_score > best_match_score {
                best_match_score = match_score;
                best_match_bounds = Some(Rect::new(x, y, width, oval_template.height()));
                best_match_diff = Some(match_diff);
            }
        }
    }

    let best_match_bounds = best_match_bounds?;
    let best_match_diff = best_match_diff?;

    let source_image = img
        .view(
            best_match_bounds.left() as u32,
            best_match_bounds.top() as u32,
            best_match_bounds.width(),
            best_match_bounds.height(),
        )
        .to_image();
    let binarized_source_image = imageproc::contrast::threshold(&source_image, threshold);
    let diff_image = diff(oval_template, &binarized_source_image);
    let fill_score = OvalMarkScore(ratio(&diff_image, BLACK));

    Some(ScoredOvalMark {
        location: *location,
        match_score: best_match_score,
        fill_score,
        expected_bounds,
        matched_bounds: best_match_bounds,
        source_image,
        binarized_source_image,
        match_diff_image: best_match_diff,
        fill_diff_image: diff_image,
    })
}
