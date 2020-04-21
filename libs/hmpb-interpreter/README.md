# hmpb-interpreter

Interprets VotingWorks ballots marked by hand and scanned into images.

## Install

```sh
# Local install for API usage.
$ yarn add @votingworks/hmpb-interpreter
$ npm install @votingworks/hmpb-interpreter # or, with npm

# Global install for CLI usage, or just use `npx hmpb-interpreter`.
$ yarn global add @votingworks/hmpb-interpreter
$ npm install -g @votingworks/hmpb-interpreter # or, with npm
```

## API Usage

```ts
import { Interpreter } from '@votingworks/hmpb-interpreter'

// Configure contests via an election.json. Contests on printed ballots must
// appear in the same order they appear in this configuration.
const interpreter = new Interpreter(election)

while (interpreter.hasMissingTemplates()) {
  // Templates are images of blank ballots.
  await interpreter.addTemplate(await getNextImage())
}

console.log('Interpreter has templates for all ballot styles and contests!')

const imageData = await getNextImage()
const interpretedBallot = await interpreter.interpretBallot(imageData)

console.log('Interpreted ballot:', interpretedBallot)
```

### Customizing QR Code Decoder

This library uses [`node-quirc`](https://github.com/dlbeer/quirc/) to decode QR
codes. If you wish to supply your own decoder, pass `decodeQRCode` to
`Interpreter` like so:

```ts
// Example custom QR code reader using jsQR
import jsQR from 'jsqr'
import { Interpreter } from '@votingworks/hmpb-interpreter'

const interpreter = new Interpreter({
  election,
  async decodeQRCode(imageData: ImageData): Promise<Buffer | undefined> {
    const code = jsQR(imageData.data, imageData.width, imageData.height)
    return code ? Buffer.from(code.binaryData) : undefined
  })
})
```

## CLI Usage

```sh
# To try this example out, install globally then clone the repository and `cd`
# to `test/fixtures`.
$ hmpb interpret -e election.json \
  template-2020-04-15-0001.jpg \
  template-2020-04-15-0002.jpg \
  template-2020-04-15-0001-full-votes.jpg \
  template-2020-04-15-0002-full-votes.jpg
╔═══════════════════════════════════════════════════════╤═════════════════════════════════════════╤═════════════════════════════════════════╗
║ Contest                                               │ template-2020-04-15-0001-full-votes.jpg │ template-2020-04-15-0002-full-votes.jpg ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Member, U.S. Senate                                   │ Tim Smith                               │                                         ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Member, U.S. House, District 30                       │ Eddie Bernice Johnson                   │                                         ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Judge, Texas Supreme Court, Place 6                   │ Jane Bland                              │                                         ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Member, Texas House of Representatives, District 111  │ Write-In                                │                                         ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Dallas County Tax Assessor-Collector                  │ John Ames                               │                                         ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Dallas County Sheriff                                 │ Chad Prda                               │                                         ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Member, Dallas County Commissioners Court, Precinct 3 │ Andrew Jewell                           │                                         ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Retain Robert Demergue as Chief Justice?              │                                         │                                         ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Proposition R: Countywide Recycling Program           │                                         │ yes                                     ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ City Council                                          │                                         │ Randall Rupp, Write-In                  ║
╟───────────────────────────────────────────────────────┼─────────────────────────────────────────┼─────────────────────────────────────────╢
║ Mayor                                                 │                                         │                                         ║
╚═══════════════════════════════════════════════════════╧═════════════════════════════════════════╧═════════════════════════════════════════╝

# You can also request output as JSON.
$ hmpb interpret -e election.json -f json \
  template-2020-04-15-0001.jpg \
  template-2020-04-15-0002.jpg \
  template-2020-04-15-0001-full-votes.jpg \
  template-2020-04-15-0002-full-votes.jpg
[
  {
    "input": "template-2020-04-15-0001-full-votes.jpg",
    "interpreted": {
      "votes": {
        "1": [
          {
            "id": "14",
            "name": "Tim Smith",
            "partyId": "6"
          }
        ],
        "2": [
          {
            "id": "21",
            "name": "Eddie Bernice Johnson",
            "partyId": "2",
            "incumbent": true
          }
        ],
        "3": [
          {
            "id": "31",
            "name": "Jane Bland",
            "partyId": "3",
            "incumbent": true
          }
        ],
        "4": [
          {
            "id": "__write-in",
            "name": "Write-In",
            "isWriteIn": true
          }
        ],
        "5": [
          {
            "id": "51",
            "name": "John Ames",
            "partyId": "2",
            "incumbent": true
          }
        ],
        "6": [
          {
            "id": "62",
            "name": "Chad Prda",
            "partyId": "3"
          }
        ],
        "7": [
          {
            "id": "73",
            "name": "Andrew Jewell",
            "partyId": "7"
          }
        ]
      }
    }
  },
  {
    "input": "template-2020-04-15-0002-full-votes.jpg",
    "interpreted": {
      "votes": {
        "9": "yes",
        "10": [
          {
            "id": "rupp",
            "name": "Randall Rupp",
            "partyId": "2"
          },
          {
            "id": "__write-in",
            "name": "Write-In",
            "isWriteIn": true
          }
        ]
      }
    }
  }
]
```

## License

GPL-3.0
