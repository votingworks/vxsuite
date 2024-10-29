# @votingworks/ballot-interpreter

Library to interpret BMD ballots produced by VxMark or hand-marked paper ballots
(HMPB) produced by VxDesign.

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
to run the Rust build and copy the built library into
`./build/hmpb-ts/rust_addon.node`.

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

#### Timing Mark Detection and Error Handling

Candidate timing marks are detected using a contours algorithm (similar to
openCV's
[`findContours`](https://docs.opencv.org/3.4/d4/d73/tutorial_py_contours_begin.html)
function). This returns all the contiguous shapes as rectangle bounding boxes.
We then filter these by plausibility based on size and position. We then find
the top/bottom/left/right timing mark edges independently. This is done by
splitting the candidate timing mark rectangles into top/bottom halves and
left/right halves, then searching within each of those four halves for the line
that intersects the most rectangles and is in a plausible position and angle.

If each edge is found, we now have what the code refers to as "partial" timing
marks. We then begin inferring any timing marks that we may have missed. We do
this by examining the spacing between each ordered pair of timing marks and, if
another would fit between them, we add it. When using bottom timing marks to
encode the ballot metadata, we infer a lot of bottom timing marks because we
expect many or even most of them to be missing. Once the inference is complete,
we now have what the code refers to as "complete" timing marks. This is the data
structure we use to determine the ballot layout and locate the bubbles.

Handling errors in timing mark detection requires a balance between being too
restrictive and rejecting too many ballots that could have been successfully
interpreted and being too permissive and interpreting ballots incorrectly.
Because the outcome of the former is not so bad–the voter may simply scan the
ballot again–we err on the side of caution. We have a few strategies for
handling errors:

1. **Allow for some missing timing marks.** We infer missing timing marks based
   on the spacing between known timing marks. This is especially important for
   bottom timing marks, which may be used to encode the ballot metadata. We
   can't allow too many missing timing marks, however, because the inference
   process is not perfect and may introduce errors.
2. **Require small rotation and/or skew if we've inferred any timing marks.** If
   we didn't infer any timing marks we can be more lenient, but if we did we
   need to be more strict about rotation and skew because they can cause the
   inferred timing marks to be incorrect. Note that this project uses "rotation"
   to refer to an angle by which the entire ballot is rotated, preserving the
   equal distance of points in the grid from each other. "Skew" refers to a
   distortion of the grid, where the distance between points in the grid is not
   preserved, and is caused by different parts of the ballot being scanned at
   different speeds.
3. **Require that the number of inferred timing marks on a side matches the
   expected number.** And that the left/right and top/bottom marks have the same
   count. The exception to this for the top/bottom marks is when encoding
   metadata using presence/absence of timing marks.

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

Bubble marks are scored to determine which bubbles are filled in. Locating the
bubble at `(x, y)` first locates the `y`th timing mark on the left and right
sides of the ballot. Given a line segment between the centers of these two
timing marks, the center of the bubble is presumed to be on this line `x / N`
percent of the way from the left timing mark to the right timing mark, where `N`
is the number of columns of timing marks on the ballot. The bubble is then
scored by comparing a template bubble image to the actual contents of the scan
at the bubble location. A score is computed by computing the number of new dark
pixels compared to the template bubble image. The score is later compared to a
threshold to determine if the bubble is filled in, but the core function simply
computes the score and lets the caller decide how to interpret it.

### Score Write-Ins

Write-ins are scored to determine whether any have handwriting. The write-in
area is encoded in the election definition per contest option and is a rectangle
specified using the same grid as bubble marks. The write-in area is scored by
computing the ratio of dark pixels in the area. It is later compared to a
threshold, but similarly to bubble scoring, the core function simply computes
the score and lets the caller decide how to interpret it.
