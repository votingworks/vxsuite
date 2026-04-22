// VxSuite Ballot Template — rendered via typst
// Data is loaded from a JSON file passed as input.

#let data = json("/ballot-data.json")

#let election = data.election
#let contests = data.contests  // pre-filtered, pre-ordered for this ballot style
#let pages = data.pages         // pre-computed pagination: array of page descriptors
#let config = data.config       // rendering config (paper size, margins, mode, etc.)

// ─── Constants ──────────────────────────────────────────────────────────────

#let tm-w = 0.1875in   // timing mark width
#let tm-h = 0.0625in   // timing mark height
#let margin-x = 0.19685in  // 5mm left/right
#let margin-y = 0.16667in  // 12pt top/bottom
#let frame-pad = 0.125in
#let section-gap = 0.75em
#let col-gap = 0.75em
#let base-size = 12pt
#let colors = (
  black: black,
  white: white,
  light-gray: rgb("#EDEDED"),
  dark-gray: rgb("#DADADA"),
)

// ─── Page Setup ─────────────────────────────────────────────────────────────

#let paper-w = eval(config.paperWidth)
#let paper-h = eval(config.paperHeight)
#let hide-timing-marks = config.ballotMode == "sample"
#let total-pages = pages.len()

#set document(date: none)  // deterministic PDF
#set text(font: "Roboto", size: base-size, lang: "en")
#set par(leading: 0.2em)

// ─── Timing Marks ───────────────────────────────────────────────────────────

#let tm-cols = int(paper-w / 1in * 4)
#let tm-rows = int(paper-h / 1in * 4) - 3
#let grid-w = paper-w - 2 * margin-x - tm-w
#let grid-h = paper-h - 2 * margin-y - tm-h

#let timing-marks() = {
  if hide-timing-marks { return }
  // Top row
  for i in range(tm-cols) {
    let frac = i / (tm-cols - 1)
    place(top + left,
      dx: margin-x + frac * grid-w,
      dy: margin-y,
      rect(width: tm-w, height: tm-h, fill: black))
  }
  // Bottom row
  for i in range(tm-cols) {
    let frac = i / (tm-cols - 1)
    place(top + left,
      dx: margin-x + frac * grid-w,
      dy: paper-h - margin-y - tm-h,
      rect(width: tm-w, height: tm-h, fill: black))
  }
  // Left column
  for j in range(tm-rows) {
    let frac = j / (tm-rows - 1)
    place(top + left,
      dx: margin-x,
      dy: margin-y + frac * grid-h,
      rect(width: tm-w, height: tm-h, fill: black))
  }
  // Right column
  for j in range(tm-rows) {
    let frac = j / (tm-rows - 1)
    place(top + left,
      dx: paper-w - margin-x - tm-w,
      dy: margin-y + frac * grid-h,
      rect(width: tm-w, height: tm-h, fill: black))
  }
}

// ─── Bubble ─────────────────────────────────────────────────────────────────

#let bubble(contest-id: "", option-id: "", option-type: "option", write-in-index: -1) = {
  [#metadata((
    contestId: contest-id,
    optionId: option-id,
    type: option-type,
    writeInIndex: write-in-index,
  )) <bubble>]
  rect(width: 14.25pt, height: 9.75pt, radius: 5.25pt,
    stroke: 0.5pt + black)
}

// ─── Contest Components ─────────────────────────────────────────────────────

#let contest-header(title, vote-for-text) = {
  block(width: 100%, fill: colors.light-gray, inset: 0.5em)[
    #text(weight: "bold", size: 1.1em)[#title] \
    #vote-for-text
  ]
}

#let candidate-option(contest-id, candidate, index, show-party: true) = {
  let sep = if index > 0 { line(length: 100%, stroke: 0.3pt + colors.dark-gray) } else { none }
  sep
  block(width: 100%, inset: (x: 0.5em, y: 0.375em))[
    #grid(columns: (auto, 1fr), column-gutter: 0.5em, align: horizon,
      bubble(contest-id: contest-id, option-id: candidate.id),
      [
        #text(weight: "bold")[#candidate.name]
        #if show-party and candidate.at("partyName", default: none) != none [
          \ #candidate.partyName
        ]
      ]
    )
  ]
}

#let write-in-option(contest-id, index) = {
  line(length: 100%, stroke: 0.3pt + colors.dark-gray)
  block(width: 100%, inset: (x: 0.5em, top: 0.9em, bottom: 0.25em))[
    #grid(columns: (auto, 1fr), column-gutter: 0.5em, align: horizon,
      bubble(contest-id: contest-id, option-type: "write-in", write-in-index: index),
      [
        #line(length: 100%, stroke: 0.5pt + black)
        #text(size: 0.8em)[Write-in]
      ]
    )
  ]
}

#let candidate-contest(contest) = {
  let vote-text = if contest.seats == 1 { "Vote for 1" } else { "Vote for up to " + str(contest.seats) }
  block(width: 100%, stroke: (top: 3pt + black, rest: 0.5pt + black))[
    #contest-header(contest.title, vote-text)
    #for (i, candidate) in contest.candidates.enumerate() {
      candidate-option(contest.id, candidate, i, show-party: contest.at("showParty", default: true))
    }
    #if contest.at("allowWriteIns", default: false) {
      for i in range(contest.seats) {
        write-in-option(contest.id, i)
      }
    }
  ]
}

