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

const interpreter = new Interpreter({
  // Configure contests via an election.json. Contests on printed ballots must
  // appear in the same order they appear in this configuration.
  election,

  // Require at least 20% filled in targets.
  markScoreVoteThreshold: 0.2,
})

while (interpreter.hasMissingTemplates()) {
  // Templates are images of blank ballots.
  await interpreter.addTemplate(await getNextImage())
}

console.log('Interpreter has templates for all ballot styles and contests!')

const imageData = await getNextImage()
const { ballot } = await interpreter.interpretBallot(imageData)

console.log('Interpreted ballot:', ballot)
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
# to `test/fixtures/election-4e31cb17d8-ballot-style-77-precinct-oaklawn-branch-library`.
$ hmpb interpret -e election.json \
  blank-p1.jpg \
  blank-p2.jpg \
  filled-in-p1.jpg \
  filled-in-p2.jpg
╔═══════════════════════════════════════════════════════╤═══════════════════════╤══════════════════╗
║ Contest                                               │ filled-in-p1.jpg      │ filled-in-p2.jpg ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Member, U.S. Senate                                   │ Tim Smith             │                  ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Member, U.S. House, District 30                       │ Eddie Bernice Johnson │                  ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Judge, Texas Supreme Court, Place 6                   │ Jane Bland            │                  ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Member, Texas House of Representatives, District 111  │ Write-In              │                  ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Dallas County Tax Assessor-Collector                  │ John Ames             │                  ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Dallas County Sheriff                                 │ Chad Prda             │                  ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Member, Dallas County Commissioners Court, Precinct 3 │                       │ Andrew Jewell    ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Retain Robert Demergue as Chief Justice?              │                       │                  ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Proposition R: Countywide Recycling Program           │                       │ no               ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ City Council                                          │                       │                  ║
╟───────────────────────────────────────────────────────┼───────────────────────┼──────────────────╢
║ Mayor                                                 │                       │                  ║
╚═══════════════════════════════════════════════════════╧═══════════════════════╧══════════════════╝

# You can also request output as JSON.
$ hmpb interpret -e election.json -f \
  blank-p1.jpg \
  blank-p2.jpg \
  filled-in-p1.jpg \
  filled-in-p2.jpg
