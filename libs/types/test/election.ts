import { Election, PartyIdSchema } from '../src/election';
import { safeParseElection } from '../src/election_parsing';
import { unsafeParse } from '../src/generic';

export const electionData = `
{
  "type": "general",
  "title": "ELECTION",
  "ballotStyles": [
    {
      "id": "1",
      "districts": [
        "D"
      ],
      "precincts": [
        "P"
      ]
    }
  ],
  "districts": [
    {
      "id": "D",
      "name": "DISTRICT"
    }
  ],
  "contests": [
    {
      "type": "candidate",
      "id": "CC",
      "districtId": "D",
      "seats": 1,
      "title": "TITLE",
      "allowWriteIns": false,
      "candidates": [
        {
          "id": "C",
          "name": "CANDIDATE"
        }
      ]
    },
    {
      "type": "yesno",
      "id": "YNC",
      "districtId": "D",
      "title": "TITLE",
      "description": "DESCRIPTION"
    }
  ],
  "county": {
    "id": "COUNTY",
    "name": "COUNTY"
  },
  "date": "2020-11-03",
  "parties": [
    {
      "id": "PARTY",
      "name": "PARTY",
      "abbrev": "PTY",
      "fullName": "POLITICAL PARTY"
    }
  ],
  "precincts": [
    {
      "id": "P",
      "name": "PRECINCT"
    }
  ],
  "seal": "<svg>test seal</svg>",
  "state": "STATE"
}`;
export const election: Election =
  safeParseElection(electionData).unsafeUnwrap();
const democraticPartyId = unsafeParse(PartyIdSchema, 'DEM');
const republicanPartyId = unsafeParse(PartyIdSchema, 'REP');
export const primaryElection: Election = {
  ...election,
  type: 'primary',
  title: 'Primary Election',
  ballotStyles: [
    ...election.ballotStyles.map((bs) => ({
      ...bs,
      id: `${bs.id}D`,
      partyId: democraticPartyId,
    })),
    ...election.ballotStyles.map((bs) => ({
      ...bs,
      id: `${bs.id}R`,
      partyId: republicanPartyId,
    })),
  ],
  contests: [
    ...election.contests
      .filter((contest) => contest.type === 'candidate')
      .map((c) => ({
        ...c,
        id: `${c.id}D`,
        partyId: democraticPartyId,
      })),
    ...election.contests
      .filter((contest) => contest.type === 'candidate')
      .map((c) => ({
        ...c,
        id: `${c.id}R`,
        partyId: republicanPartyId,
      })),
    ...election.contests.filter((contest) => contest.type !== 'candidate'),
  ],
  parties: [
    {
      id: democraticPartyId,
      name: 'Democrat',
      abbrev: 'D',
      fullName: 'Democratic Party',
    },
    {
      id: republicanPartyId,
      name: 'Republican',
      abbrev: 'R',
      fullName: 'Republican Party',
    },
  ],
};

const electionTwoPartyPrimaryData = `
{
  "type": "primary",
  "title": "Example Primary Election - Minimal Exhaustive",
  "state": "State of Sample",
  "county": {
    "id": "sample-county",
    "name": "Sample County"
  },
  "date": "2021-09-08",
  "ballotLayout": {
    "paperSize": "letter",
    "metadataEncoding": "qr-code"
  },
  "districts": [
    {
      "id": "district-1",
      "name": "District 1"
    }
  ],
  "parties": [
    {
      "id": "0",
      "name": "Mammal",
      "fullName": "Mammal Party",
      "abbrev": "Ma"
    },
    {
      "id": "1",
      "name": "Fish",
      "fullName": "Fish Party",
      "abbrev": "F"
    }
  ],
  "contests": [
    {
      "id": "best-animal-mammal",
      "districtId": "district-1",
      "type": "candidate",
      "title": "Best Animal",
      "seats": 1,
      "partyId": "0",
      "candidates": [
        {
          "id": "horse",
          "name": "Horse",
          "partyIds": ["0"]
        },
        {
          "id": "otter",
          "name": "Otter",
          "partyIds": ["0"]
        },
        {
          "id": "fox",
          "name": "Fox",
          "partyIds": ["0"]
        }
      ],
      "allowWriteIns": false
    },
    {
      "id": "best-animal-fish",
      "districtId": "district-1",
      "type": "candidate",
      "title": "Best Animal",
      "seats": 1,
      "partyId": "1",
      "candidates": [
        {
          "id": "seahorse",
          "name": "Seahorse",
          "partyIds": ["1"]
        },
        {
          "id": "salmon",
          "name": "Salmon",
          "partyIds": ["1"]
        }
      ],
      "allowWriteIns": false
    },
    {
      "id": "zoo-council-mammal",
      "districtId": "district-1",
      "type": "candidate",
      "title": "Zoo Council",
      "seats": 3,
      "partyId": "0",
      "candidates": [
        {
          "id": "zebra",
          "name": "Zebra",
          "partyIds": ["0"]
        },
        {
          "id": "lion",
          "name": "Lion",
          "partyIds": ["0"]
        },
        {
          "id": "kangaroo",
          "name": "Kangaroo",
          "partyIds": ["0"]
        },
        {
          "id": "elephant",
          "name": "Elephant",
          "partyIds": ["0"]
        }
      ],
      "allowWriteIns": true
    },
    {
      "id": "aquarium-council-fish",
      "districtId": "district-1",
      "type": "candidate",
      "title": "Zoo Council",
      "seats": 2,
      "partyId": "1",
      "candidates": [
        {
          "id": "manta-ray",
          "name": "Manta Ray",
          "partyIds": ["1"]
        },
        {
          "id": "pufferfish",
          "name": "Pufferfish",
          "partyIds": ["1"]
        },
        {
          "id": "rockfish",
          "name": "Rockfish",
          "partyIds": ["1"]
        },
        {
          "id": "triggerfish",
          "name": "Triggerfish",
          "partyIds": ["1"]
        }
      ],
      "allowWriteIns": true
    },
    {
      "id": "fishing",
      "districtId": "district-1",
      "type": "yesno",
      "title": "Ballot Measure 3",
      "description": "Should fishing be banned in all city owned lakes and rivers?",
      "yesOption": {
        "id": "ban-fishing",
        "label": "YES"
      },
      "noOption": {
        "id": "allow-fishing",
        "label": "NO"
      }
    }
  ],
  "precincts": [
    {
      "id": "precinct-1",
      "name": "Precinct 1"
    },
    {
      "id": "precinct-2",
      "name": "Precinct 2"
    }
  ],
  "ballotStyles": [
    {
      "id": "1M",
      "precincts": ["precinct-1", "precinct-2"],
      "districts": ["district-1"],
      "partyId": "0"
    },
    {
      "id": "2F",
      "precincts": ["precinct-1", "precinct-2"],
      "districts": ["district-1"],
      "partyId": "1"
    }
  ],
  "seal": "<svg>test seal</svg>",
  "centralScanAdjudicationReasons": ["BlankBallot"],
  "precinctScanAdjudicationReasons": ["BlankBallot"]
}`;
export const electionTwoPartyPrimary: Election = safeParseElection(
  electionTwoPartyPrimaryData
).unsafeUnwrap();
