import * as hmpbUI from '.'

test('exports all the UI for rendering hand-marked paper ballots', () => {
  expect(Object.keys(hmpbUI)).toMatchInlineSnapshot(`
    Array [
      "Bubble",
      "BubbleMark",
      "StyledContest",
      "Contest",
      "CandidateContestChoices",
      "HandMarkedPaperBallot",
      "HorizontalRule",
      "Prose",
      "QRCode",
      "Text",
      "TextWithLineBreaks",
      "NoWrap",
      "Monospace",
    ]
  `)
})
