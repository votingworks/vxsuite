# @votingworks/ballot-interpreter

Library to interpret BMD ballots produced by VxMark/VxMarkScan or hand-marked
paper ballots (HMPB) produced by VxDesign.

## Install

This library requires a
[supported version of Node and Rust](https://github.com/neon-bindings/neon#platform-support).
The easiest way to install Rust is via [rustup](https://rustup.rs/).

## Build

This will build both the Rust library and the Node package.

```sh
$ pnpm build
```

This command uses the
[cargo-cp-artifact](https://github.com/neon-bindings/cargo-cp-artifact) utility
to run the Rust build and copy the built library into `./build/addon.node`.

## CLI

### bin/interpret

Currently, the CLI only works for HMPB.

```sh
# Interpret a single ballot
bin/interpret election.json system-settings.json ballot-side-a.jpeg ballot-side-b.jpeg

# Interpret all ballots in a scan workspace
bin/interpret path/to/workspace

# Interpret specific sheets in a scan workspace
bin/interpret path/to/workspace d34d-b33f

# Write debug images alongside input images
# (i.e. ballot-side-a_debug_scored_bubble_marks.png)
bin/interpret -d election.json system-settings.json ballot-side-a.jpeg ballot-side-b.jpeg
```

### bin/scoring-report

To generate a scoring report for a collection of ballot images, run:

```sh
# Score bubble marks
bin/scoring-report -m election.json ballot-images-dir output-dir

# Score write-ins
bin/scoring-report -w election.json ballot-images-dir output-dir
```

This can be used to iteratively tune the mark thresholds/write-in area
parameters for an election.

## Benchmarks

This library includes benchmarks designed to:

- Help understand how the interpreter performs in different environments (i.e.
  different hardware/software stacks)
- Prevent performance regressions

To run benchmarks for interpretation, run:

```sh
pnpm benchmark
```

This will run a series of benchmark tests, which will interpret a ballot many
times and compute some statistics about the time it takes. The results will be
compared to saved results from a previous run, and, if they differ by too large
an amount, show a test failure message.

### Benchmark Environments

By default, the benchmarks will use saved results from a development
environment. If you'd like to run the benchmarks in a different environment, you
can set the `BENCHMARK_ENV` environment variable to a name of your choosing. For
example:

```sh
BENCHMARK_ENV=production-minipc pnpm benchmark
```

### Updating Saved Results

To update the saved results for a benchmark, run:

```sh
UPDATE_BENCHMARKS=1 pnpm benchmark
```

## Interpretation Overview

The interpretation process is broken down into several steps:

1. **Find Timing Marks**: ballot images are scanned for timing marks, which are
   used to determine the orientation and layout of the ballot.
2. **Decode Metadata**: either the bottom row of timing marks or a QR code is
   used to decode metadata about the ballot, such as the ballot style and
   precinct.
3. **Score Bubble Marks**: bubble marks are scored to determine which bubbles
   are filled in. Bubble locations are identified by row and column coordinates
   where the top left timing mark at the corner of the ballot is (0, 0).
4. **Score Write-Ins**: an optional step where the write-in areas are scored to
   determine whether any have handwriting. This is to facilitate detection of
   write-ins where the corresponding bubble is not filled in. Write-in areas are
   identified by a rectangle specified using the same grid as bubble marks.

### Find Timing Marks

Timing marks are used to determine the orientation and layout of the ballot.
They follow the same format as the timing marks used in the AccuVote system. The
timing marks are a series of black rectangles around the border of a ballot.
Together they form a grid that can be used to determine the position of bubbles
and write-in areas, with the origin (0, 0) at the top left corner of the ballot.
Because no bubbles may appear in the timing mark area, bubble coordinates
effectively begin at (1, 1).

The implementation uses a "corners" algorithm
([timing_marks/corners/](src/bubble-ballot-rust/timing_marks/corners/)) that
starts by identifying the four corners of the ballot grid and then walks along
each border to find all timing marks.

#### Timing Mark Detection Algorithm

The timing mark detection process consists of three main steps:

1. **Shape Finding** ([timing_marks/corners/shape_finding/mod.rs](src/bubble-ballot-rust/timing_marks/corners/shape_finding/mod.rs)):
   The algorithm scans the ballot image column by column within an inset region
   from each edge. For each column, it groups contiguous black pixels vertically
   and filters groups by height to match expected timing mark dimensions.
   Adjacent columns with similar vertical ranges are merged into shapes. These
   shapes are then smoothed using a median filter to eliminate bumps from stray
   marks or debris. Finally, shapes are filtered to ensure they match expected
   timing mark size and aspect ratio.

2. **Corner Finding** ([timing_marks/corners/corner_finding.rs](src/bubble-ballot-rust/timing_marks/corners/corner_finding.rs)):
   For each of the four corners (top-left, top-right, bottom-left, bottom-right),
   the algorithm identifies candidate corner groupings. Each grouping consists of
   three timing marks: the corner mark itself, plus one mark along the adjacent
   row and one along the adjacent column. Candidates are sorted by distance from
   the expected corner location. The algorithm selects the first grouping where
   all three marks meet minimum quality thresholds. If no such grouping is found,
   an error is returned.

3. **Border Finding** ([timing_marks/corners/border_finding.rs](src/bubble-ballot-rust/timing_marks/corners/border_finding.rs)):
   After corners are identified, the algorithm finds timing marks along each
   border by "walking" from one corner to the other. Starting at a corner mark,
   it computes a unit vector pointing toward the opposite corner with length
   equal to the expected timing mark spacing. At each step, it searches for the
   closest candidate mark within a tolerance of the expected spacing. If no mark
   is found within this tolerance, an error is returned. This continues until the
   ending corner is reached. Finally, the algorithm validates that each border
   contains exactly the expected number of timing marks (matching the grid
   dimensions from the election definition). If any border has an incorrect
   count, an error is returned. This strict validation ensures the grid is
   complete and accurate before proceeding to bubble scoring.

#### Error Handling

The timing mark detection algorithm errs on the side of caution, preferring to
reject ballots that might be interpreted incorrectly rather than risk
misinterpreting votes. Key aspects of error handling include:

1. **No Inference of Missing Marks**: A previous version of this algorithm
   inferred missing timing marks based on spacing between detected marks, but the
   current implementation requires all marks to be physically present and
   detected. This change reduces the risk of misinterpretation. Missing marks
   cause interpretation to fail.

2. **Strict Count Validation**: Each border must contain exactly the number of
   marks specified in the ballot's grid dimensions. There is no tolerance for
   missing or extra marks.

3. **Minimum Mark Quality**: Corner timing marks must meet minimum quality
   thresholds to be accepted. This ensures that only high-quality, unambiguous
   marks are used as reference points for the grid.

4. **Controlled Search Areas**: Shape finding is limited to an inset region from
   each edge, and border finding restricts the search for each mark to within a
   tolerance of the expected spacing. This prevents the algorithm from
   incorrectly identifying marks that are too far from their expected positions.

### Decode Metadata

The metadata can be encoded either using a QR code in the bottom-left corner or
by using the presence/absence of timing marks in the bottom row. The metadata
includes the ballot style, precinct, and other information that may be useful
for interpreting the ballot. When using timing mark based encoding, we use the
same encoding as the AccuVote system. There is an additional check to ensure
that we found the timing marks correctly where we check that the areas we
believe the timing marks to be are sufficiently dark. This mitigates potential
issues with the timing mark detection algorithm due to smudges, stray marks,
etc.

### Score Bubble Marks

Bubble marks are scored to determine which bubbles are filled in. The scoring
process ([scoring.rs](src/bubble-ballot-rust/scoring.rs)) consists of searching
for the best template match starting at the expected location, then computing a
score for how filled in the bubble is.

#### Bubble Locating

To compute expected bubble location within the image at grid coordinates
`(column, row)`:

1. Find the `row`th timing mark on the left and right sides of the ballot. If
   `row` is fractional, interpolate vertically between the closest two rows.
2. Account for timing marks being cropped during scanning or border removal by
   adjusting the timing mark positions to use the expected width.
3. Compute a line segment between the centers of the left and right timing marks.
4. The expected bubble center is at position `column / (N - 1)` along this
   segment, where `N` is the total number of columns in the grid.

#### Template Matching

To account for stretching and other distortions in the scanned image, the
algorithm performs template matching against
[a typical scanned bubble](data/bubble_scan.png) within a search area:

1. **Search Area**: Starting from the expected bubble center, the algorithm
   searches within a small radius in all directions.

2. **Match Score Computation**: For each position in the search area:
   - Crop the scanned image to the bubble template size
   - Apply binary thresholding using the ballot's global threshold
   - Compute a difference image between the thresholded crop and the template
   - The match score is the percentage of pixels that are white (matching) in
     the difference image

3. **Best Match Selection**: The algorithm selects the position with the highest
   match score as the actual bubble location.

#### Fill Scoring

Once the best matching position is found, the algorithm computes how filled the
bubble is:

1. Crop the scanned image at the best matching bounds
2. Apply binary thresholding using the ballot's global threshold
3. Compute a difference image between the template (unfilled bubble) and the
   thresholded source image
4. The fill score is the percentage of pixels that are black (filled) in the
   difference image, representing new dark pixels compared to the template

The fill score represents what percentage of the bubble has been filled in
beyond what the template shows. A higher fill score indicates a more completely
filled bubble. The score is later compared to a threshold to determine if the
bubble should be counted as marked, but the scoring function itself simply
computes the score and lets the caller decide how to interpret it.

### Score Write-Ins

Write-ins are scored to determine whether any have handwriting. The write-in
area is encoded in the election definition per contest option and is a rectangle
specified using the same grid as bubble marks.

The scoring process ([scoring.rs](src/bubble-ballot-rust/scoring.rs)) works as
follows:

1. **Locate Write-In Area**: The write-in area is defined as a rectangle with
   coordinates `(x, y, width, height)` in the timing mark grid. The algorithm
   uses the timing mark grid to convert these grid coordinates into pixel
   coordinates, computing the four corners of the write-in area as a
   quadrilateral (to account for skew and distortion).

2. **Score Computation**: The score is the ratio of dark (foreground) pixels to
   total pixels within the quadrilateral area. This ratio represents how much of
   the write-in area contains ink or markings.

The score is later compared to a threshold to determine whether handwriting is
present, but the core function simply computes the score and lets the caller
decide how to interpret it. This enables detection of write-in votes even when
the corresponding bubble is not filled in.