#let yesno-contest(contest) = {
  block(width: 100%, stroke: (top: 3pt + black, rest: 0.5pt + black))[
    #contest-header(contest.title, none)
    #block(inset: 0.5em)[
      #contest.description
    ]
    #for (i, option) in contest.options.enumerate() {
      line(length: 100%, stroke: 0.3pt + colors.light-gray)
      block(width: 100%, inset: (x: 0.5em, y: 0.375em))[
        #grid(columns: (auto, 1fr), column-gutter: 0.5em, align: horizon,
          bubble(contest-id: contest.id, option-id: option.id),
          text(weight: "bold")[#option.label]
        )
      ]
    }
  ]
}

#let render-contest(contest) = {
  if contest.type == "candidate" { candidate-contest(contest) }
  else if contest.type == "yesno" { yesno-contest(contest) }
}

// ─── Header ─────────────────────────────────────────────────────────────────

#let ballot-header(page-data) = {
  if page-data.pageNumber != 1 { return }
  // Seal + title
  grid(columns: (5em, 1fr), column-gutter: section-gap, align: horizon,
    if config.at("hasSeal", default: false) {
      image("/seal.svg", width: 5em)
    },
    [
      #text(weight: "bold", size: 1.4em)[#config.ballotTitle] \
      #text(weight: "bold", size: 1.2em)[#election.title] \
      #text(weight: "bold", size: 1.2em)[#config.formattedDate] \
      #election.county.name, #election.state
    ]
  )
  v(section-gap)
  // Instructions
  block(width: 100%, stroke: (top: 3pt + black, rest: 0.5pt + black), fill: colors.light-gray, inset: 0.5em)[
    #grid(columns: (1fr, 7em, 1.9fr, 7.5em), column-gutter: 0.75em,
      [
        #text(weight: "bold", size: 1.2em)[Instructions] \
        *To Vote:* \
        To vote, completely fill in the oval next to your choice.
      ],
      if config.at("hasFillBubbleDiagram", default: false) {
        align(center + horizon, image("/assets/fill_bubble_diagram.svg", width: 100%))
      },
      [
        *To Vote for a Write-in:* \
        To vote for a person whose name is not on the ballot, write the person\u{2019}s name on the \u{201C}Write-in\u{201D} line and completely fill in the oval next to the line.
      ],
      if config.at("hasWriteInDiagram", default: false) {
        align(center + horizon, image("/assets/write_in_diagram.svg", width: 100%))
      },
    )
  ]
  v(section-gap)
}

// ─── Footer ─────────────────────────────────────────────────────────────────

#let ballot-footer(page-data) = {
  let show-page-info = page-data.at("showPageInfo", default: true)
  grid(columns: (0.6in, 1fr), column-gutter: section-gap, align: horizon,
    // QR code placeholder
    rect(width: 0.6in, height: 0.6in, stroke: 0.5pt + black),
    // Footer box
    block(width: 100%, height: 0.6in, stroke: (top: 3pt + black, rest: 0.5pt + black), fill: colors.light-gray, inset: (x: 0.5em))[
      #if show-page-info {
        grid(columns: (auto, 1fr), align: (left + horizon, right + horizon),
          [
            #text(size: 0.85em)[Page] \
            #text(weight: "bold", size: 1.4em)[#page-data.pageNumber/#total-pages]
          ],
          text(weight: "bold", size: 1.1em)[#page-data.at("voterInstruction", default: "")]
        )
      }
    ]
  )
  // Metadata row
  v(0.325em)
  text(size: 8pt, weight: "bold")[
    #grid(columns: (1fr, auto),
      [#config.at("ballotHash", default: "0" * 20) · #election.title, #config.formattedDate · #election.county.name, #election.state],
      [#config.precinctName · #config.ballotStyleId · English]
    )
  ]
}

// ─── Page Rendering ─────────────────────────────────────────────────────────

#for (pi, page-data) in pages.enumerate() {
  set page(
    width: paper-w, height: paper-h,
    margin: (
      top: margin-y + tm-h + frame-pad,
      bottom: margin-y + tm-h + frame-pad,
      left: margin-x + tm-w + frame-pad,
      right: margin-x + tm-w + frame-pad,
    ),
    background: timing-marks(),
    fill: white,
  )

  // Watermark
  if config.at("watermark", default: none) != none {
    place(center + horizon,
      rotate(-45deg,
        text(size: 2.6in, weight: "bold", fill: rgb(0, 0, 0, 25))[#config.watermark]))
  }

  // Header (page 1 only)
  ballot-header(page-data)

  // Contest columns
  for section in page-data.sections {
    grid(
      columns: range(section.numColumns).map(_ => 1fr),
      column-gutter: col-gap,
      ..section.columns.flatten().map(idx => {
        render-contest(contests.at(idx))
      })
    )
    v(col-gap)
  }

  // Blank page message
  if page-data.sections.len() == 0 and page-data.pageNumber > 1 {
    align(center + horizon,
      text(weight: "bold", size: 1.4em)[This page intentionally left blank])
  }

  // Footer at bottom
  place(bottom + left, ballot-footer(page-data))

  // Page break (except last page)
  if pi < pages.len() - 1 { pagebreak() }
}
