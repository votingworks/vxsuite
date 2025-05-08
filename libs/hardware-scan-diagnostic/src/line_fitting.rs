use std::fmt::Debug;

use types_rs::geometry::{IntersectionBounds, Point, Segment};

/// A best fit line as computed from a shape within an image.
#[derive(Debug, Clone, Copy)]
pub enum BestFitLine {
    /// Either a top or bottom best fit line.
    Horizontal(LineFit),

    /// Either a left or right best fit line.
    Vertical(LineFit),
}

/// Information about the line fit for a best fit line.
#[derive(Clone, Copy)]
pub struct LineFit {
    /// The slope of the line as differs from a straight line with the
    /// orientation of the containing `BestFitLine`.
    slope: f64,

    /// The y-intercept for a horizontal line or the x-intercept for a vertical
    /// line.
    intercept: f64,

    /// The average distance each pixel along this edge is from its
    /// corresponding pixel along the line.
    error_average: f64,
}

impl LineFit {
    pub const fn new(slope: f64, intercept: f64, error_average: f64) -> Self {
        LineFit {
            slope,
            intercept,
            error_average,
        }
    }
}

impl Debug for LineFit {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("LineFit")
            .field(
                "slope",
                &format_args!("{:.2}°", self.slope.atan().to_degrees()),
            )
            .field("intercept", &format_args!("{:.2}", self.intercept))
            .field("error_average", &format_args!("{:.2}", self.error_average))
            .finish()
    }
}

impl BestFitLine {
    /// The slope of the line as differs from a straight line with the
    /// orientation of this `BestFitLine`.
    pub fn slope(&self) -> f64 {
        self.line_fit().slope
    }

    /// The y-intercept for a horizontal line or the x-intercept for a vertical
    /// line.
    pub fn intercept(&self) -> f64 {
        self.line_fit().intercept
    }

    /// The average distance each pixel along this edge is from its
    /// corresponding pixel along the line.
    pub fn error_average(&self) -> f64 {
        self.line_fit().error_average
    }

    fn line_fit(&self) -> LineFit {
        match self {
            Self::Horizontal(line_fit) | Self::Vertical(line_fit) => *line_fit,
        }
    }

    /// Computes the best fit line from a series of points expected to
    /// approximate a horizontal line.
    pub fn from_horizontal_points(points: &[(f64, f64)]) -> Option<Self> {
        if points.is_empty() {
            return None;
        }

        let n = points.len() as f64;

        // Calculate the sums needed for the least squares formula
        let mut sum_x = 0.0;
        let mut sum_y = 0.0;
        let mut sum_xy = 0.0;
        let mut sum_xx = 0.0;

        for &(x, y) in points {
            sum_x += x;
            sum_y += y;
            sum_xy += x * y;
            sum_xx += x * x;
        }

        // Calculate the slope (m)
        let slope = if (n * sum_xx - sum_x * sum_x).abs() < f64::EPSILON {
            0.0 // Handle vertical line case (or nearly vertical)
        } else {
            (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x)
        };

        // Calculate the y-intercept (b)
        let intercept = (sum_y - slope * sum_x) / n;

        let error_sum: f64 = points
            .iter()
            .map(|&(x, y)| (slope * x + intercept - y).abs())
            .sum();

        Some(BestFitLine::Horizontal(LineFit {
            slope,
            intercept,
            error_average: error_sum / (points.len() as f64),
        }))
    }

    /// Computes the best fit line from a series of points expected to
    /// approximate a vertical line.
    pub fn from_vertical_points(points: &[(f64, f64)]) -> Option<Self> {
        let inverted_points = points.iter().map(|&(x, y)| (y, x)).collect::<Vec<_>>();
        Self::from_horizontal_points(&inverted_points)
            .map(|inverted_fit_line| BestFitLine::Vertical(inverted_fit_line.line_fit()))
    }

    /// Computes the point along the best fit line for the given primary axis
    /// value, i.e. `x` for horizontal lines and `y` for vertical lines.
    pub fn point_at(&self, primary_axis_value: f32) -> (f32, f32) {
        let dependent_axis_value =
            self.slope() as f32 * primary_axis_value + self.intercept() as f32;
        match self {
            BestFitLine::Horizontal(_) => (primary_axis_value, dependent_axis_value),
            BestFitLine::Vertical(_) => (dependent_axis_value, primary_axis_value),
        }
    }

    /// Determines the intersection point between this line and another line. If
    /// no intersection exists (i.e. the lines are paralell), returns `None`.
    pub fn intersection_with(&self, other: &Self) -> Option<(f32, f32)> {
        let my_segment_start = self.point_at(0.0);
        let my_segment_end = self.point_at(10.0);
        let other_segment_start = other.point_at(0.0);
        let other_segment_end = other.point_at(10.0);
        let my_segment = Segment::new(
            Point::new(my_segment_start.0, my_segment_start.1),
            Point::new(my_segment_end.0, my_segment_end.1),
        );
        let other_segment = Segment::new(
            Point::new(other_segment_start.0, other_segment_start.1),
            Point::new(other_segment_end.0, other_segment_end.1),
        );
        my_segment
            .intersection_point(&other_segment, IntersectionBounds::Unbounded)
            .map(|point| (point.x, point.y))
    }
}
