use itertools::Itertools;
use serde::Serialize;
use types_rs::election::{ContestId, GridLayout, GridLocation, GridPosition, OptionId};
use types_rs::geometry::{GridUnit, Point, Rect, SubGridUnit};

use crate::debug::{self, ImageDebugWriter};
use crate::{ballot_card::BallotSide, timing_marks::TimingMarkGrid};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedContestOptionLayout {
    pub option_id: OptionId,
    pub bounds: Rect,
    pub grid_location: GridLocation,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterpretedContestLayout {
    pub contest_id: ContestId,
    pub bounds: Rect,
    pub options: Vec<InterpretedContestOptionLayout>,
}

fn build_option_layout(
    grid: &TimingMarkGrid,
    grid_layout: &GridLayout,
    grid_position: &GridPosition,
) -> Option<InterpretedContestOptionLayout> {
    // Option bounding box parameters
    let column_offset = -grid_layout.option_bounds_from_target_mark.left;
    let row_offset = -grid_layout.option_bounds_from_target_mark.top;
    let width: GridUnit = grid_layout.option_bounds_from_target_mark.left
        + grid_layout.option_bounds_from_target_mark.right;
    let height: GridUnit = grid_layout.option_bounds_from_target_mark.top
        + grid_layout.option_bounds_from_target_mark.bottom;

    let clamp_row =
        |row: GridUnit| -> GridUnit { row.clamp(0, grid.geometry.grid_size.height - 1) };
    let clamp_column =
        |column: GridUnit| -> GridUnit { column.clamp(0, grid.geometry.grid_size.width - 1) };

    let bubble_location = grid_position.location();

    let top_left_location: Point<GridUnit> = Point::new(
        clamp_column(bubble_location.column + column_offset),
        clamp_row(bubble_location.row + row_offset),
    );
    let bottom_left_location: Point<GridUnit> = Point::new(
        clamp_column(bubble_location.column + column_offset),
        clamp_row(bubble_location.row + row_offset + height),
    );
    let top_right_location: Point<GridUnit> = Point::new(
        clamp_column(bubble_location.column + column_offset + width),
        clamp_row(bubble_location.row + row_offset),
    );
    let bottom_right_location: Point<GridUnit> = Point::new(
        clamp_column(bubble_location.column + column_offset + width),
        clamp_row(bubble_location.row + row_offset + height),
    );

    let top_left_point = grid.point_for_location(
        top_left_location.x as SubGridUnit,
        top_left_location.y as SubGridUnit,
    )?;
    let bottom_left_point = grid.point_for_location(
        bottom_left_location.x as SubGridUnit,
        bottom_left_location.y as SubGridUnit,
    )?;
    let top_right_point = grid.point_for_location(
        top_right_location.x as SubGridUnit,
        top_right_location.y as SubGridUnit,
    )?;
    let bottom_right_point = grid.point_for_location(
        bottom_right_location.x as SubGridUnit,
        bottom_right_location.y as SubGridUnit,
    )?;

    // We use the furthest points to determine the bounding box so we enclose
    // content that may have moved further away when skewed.
    let furthest_left = top_left_point.x.min(bottom_left_point.x);
    let furthest_right = top_right_point.x.max(bottom_right_point.x);
    let furthest_top = top_left_point.y.min(top_right_point.y);
    let furthest_bottom = bottom_left_point.y.max(bottom_right_point.y);

    let furthest_top_left_point = Point::new(furthest_left, furthest_top).round();
    let furthest_bottom_right_point = Point::new(furthest_right, furthest_bottom).round();

    Some(InterpretedContestOptionLayout {
        option_id: grid_position.option_id(),
        bounds: Rect::from_points(furthest_top_left_point, furthest_bottom_right_point),
        grid_location: bubble_location,
    })
}

pub fn build_interpreted_page_layout(
    grid: &TimingMarkGrid,
    grid_layout: &GridLayout,
    sheet_number: u32,
    side: BallotSide,
    debug: &ImageDebugWriter,
) -> Option<Vec<InterpretedContestLayout>> {
    let contest_ids_in_grid_layout_order = grid_layout
        .grid_positions
        .iter()
        .filter(|grid_position| {
            grid_position.sheet_number() == sheet_number && grid_position.location().side == side
        })
        .map(GridPosition::contest_id)
        .unique()
        .collect::<Vec<_>>();

    let layouts = contest_ids_in_grid_layout_order
        .iter()
        .map(|contest_id| {
            let grid_positions = grid_layout
                .grid_positions
                .iter()
                .filter(|grid_position| grid_position.contest_id() == *contest_id)
                .collect::<Vec<_>>();

            let options = grid_positions
                .iter()
                .map(|grid_position| build_option_layout(grid, grid_layout, grid_position))
                .collect::<Option<Vec<_>>>()?;

            // Use the union of the option bounds as an approximation of the contest bounds
            let bounds = options
                .iter()
                .map(|option| option.bounds)
                .reduce(|a, b| a.union(&b))
                .expect("Contest must have options");

            Some(InterpretedContestLayout {
                contest_id: contest_id.clone(),
                bounds,
                options,
            })
        })
        .collect::<Option<Vec<_>>>()?;

    debug.write("contest_layouts", |canvas| {
        debug::draw_contest_layouts_debug_image_mut(canvas, &layouts);
    });

    Some(layouts)
}