[
  {
    "input": "filled-in-p1.jpg",
    "interpreted": {
      "metadata": {
        "ballotStyleId": "77",
        "precinctId": "42",
        "isTestBallot": false,
        "pageCount": 2,
        "pageNumber": 1
      },
      "votes": {
        "us-senate": [
          {
            "id": "tim-smith",
            "name": "Tim Smith",
            "partyId": "6"
          }
        ],
        "us-house-district-30": [
          {
            "id": "eddie-bernice-johnson",
            "name": "Eddie Bernice Johnson",
            "partyId": "2",
            "incumbent": true
          }
        ],
        "texas-sc-judge-place-6": [
          {
            "id": "jane-bland",
            "name": "Jane Bland",
            "partyId": "3",
            "incumbent": true
          }
        ],
        "texas-house-district-111": [
          {
            "id": "__write-in-0",
            "name": "Write-In",
            "isWriteIn": true
          }
        ],
        "dallas-county-tax-assessor": [
          {
            "id": "john-ames",
            "name": "John Ames",
            "partyId": "2",
            "incumbent": true
          }
        ],
        "dallas-county-sheriff": [
          {
            "id": "chad-prda",
            "name": "Chad Prda",
            "partyId": "3"
          }
        ]
      },
      "marks": [
        {
          "type": "candidate",
          "contest": "us-senate",
          "option": "john-cornyn",
          "score": 0.005037783375314861,
          "bounds": {
            "x": 470,
            "y": 176,
            "width": 32,
            "height": 22
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 176,
              "width": 32,
              "height": 22
            },
            "inner": {
              "x": 472,
              "y": 178,
              "width": 28,
              "height": 18
            }
          }
        },
        {
          "type": "candidate",
          "contest": "us-senate",
          "option": "tim-smith",
          "score": 0.8808290155440415,
          "bounds": {
            "x": 470,
            "y": 411,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 411,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 472,
              "y": 413,
              "width": 28,
              "height": 17
            }
          }
        },
        {
          "type": "candidate",
          "contest": "us-house-district-30",
          "option": "eddie-bernice-johnson",
          "score": 0.7227979274611399,
          "bounds": {
            "x": 470,
            "y": 831,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 831,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 472,
              "y": 833,
              "width": 28,
              "height": 17
            }
          }
        },
        {
          "type": "candidate",
          "contest": "texas-sc-judge-place-6",
          "option": "jane-bland",
          "score": 0.6120906801007556,
          "bounds": {
            "x": 470,
            "y": 1173,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 1173,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 472,
              "y": 1175,
              "width": 28,
              "height": 18
            }
          }
        },
        {
          "type": "candidate",
          "contest": "texas-house-district-111",
          "option": "__write-in-0",
          "score": 0.7025,
          "bounds": {
            "x": 872,
            "y": 320,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 872,
              "y": 320,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 874,
              "y": 322,
              "width": 28,
              "height": 18
            }
          }
        },
        {
          "type": "candidate",
          "contest": "dallas-county-tax-assessor",
          "option": "john-ames",
          "score": 0.8737113402061856,
          "bounds": {
            "x": 872,
            "y": 556,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 872,
              "y": 556,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 874,
              "y": 558,
              "width": 28,
              "height": 17
            }
          }
        },
        {
          "type": "candidate",
          "contest": "dallas-county-sheriff",
          "option": "chad-prda",
          "score": 0.6313131313131313,
          "bounds": {
            "x": 872,
            "y": 916,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 872,
              "y": 916,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 874,
              "y": 917,
              "width": 28,
              "height": 18
            }
          }
        }
      ]
    }
  },
  {
    "input": "filled-in-p2.jpg",
    "interpreted": {
      "metadata": {
        "ballotStyleId": "77",
        "precinctId": "42",
        "isTestBallot": false,
        "pageCount": 2,
        "pageNumber": 2
      },
      "votes": {
        "dallas-county-commissioners-court-pct-3": [
          {
            "id": "andrew-jewell",
            "name": "Andrew Jewell",
            "partyId": "7"
          }
        ],
        "dallas-county-proposition-r": "no"
      },
      "marks": [
        {
          "type": "candidate",
          "contest": "dallas-county-commissioners-court-pct-3",
          "option": "andrew-jewell",
          "score": 0.72544080604534,
          "bounds": {
            "x": 67,
            "y": 398,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 67,
              "y": 398,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 69,
              "y": 400,
              "width": 28,
              "height": 18
            }
          }
        },
        {
          "type": "yesno",
          "contest": "dallas-county-retain-chief-justice",
          "option": "yes",
          "score": 0.14910025706940874,
          "bounds": {
            "x": 67,
            "y": 869,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 67,
              "y": 869,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 69,
              "y": 870,
              "width": 28,
              "height": 18
            }
          }
        },
        {
          "type": "yesno",
          "contest": "dallas-county-proposition-r",
          "option": "no",
          "score": 0.7964376590330788,
          "bounds": {
            "x": 470,
            "y": 365,
            "width": 32,
            "height": 22
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 365,
              "width": 32,
              "height": 22
            },
            "inner": {
              "x": 472,
              "y": 367,
              "width": 28,
              "height": 18
            }
          }
        },
        {
          "type": "candidate",
          "contest": "dallas-city-council",
          "option": "randall-rupp",
          "score": 0.13110539845758354,
          "bounds": {
            "x": 470,
            "y": 647,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 647,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 472,
              "y": 649,
              "width": 28,
              "height": 17
            }
          }
        },
        {
          "type": "candidate",
          "contest": "dallas-city-council",
          "option": "donald-davis",
          "score": 0.13212435233160622,
          "bounds": {
            "x": 470,
            "y": 881,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 881,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 472,
              "y": 883,
              "width": 28,
              "height": 17
            }
          }
        },
        {
          "type": "candidate",
          "contest": "dallas-city-council",
          "option": "__write-in-1",
          "score": 0.09595959595959595,
          "bounds": {
            "x": 470,
            "y": 1087,
            "width": 32,
            "height": 21
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 1087,
              "width": 32,
              "height": 21
            },
            "inner": {
              "x": 472,
              "y": 1089,
              "width": 28,
              "height": 18
            }
          }
        },
        {
          "type": "candidate",
          "contest": "dallas-city-council",
          "option": "__write-in-2",
          "score": 0.01015228426395939,
          "bounds": {
            "x": 470,
            "y": 1137,
            "width": 32,
            "height": 22
          },
          "target": {
            "bounds": {
              "x": 470,
              "y": 1137,
              "width": 32,
              "height": 22
            },
            "inner": {
              "x": 472,
              "y": 1139,
              "width": 28,
              "height": 18
            }
          }
        }
      ]
    }
  }
]
```

## License

GPL-3.0
