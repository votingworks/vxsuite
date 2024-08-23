# converter-nh-accuvote

Converts XML/PDF ballot definitions as used by the state of New Hampshire into a
VotingWorks election definition.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.

## CLI Usage

```sh
❯ ./bin/convert --help
Usage: convert --config <config.json>

Summary

Converts a series of New Hampshire ballot cards into election definitions in the
VotingWorks format.

Description

Uses a config file to define the inputs and outputs (see example below). The
config file may include comments (// like this or /* this */). Note that if the
input data is incorrect then the output will likely be incorrect as well. This
tool can correct certain mistakes in the AccuVote XML, such as bubble positions
that are slightly off, but cannot correct more egregious errors:

  1. Candidates/contest options in the wrong column.
  2. Candidates/contest options in the wrong order.
  3. Missing timing marks.
  4. Missing contest option bubbles.

The output of this command will include two PDFs for each ballot style, one for
printing and one for proofing:
• PRINT PDFs include a QR code that enables scanning by VxScan or VxCentralScan
• PROOF PDFs overlay bubble and contest option locations

Please review ALL the PDFs labeled PROOF to ensure correctness!

Example Config

{
  // electionType: general, primary, etc.
  "electionType": "general",
  "jurisdictions": [
    // single-card jurisdiction
    {
      "name": "Alton",
      "cards": [
        {
          "definition": "input/alton/definition.xml",
          "ballot": "input/alton/ballot.pdf"
        }
      ],
      "output": "output/alton"
    },
    // multi-card jurisdiction
    {
      "name": "Rochester",
      "cards": [
        {
          "definition": "input/rochester/card1.xml",
          "ballot": "input/rochester/ballot.pdf",
          // optional: useful for multi-card PDFs
          "pages": [1, 2]
        },
        {
          "definition": "input/rochester/card2.xml",
          "ballot": "input/rochester/ballot.pdf",
          // optional: useful for multi-card PDFs
          "pages": [3, 4]
        }
      ],
      "output": "output/rochester"
    }
  ]
}
```

## License

AGPL-3.0
