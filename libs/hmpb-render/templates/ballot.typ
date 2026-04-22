// VxSuite Ballot Template
// Data is loaded from a JSON file provided by the Rust preprocessor.

#let data = json("/ballot-data.json")

#let election = data.election
#let contests = data.contests
#let pages-data = data.pages
#let config = data.config

// ─── Constants ──────────────────────────────────────────────────────────────

#let tm-w = 0.1875in
#let tm-h = 0.0625in
#let margin-x = 0.19685in
#let margin-y = 0.16667in
#let frame-pad = 0.125in
#let section-gap = 9pt       // 0.75rem at 12pt base
#let col-gap = 9pt
#let base-size = 12pt
#let light-gray = rgb("#EDEDED")
#let dark-gray = rgb("#DADADA")

// ─── Page Setup ─────────────────────────────────────────────────────────────

#let paper-w = eval(config.paperWidth)
#let paper-h = eval(config.paperHeight)
#let hide-timing-marks = config.ballotMode == "sample"
// We track the total content pages separately. The page counter's final
// value is used for the footer, and we add a blank page at the very end
// (after all content) if needed for even page count. The blank page
// doesn't display "Page X/Y".

#set document(date: none)
#set text(font: "Roboto", size: base-size, lang: "en", weight: "regular")
#set par(leading: 0.65em, spacing: 0.65em)

// ─── Timing Marks ───────────────────────────────────────────────────────────

#let tm-cols = int(paper-w / 1in * 4)
#let tm-rows = int(paper-h / 1in * 4) - 3
#let grid-w = paper-w - 2 * margin-x - tm-w
#let grid-h = paper-h - 2 * margin-y - tm-h

#let timing-marks() = {
  if hide-timing-marks { return }
  for i in range(tm-cols) {
    let frac = i / (tm-cols - 1)
    let x = margin-x + frac * grid-w
    place(top + left, dx: x, dy: margin-y,
      rect(width: tm-w, height: tm-h, fill: black))
    place(top + left, dx: x, dy: paper-h - margin-y - tm-h,
      rect(width: tm-w, height: tm-h, fill: black))
  }
  for j in range(tm-rows) {
    let frac = j / (tm-rows - 1)
    let y = margin-y + frac * grid-h
    place(top + left, dx: margin-x, dy: y,
      rect(width: tm-w, height: tm-h, fill: black))
    place(top + left, dx: paper-w - margin-x - tm-w, dy: y,
      rect(width: tm-w, height: tm-h, fill: black))
  }
}

// ─── Bubble ─────────────────────────────────────────────────────────────────

#let bubble-w = 14.25pt
#let bubble-h = 9.75pt

#let bubble(contest-id: "", option-id: "", option-type: "option", write-in-index: -1) = {
  box(height: 1.2em, baseline: 0.3em)[
    #metadata((
      contestId: contest-id,
      optionId: option-id,
      type: option-type,
      writeInIndex: write-in-index,
    )) <bubble>
    #rect(width: bubble-w, height: bubble-h, radius: 5.25pt,
      stroke: 0.75pt + black)
  ]
}

// ─── Contest Components ─────────────────────────────────────────────────────

#let contest-header(title, vote-for-text) = {
  block(width: 100%, fill: light-gray, inset: (x: 6pt, y: 6pt), below: 0pt)[
    #text(weight: "bold", size: 1.1em)[#title]
    #if vote-for-text != none [\ #vote-for-text]
  ]
}

#let candidate-option(contest-id, candidate, index, show-party: true) = {
  if index > 0 { line(length: 100%, stroke: 0.3pt + dark-gray) }
  box(width: 100%, inset: (x: 6pt, y: 4pt))[
    #grid(columns: (auto, 1fr), column-gutter: 6pt, align: top,
      bubble(contest-id: contest-id, option-id: candidate.id),
      [
        *#candidate.name*
        #if show-party and candidate.at("partyName", default: none) != none [
          \ #candidate.partyName
        ]
      ]
    )
  ]
}

#let write-in-option(contest-id, index) = {
  line(length: 100%, stroke: 0.3pt + dark-gray)
  box(width: 100%, inset: (x: 6pt, top: 10pt, bottom: 3pt))[
    #grid(columns: (auto, 1fr), column-gutter: 6pt, align: top,
      bubble(contest-id: contest-id, option-type: "write-in", write-in-index: index),
      [
        #v(2pt)
        #line(length: 100%, stroke: 0.5pt + black)
        #text(size: 0.8em)[Write-in]
      ]
    )
  ]
}

#let candidate-contest(contest) = {
  let vote-text = if contest.seats == 1 { "Vote for 1" } else { "Vote for up to " + str(contest.seats) }
  block(width: 100%, stroke: (top: 3pt + black, rest: 0.5pt + black), breakable: false)[
    #contest-header(contest.title, vote-text)
    #for (i, candidate) in contest.candidates.enumerate() {
      candidate-option(contest.id, candidate, i,
        show-party: contest.at("showParty", default: true))
    }
    #if contest.at("allowWriteIns", default: false) {
      for i in range(contest.seats) {
        write-in-option(contest.id, i)
      }
    }
  ]
}

