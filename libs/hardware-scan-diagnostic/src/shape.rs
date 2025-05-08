use std::fmt::Debug;

use crate::line_fitting::BestFitLine;
use image::GrayImage;
use types_rs::geometry;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("No edge points found in the provided image")]
    NoEdgePointsFound,

    #[error("Unable to compute the best fit lines from the provided image")]
    ComputeBestFitLinesFailure,

    #[error("Unable to locate page corners in the provided image")]
    LocatePageCornersFailure,
}

pub type Result<T, E = Error> = std::result::Result<T, E>;

/// Analyze the given scanned page to find details of the page shape within the
/// image. This includes trying to locate the four edges, the four corners, and
/// deriving relevant information about them such as their slope and
/// straightness.
pub fn analyze_page(image: &GrayImage) -> Result<PageShapeAnalysis> {
    let edges = imageproc::edges::canny(image, 50.0, 150.0);

    let mut points: Vec<(f64, f64)> = Vec::new();
    for (x, y, pixel) in edges.enumerate_pixels() {
        if pixel[0] > 0 {
            points.push((x as f64, y as f64));
        }
    }

    if points.is_empty() {
        return Err(Error::NoEdgePointsFound);
    }

    // Compute bounding box
    let (min_x, max_x) = points
        .iter()
        .map(|p| p.0)
        .fold((f64::MAX, f64::MIN), |(min, max), x| {
            (min.min(x), max.max(x))
        });
    let (min_y, max_y) = points
        .iter()
        .map(|p| p.1)
        .fold((f64::MAX, f64::MIN), |(min, max), y| {
            (min.min(y), max.max(y))
        });

    let mut top_points = vec![];
    let mut bottom_points = vec![];
    let mut right_points = vec![];
    let mut left_points = vec![];

    for &(x, y) in &points {
        let dist_top = y - min_y;
        let dist_bottom = max_y - y;
        let dist_left = x - min_x;
        let dist_right = max_x - x;

        let min_dist = dist_top.min(dist_right.min(dist_bottom.min(dist_left)));

        if min_dist == dist_top {
            top_points.push((x, y));
        } else if min_dist == dist_right {
            right_points.push((x, y));
        } else if min_dist == dist_bottom {
            bottom_points.push((x, y));
        } else {
            left_points.push((x, y));
        }
    }

    let (Some(top_line), Some(bottom_line), Some(left_line), Some(right_line)) = (
        BestFitLine::from_horizontal_points(&top_points),
        BestFitLine::from_horizontal_points(&bottom_points),
        BestFitLine::from_vertical_points(&left_points),
        BestFitLine::from_vertical_points(&right_points),
    ) else {
        return Err(Error::ComputeBestFitLinesFailure);
    };

    let (
        Some(top_left_corner),
        Some(top_right_corner),
        Some(bottom_left_corner),
        Some(bottom_right_corner),
    ) = (
        top_line.intersection_with(&left_line),
        top_line.intersection_with(&right_line),
        bottom_line.intersection_with(&left_line),
        bottom_line.intersection_with(&right_line),
    )
    else {
        return Err(Error::LocatePageCornersFailure);
    };

    let top_line_length = geometry::Point::new(top_left_corner.0, top_left_corner.1).distance_to(
        &geometry::Point::new(top_right_corner.0, top_right_corner.1),
    ) as f64;
    let bottom_line_length =
        geometry::Point::new(bottom_left_corner.0, bottom_left_corner.1).distance_to(
            &geometry::Point::new(bottom_right_corner.0, bottom_right_corner.1),
        ) as f64;
    let left_line_length = geometry::Point::new(top_left_corner.0, top_left_corner.1).distance_to(
        &geometry::Point::new(bottom_left_corner.0, bottom_left_corner.1),
    ) as f64;
    let right_line_length =
        geometry::Point::new(top_right_corner.0, top_right_corner.1).distance_to(
            &geometry::Point::new(bottom_right_corner.0, bottom_right_corner.1),
        ) as f64;
    let average_line_error = (top_line.error_average() * top_line_length
        + bottom_line.error_average() * bottom_line_length
        + left_line.error_average() * left_line_length
        + right_line.error_average() * right_line_length)
        / (top_line_length + bottom_line_length + left_line_length + right_line_length);

    Ok(PageShapeAnalysis {
        top_line,
        bottom_line,
        left_line,
        right_line,
        top_left_corner: top_left_corner.into(),
        top_right_corner: top_right_corner.into(),
        bottom_left_corner: bottom_left_corner.into(),
        bottom_right_corner: bottom_right_corner.into(),
        average_line_error,
        horizontal_lines_alignment_diff: (top_line.slope() - bottom_line.slope()).abs(),
        vertical_lines_alignment_diff: (left_line.slope() - right_line.slope()).abs(),
    })
}

/// Results for skew/stretch/rotation analysis of scanned pages.
#[derive(Debug)]
pub struct PageShapeAnalysis {
    /// The best fit line for points along the top edge of the page shape.
    pub top_line: BestFitLine,

    /// The best fit line for points along the bottom edge of the page shape.
    pub bottom_line: BestFitLine,

    /// The best fit line for points along the left edge of the page shape.
    pub left_line: BestFitLine,

    /// The best fit line for points along the right edge of the page shape.
    pub right_line: BestFitLine,

    /// Intersection point of the top and left best fit lines.
    pub top_left_corner: Point,

    /// Intersection point of the top and right best fit lines.
    pub top_right_corner: Point,

    /// Intersection point of the bottom and left best fit lines.
    pub bottom_left_corner: Point,

    /// Intersection point of the bottom and right best fit lines.
    pub bottom_right_corner: Point,

    /// Average error of the four best fit lines, weighted by the
    /// corner-to-corner distance of each line.
    pub average_line_error: f64,

    /// Absolute angle delta of the horizontal lines (top & bottom) in radians.
    pub horizontal_lines_alignment_diff: f64,

    /// Absolute angle delta of the vertical lines (left & right) in radians.
    pub vertical_lines_alignment_diff: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

impl From<(f32, f32)> for Point {
    fn from(value: (f32, f32)) -> Self {
        Point {
            x: value.0 as i32,
            y: value.1 as i32,
        }
    }
}

impl From<Point> for (i32, i32) {
    fn from(value: Point) -> Self {
        (value.x, value.y)
    }
}
