use crate::{
    ballot_card::{BallotImage, Geometry},
    interpret::Error,
    timing_marks::{
        corners::{mark_finding::BallotGridCandidateMarks, util::CornerWise},
        DefaultForGeometry, TimingMarks,
    },
};

mod border_finding;
mod corner_finding;
mod mark_finding;
mod shape_finding;
mod util;

pub struct Options {
    shape_finding_options: shape_finding::Options,
    corner_finding_options: corner_finding::Options,
    border_finding_options: border_finding::Options,
}

impl DefaultForGeometry for Options {
    fn default_for_geometry(geometry: &Geometry) -> Self {
        Self {
            shape_finding_options: shape_finding::Options::default_for_geometry(geometry),
            corner_finding_options: corner_finding::Options::default_for_geometry(geometry),
            border_finding_options: border_finding::Options::default_for_geometry(geometry),
        }
    }
}

/// Find the timing mark grid in a ballot image.
///
/// # Errors
///
/// Returns an error if the timing mark grid cannot be found.
#[allow(clippy::result_large_err)]
pub fn find_timing_mark_grid(
    ballot_image: &BallotImage,
    options: &Options,
) -> Result<TimingMarks, Error> {
    let shapes = shape_finding::BallotGridBorderShapes::from_ballot_image(
        ballot_image,
        ballot_image.geometry(),
        &options.shape_finding_options,
    );

    ballot_image.debug().write("01-shapes", |canvas| {
        shapes.debug_draw(canvas);
    });

    let candidates = mark_finding::BallotGridCandidateMarks::from_shapes(ballot_image, shapes);

    ballot_image.debug().write("02-candidate_marks", |canvas| {
        candidates.debug_draw(canvas);
    });

    let corners = corner_finding::BallotGridCorners::find_all(
        ballot_image.dimensions().into(),
        ballot_image.geometry(),
        &candidates,
        &options.corner_finding_options,
    )?;

    ballot_image.debug().write("03-corners", |canvas| {
        corners.debug_draw(canvas);
    });

    let borders = border_finding::BallotGridBorders::find_all(
        ballot_image.geometry(),
        &corners,
        &candidates,
        &options.border_finding_options,
    )?;

    ballot_image.debug().write("04-borders", |canvas| {
        borders.debug_draw(canvas);
    });

    let [top_left_mark, top_right_mark, bottom_left_mark, bottom_right_mark] = [
        corners.top_left(),
        corners.top_right(),
        corners.bottom_left(),
        corners.bottom_right(),
    ]
    .map_cornerwise(|corner| corner.best_corner_grouping().corner_mark());

    let [top_left_corner, top_right_corner, bottom_left_corner, bottom_right_corner] = [
        top_left_mark,
        top_right_mark,
        bottom_left_mark,
        bottom_right_mark,
    ]
    .map_cornerwise(|mark| mark.rect().center());

    let timing_marks = TimingMarks {
        geometry: ballot_image.geometry().clone(),
        top_left_corner,
        top_right_corner,
        bottom_left_corner,
        bottom_right_corner,
        top_marks: borders.top.into_marks(),
        bottom_marks: borders.bottom.into_marks(),
        left_marks: borders.left.into_marks(),
        right_marks: borders.right.into_marks(),
        top_left_mark: *top_left_mark,
        top_right_mark: *top_right_mark,
        bottom_left_mark: *bottom_left_mark,
        bottom_right_mark: *bottom_right_mark,
    };

    Ok(timing_marks)
}
