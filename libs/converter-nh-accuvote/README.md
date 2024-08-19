# converter-nh-accuvote

Converts XML/PDF ballot definitions as used by the state of New Hampshire into a
VotingWorks election definition.

## Setup

Follow the instructions in the [VxSuite README](../../README.md) to get set up.

## CLI Usage

### Correct an AccuVote XML definition

```sh
# create a config file
$ cat correct-config.json
{
  "cards": [
    {
      "definitionPath": "alton.xml",
      "pdfPath": "alton.pdf",
      "outputDir": "corrected/alton/"
    },
    {
      "definitionPath": "conway.xml",
      "pdfPath": "conway.pdf",
      "outputDir": "corrected/conway/"
    }
  ]
}

# run the correction with the config file
$ ./bin/correct-definition -c correct-config.json

# see --help for more options
$ ./bin/correct-definition --help
```

### Convert an AccuVote XML definition

```sh
$ ./bin/convert \
  ../fixtures/data/electionGridLayoutNewHampshireTestBallot/{definition.xml,template.pdf} \
  -o ../fixtures/data/electionGridLayoutNewHampshireTestBallot/
warning: conversion completed with issues:
- Template images do not match expected sizes. The XML definition says the template images should be "legal", but the template images are front="letter" and back="letter".
```

## License

AGPL-3.0
