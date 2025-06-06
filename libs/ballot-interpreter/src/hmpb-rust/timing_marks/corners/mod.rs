use std::path::PathBuf;

use crate::{
    ballot_card::{BallotImage, Geometry},
    debug::ImageDebugWriter,
    image_utils::Inset,
    interpret::Error,
    timing_marks::{
        corners::{
            border_finding::BallotGridBorders, corner_finding::BallotGridCorners,
            mark_finding::BallotGridCandidateMarks, shape_finding::BallotGridBorderShapes,
            util::CornerWise,
        },
        Complete, TimingMarkGrid,
    },
};
use clap::Parser;

mod border_finding;
mod corner_finding;
mod mark_finding;
mod shape_finding;
mod util;

#[derive(Debug, Parser)]
struct Options {
    image_paths: Vec<PathBuf>,
}

/// Find the timing mark grid in a ballot image.
///
/// # Errors
///
/// Returns an error if the timing mark grid cannot be found.
#[allow(clippy::result_large_err)]
pub fn find_timing_mark_grid(
    ballot_image: &BallotImage,
    geometry: &Geometry,
    debug: &ImageDebugWriter,
) -> Result<TimingMarkGrid, Error> {
    let search_inset = Inset {
        left: geometry.pixels_per_inch,
        right: geometry.pixels_per_inch,
        top: geometry.pixels_per_inch,
        bottom: geometry.pixels_per_inch,
    };

    let shapes = BallotGridBorderShapes::from_ballot_image(ballot_image, geometry, search_inset);

    debug.write("01-shapes", |canvas| {
        shapes.debug_draw(canvas);
    });

    let candidates = BallotGridCandidateMarks::from_shapes(ballot_image, geometry, shapes);

    debug.write("02-candidate_marks", |canvas| {
        candidates.debug_draw(canvas);
    });

    let corners = BallotGridCorners::find_all(
        ballot_image.image.dimensions().into(),
        geometry,
        &candidates,
    )?;

    debug.write("03-corners", |canvas| {
        corners.debug_draw(canvas);
    });

    let borders = BallotGridBorders::find_all(geometry, &corners, &candidates)?;

    debug.write("04-borders", |canvas| {
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

    let complete_timing_marks = Complete {
        geometry: geometry.clone(),
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

    Ok(TimingMarkGrid {
        geometry: geometry.clone(),
        complete_timing_marks,
    })
}
