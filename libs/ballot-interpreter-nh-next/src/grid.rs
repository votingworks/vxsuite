use crate::{
    ballot_card::BallotSide,
    election::{BallotStyleId, ContestId, GridLayout, GridPosition, OptionId, PrecinctId},
    metadata::BallotPageMetadata,
    timing_marks::TimingMarkGrid,
};

/// Generates a grid layout for all grid positions in the given grid. This is
/// useful for anything that needs to iterate over all grid positions, such as
/// generating an "all bubbles" ballot or locating the existing bubbles on a
/// ballot.
pub fn generate_layout_for_all_grid_positions(grid: &TimingMarkGrid) -> GridLayout {
    let mut grid_positions = vec![];

    let side = match grid.metadata {
        BallotPageMetadata::Front(_) => BallotSide::Front,
        BallotPageMetadata::Back(_) => BallotSide::Back,
    };

    for row in 0..grid.geometry.grid_size.height {
        for column in 0..grid.geometry.grid_size.width {
            grid_positions.push(GridPosition::Option {
                side,
                column,
                row,
                contest_id: ContestId::from("all"),
                option_id: OptionId::from(format!("all-{}-{}", column, row)),
            });
        }
    }

    GridLayout {
        ballot_style_id: BallotStyleId::from("all"),
        precinct_id: PrecinctId::from("all"),
        columns: grid.geometry.grid_size.width,
        rows: grid.geometry.grid_size.height,
        option_bounds_from_target_mark: Default::default(),
        grid_positions,
    }
}
