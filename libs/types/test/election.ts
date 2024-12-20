import { assertDefined } from '@votingworks/basics';
import { BallotStyle, Election, PartyIdSchema } from '../src/election';
import { safeParseElection } from '../src/election_parsing';
import { unsafeParse } from '../src/generic';

export const electionData = `
{
  "id": "election-1",
  "type": "general",
  "title": "ELECTION",
  "ballotStyles": [
    {
      "id": "1",
      "groupId": "1",
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
  "state": "STATE",
  "ballotStrings": {
    "en": {
       "ballotLanguage": "English",
       "ballotStyleId": {
          "1": "1"
       },
       "candidateName": {
          "C": "CANDIDATE"
       },
       "contestDescription": {
          "YNC": "DESCRIPTION"
       },
       "contestOptionLabel": {
          "YNC-option-yes": "Yes",
          "YNC-option-no": "No"
       },
       "contestTitle": {
          "CC": "TITLE",
          "YNC": "TITLE"
       },
       "countyName": "COUNTY",
       "districtName": {
          "D": "DISTRICT"
       },
       "electionDate": "November 3, 2020",
       "electionTitle": "ELECTION",
       "partyFullName": {
          "PARTY": "POLITICAL PARTY"
       },
       "partyName": {
          "PARTY": "PARTY"
       },
       "precinctName": {
          "P": "PRECINCT"
       },
       "stateName": "STATE"
    }
  }
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
      groupId: `${bs.id}D`,
      partyId: democraticPartyId,
    })),
    ...election.ballotStyles.map((bs) => ({
      ...bs,
      id: `${bs.id}R`,
      groupId: `${bs.id}D`,
      partyId: republicanPartyId,
    })),
  ] as BallotStyle[],
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
  ballotStrings: {
    en: {
      ...assertDefined(election.ballotStrings['en']),
      electionTitle: 'Primary Election',
      ballotStyleId: {
        '1D': '1D',
        '1R': '1R',
      },
      contestTitle: {
        CCD: 'TITLE',
        CCR: 'TITLE',
        YNC: 'TITLE',
      },
      partyFullName: {
        [democraticPartyId]: 'Democratic Party',
        [republicanPartyId]: 'Republican Party',
      },
      partyName: {
        [democraticPartyId]: 'Democrat',
        [republicanPartyId]: 'Republican',
      },
    },
  },
};

const electionTwoPartyPrimaryData = `
{
  "id": "election-2",
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
      "groupId": "1M",
      "precincts": ["precinct-1", "precinct-2"],
      "districts": ["district-1"],
      "partyId": "0"
    },
    {
      "id": "2F",
      "groupId": "2F",
      "precincts": ["precinct-1", "precinct-2"],
      "districts": ["district-1"],
      "partyId": "1"
    }
  ],
  "seal": "<svg>test seal</svg>",
  "ballotStrings": {
    "en": {
      "ballotLanguage": "English",
      "ballotStyleId": {
        "1M": "1M",
        "2F": "2F"
      },
      "candidateName": {
        "horse": "Horse",
        "otter": "Otter",
        "fox": "Fox",
        "seahorse": "Seahorse",
        "salmon": "Salmon",
        "zebra": "Zebra",
        "lion": "Lion",
        "kangaroo": "Kangaroo",
        "elephant": "Elephant",
        "manta-ray": "Manta Ray",
        "pufferfish": "Pufferfish",
        "rockfish": "Rockfish",
        "triggerfish": "Triggerfish"
      },
      "contestDescription": {
        "fishing": "Should fishing be banned in all city owned lakes and rivers?"
      },
      "contestOptionLabel": {
        "ban-fishing": "YES",
        "allow-fishing": "NO"
      },
      "contestTitle": {
        "best-animal-mammal": "Best Animal",
        "best-animal-fish": "Best Animal",
        "zoo-council-mammal": "Zoo Council",
        "aquarium-council-fish": "Zoo Council",
        "fishing": "Ballot Measure 3"
      },
      "countyName": "Sample County",
      "districtName": {
        "district-1": "District 1"
      },
      "electionDate": "September 8, 2021",
      "electionTitle": "Example Primary Election - Minimal Exhaustive",
      "partyFullName": {
        "0": "Mammal Party",
        "1": "Fish Party"
      },
      "partyName": {
        "0": "Mammal",
        "1": "Fish"
      },
      "precinctName": {
        "precinct-1": "Precinct 1",
        "precinct-2": "Precinct 2"
      },
      "stateName": "State of Sample"
    }
  }
}`;
export const electionTwoPartyPrimary: Election = safeParseElection(
  electionTwoPartyPrimaryData
).unsafeUnwrap();
