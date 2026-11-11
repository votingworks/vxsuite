//! Port of `layOutInColumns` from libs/hmpb/src/layout_in_columns.ts.

fn column_height(col: &[usize], heights: &[f32], gap: f32) -> f32 {
    col.iter().map(|&i| heights[i]).sum::<f32>() + gap * col.len().saturating_sub(1) as f32
}

pub struct ColumnLayout {
    pub columns: Vec<Vec<usize>>,
    pub height: f32,
    pub num_placed: usize,
}

pub fn lay_out_in_columns(
    heights: &[f32],
    num_columns: usize,
    max_h: f32,
    gap: f32,
) -> ColumnLayout {
    let overflowing = |col: &[usize]| column_height(col, heights, gap) > max_h;
    let tallest = |cols: &[Vec<usize>]| {
        cols.iter()
            .map(|c| column_height(c, heights, gap))
            .fold(f32::NEG_INFINITY, f32::max)
    };

    let mut greedy: Vec<Vec<usize>> = vec![vec![]; num_columns];
    let (mut ci, mut ei) = (0, 0);
    while ei < heights.len() && ci < num_columns {
        let mut candidate = greedy[ci].clone();
        candidate.push(ei);
        if overflowing(&candidate) {
            ci += 1;
        } else {
            greedy[ci].push(ei);
            ei += 1;
        }
    }
    if ei < heights.len() {
        let height = tallest(&greedy);
        return ColumnLayout {
            columns: greedy,
            height,
            num_placed: ei,
        };
    }

    let n = heights.len();
    let mut best: Option<(Vec<Vec<usize>>, (f32, f32, i64))> = None;
    let mut cols: Vec<Vec<usize>> = vec![vec![]; num_columns];
    fn search(
        next: usize,
        n: usize,
        cols: &mut Vec<Vec<usize>>,
        overflowing: &dyn Fn(&[usize]) -> bool,
        score: &dyn Fn(&[Vec<usize>]) -> (f32, f32, i64),
        best: &mut Option<(Vec<Vec<usize>>, (f32, f32, i64))>,
    ) {
        if next == n {
            let s = score(cols);
            let better = match best {
                None => true,
                Some((_, b)) => {
                    s.0 < b.0 || (s.0 == b.0 && (s.1 < b.1 || (s.1 == b.1 && s.2 < b.2)))
                }
            };
            if better {
                *best = Some((cols.clone(), s));
            }
            return;
        }
        if let Some(last) = cols.iter().rposition(|c| !c.is_empty()) {
            cols[last].push(next);
            if !overflowing(&cols[last]) {
                search(next + 1, n, cols, overflowing, score, best);
            }
            cols[last].pop();
        }
        if let Some(first_empty) = cols.iter().position(|c| c.is_empty()) {
            cols[first_empty].push(next);
            if !overflowing(&cols[first_empty]) {
                search(next + 1, n, cols, overflowing, score, best);
            }
            cols[first_empty].pop();
        }
    }
    let score = |cs: &[Vec<usize>]| {
        let hs: Vec<f32> = cs.iter().map(|c| column_height(c, heights, gap)).collect();
        let max = hs.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let min = hs.iter().cloned().fold(f32::INFINITY, f32::min);
        let gap_idx = cs
            .iter()
            .position(|c| c.is_empty())
            .map_or(-1, |i| i as i64);
        (max, max - min, gap_idx)
    };
    search(0, n, &mut cols, &overflowing, &score, &mut best);
    let (columns, (height, _, _)) = best.unwrap();
    ColumnLayout {
        columns,
        height,
        num_placed: n,
    }
}