#let yesno-contest(contest) = {
  block(width: 100%, stroke: (top: 3pt + black, rest: 0.5pt + black), breakable: false)[
    #contest-header(contest.title, none)
    #block(inset: (x: 6pt, y: 4pt))[
      #contest.description
    ]
    #for (i, option) in contest.options.enumerate() {
      line(length: 100%, stroke: 0.3pt + light-gray)
      box(width: 100%, inset: (x: 6pt, y: 4pt))[
        #grid(columns: (auto, 1fr), column-gutter: 6pt, align: top,
          bubble(contest-id: contest.id, option-id: option.id),
          [*#option.label*]
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

#let ballot-header() = {
  grid(columns: (5em, 1fr), column-gutter: section-gap, align: horizon,
    if config.at("hasSeal", default: false) {
      image("/seal.svg", width: 5em)
    },
    [
      #set par(leading: 0.3em, spacing: 0.4em)
      #text(weight: "bold", size: 1.4em)[#config.ballotTitle] \
      #text(weight: "bold", size: 1.2em)[#election.title] \
      #text(weight: "bold", size: 1.2em)[#config.formattedDate] \
      #election.county.name, #election.state
    ]
  )
  v(section-gap)
  // Instructions
  block(width: 100%, stroke: (top: 3pt + black, rest: 0.5pt + black),
    fill: light-gray, inset: (x: 6pt, y: 6pt))[
    #grid(columns: (1fr, 7em, 1.9fr, 7.5em), column-gutter: 0.75em, align: top,
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
        To vote for a person whose name is not on the ballot, write the person\u{2019}s
        name on the \u{201C}Write-in\u{201D} line and completely fill in the oval next to the line.
      ],
      if config.at("hasWriteInDiagram", default: false) {
        align(center + horizon, image("/assets/write_in_diagram.svg", width: 100%))
      },
    )
  ]
  v(section-gap)
}

// ─── Footer ─────────────────────────────────────────────────────────────────

// The footer height including the metadata row
// Footer = QR row (0.6in) + gap (4pt) + metadata line (~10pt) + breathing room
#let footer-height = 0.6in + 4pt + 14pt

#let content-pages = state("content-pages", 0)

#let ballot-footer() = {
  let page-num = counter(page).get().first()
  let total = content-pages.final()
  let is-blank = page-num > total
  let voter-instruction = if is-blank { "" } else if page-num == total {
    "You have completed voting."
  } else if calc.odd(page-num) {
    "Turn ballot over and continue voting"
  } else {
    "Continue voting on next ballot sheet"
  }

  grid(columns: (0.6in, 1fr), column-gutter: section-gap, align: horizon,
    rect(width: 0.6in, height: 0.6in, stroke: 0.5pt + black),
    block(width: 100%, height: 0.6in,
      stroke: (top: 3pt + black, rest: 0.5pt + black),
      fill: light-gray, inset: (x: 6pt))[
      #if not is-blank {
        grid(columns: (auto, 1fr), align: (left + horizon, right + horizon),
          [
            #text(size: 0.85em)[Page] \
            #text(weight: "bold", size: 1.4em)[#page-num/#total]
          ],
          text(weight: "bold", size: 1.1em)[#voter-instruction]
        )
      }
    ]
  )
  v(4pt)
  text(size: 8pt, weight: "bold")[
    #grid(columns: (1fr, auto),
      [#config.at("ballotHash", default: "0" * 20) · #election.title, #config.formattedDate · #election.county.name, #election.state],
      [#config.precinctName · #config.ballotStyleId · English]
    )
  ]
}

// ─── Page Rendering ─────────────────────────────────────────────────────────

// Let typst handle pagination naturally — we just set up the page and
// flow the contests through columns. Typst's layout engine handles
// page breaks between contests (breakable: false keeps them intact).

#set page(
  width: paper-w, height: paper-h,
  margin: (
    top: margin-y + tm-h + frame-pad,
    bottom: margin-y + tm-h + frame-pad + footer-height,
    left: margin-x + tm-w + frame-pad,
    right: margin-x + tm-w + frame-pad,
  ),
  background: timing-marks(),
  fill: white,
  footer: context ballot-footer(),
  footer-descent: 0pt,
)

// Watermark on every page
#if config.at("watermark", default: none) != none {
  set page(foreground: place(center + horizon,
    rotate(-45deg,
      text(size: 2.6in, weight: "bold", fill: rgb(0, 0, 0, 25))[#config.watermark])))
}

// Header (page 1)
#ballot-header()

// Render all contests — let typst handle column distribution and page breaks
#let candidate-contests = contests.filter(c => c.type == "candidate")
#let yesno-contests = contests.filter(c => c.type == "yesno")

// Candidate contests in 3 columns
#if candidate-contests.len() > 0 {
  columns(3, gutter: col-gap)[
    #for contest in candidate-contests {
      render-contest(contest)
      v(col-gap)
    }
  ]
  v(col-gap)
}

// Ballot measure contests in 2 columns
#if yesno-contests.len() > 0 {
  columns(2, gutter: col-gap)[
    #for contest in yesno-contests {
      render-contest(contest)
      v(col-gap)
    }
  ]
}

// Record the number of content pages (before adding the blank trailing page)
#context content-pages.update(counter(page).get().first())

// Add blank trailing page if odd page count (for even front/back pairs)
#context {
  if calc.odd(counter(page).get().first()) {
    pagebreak()
    align(center + horizon, text(weight: "bold", size: 1.4em)[This page intentionally left blank])
  }
}
