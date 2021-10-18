import { Election, safeParseElection } from '../src/election'

export const electionData = `
{
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
      "section": "SECTION",
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
      "section": "SECTION",
      "title": "TITLE",
      "description": "DESCRIPTION"
    }
  ],
  "county": {
    "id": "COUNTY",
    "name": "COUNTY"
  },
  "date": "2020-11-03T00:00:00-10:00",
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
  "state": "STATE"
}`
export const election: Election = safeParseElection(electionData).unsafeUnwrap()
export const primaryElection: Election = {
  ...election,
  ballotStyles: [
    ...election.ballotStyles.map((bs) => ({
      ...bs,
      id: `${bs.id}D`,
      partyId: 'DEM',
    })),
    ...election.ballotStyles.map((bs) => ({
      ...bs,
      id: `${bs.id}R`,
      partyId: 'REP',
    })),
  ],
  contests: [
    ...election.contests.map((c) => ({ ...c, id: `${c.id}D`, partyId: 'DEM' })),
    ...election.contests.map((c) => ({ ...c, id: `${c.id}R`, partyId: 'REP' })),
  ],
  parties: [
    { id: 'DEM', name: 'Democrat', abbrev: 'D', fullName: 'Democratic Party' },
    {
      id: 'REP',
      name: 'Republican',
      abbrev: 'R',
      fullName: 'Republican Party',
    },
  ],
}
export const electionWithMsEitherNeither: Election = {
  ...election,
  contests: [
    ...election.contests,
    {
      type: 'ms-either-neither',
      id: 'MSC',
      title: 'MSC',
      description: 'MSC',
      section: 'SECTION',
      districtId: 'D',
      eitherNeitherContestId: 'MSEN',
      eitherNeitherLabel: 'EITHER NEITHER',
      eitherOption: {
        id: 'EO',
        label: 'EITHER OPTION',
      },
      neitherOption: {
        id: 'NO',
        label: 'NEITHER OPTION',
      },
      pickOneContestId: 'MSPO',
      pickOneLabel: 'PICK ONE',
      firstOption: {
        id: 'FO',
        label: 'FIRST OPTION',
      },
      secondOption: {
        id: 'SO',
        label: 'SECOND OPTION',
      },
    },
  ],
}

const electionMinimalExhaustiveData = `
{
  "title": "Example Primary Election",
  "state": "State of Sample",
  "county": {
    "id": "sample-county",
    "name": "Sample County"
  },
  "date": "2021-09-08T00:00:00-08:00",
  "ballotLayout": {
    "paperSize": "letter"
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
      "section": "State",
      "title": "Best Animal",
      "seats": 1,
      "partyId": "0",
      "candidates": [
        {
          "id": "horse",
          "name": "Horse",
          "partyId": "0"
        },
        {
          "id": "otter",
          "name": "Otter",
          "partyId": "0"
        },
        {
          "id": "fox",
          "name": "Fox",
          "partyId": "0"
        }
      ],
      "allowWriteIns": false
    },
    {
      "id": "best-animal-fish",
      "districtId": "district-1",
      "type": "candidate",
      "section": "State",
      "title": "Best Animal",
      "seats": 1,
      "partyId": "1",
      "candidates": [
        {
          "id": "seahorse",
          "name": "Seahorse",
          "partyId": "1"
        },
        {
          "id": "salmon",
          "name": "Salmon",
          "partyId": "1"
        }
      ],
      "allowWriteIns": false
    },
    {
      "id": "zoo-council-mammal",
      "districtId": "district-1",
      "type": "candidate",
      "section": "City",
      "title": "Zoo Council",
      "seats": 3,
      "partyId": "0",
      "candidates": [
        {
          "id": "zebra",
          "name": "Zebra",
          "partyId": "0"
        },
        {
          "id": "lion",
          "name": "Lion",
          "partyId": "0"
        },
        {
          "id": "kangaroo",
          "name": "Kangaroo",
          "partyId": "0"
        },
        {
          "id": "elephant",
          "name": "Elephant",
          "partyId": "0"
        }
      ],
      "allowWriteIns": true
    },
    {
      "id": "aquarium-council-fish",
      "districtId": "district-1",
      "type": "candidate",
      "section": "City",
      "title": "Zoo Council",
      "seats": 2,
      "partyId": "1",
      "candidates": [
        {
          "id": "manta-ray",
          "name": "Manta Ray",
          "partyId": "1"
        },
        {
          "id": "pufferfish",
          "name": "Pufferfish",
          "partyId": "1"
        },
        {
          "id": "rockfish",
          "name": "Rockfish",
          "partyId": "1"
        },
        {
          "id": "triggerfish",
          "name": "Triggerfish",
          "partyId": "1"
        }
      ],
      "allowWriteIns": true
    },
    {
      "id": "new-zoo-either-neither",
      "section": "City",
      "districtId": "district-1",
      "type": "ms-either-neither",
      "title": "Ballot Measure 1",
      "partyId": "0",
      "eitherNeitherContestId": "new-zoo-either",
      "pickOneContestId": "new-zoo-pick",
      "description": "Initiative Measure No. 12, Should Sample City establish a new safari-style zoo costing 2,000,000? Alternative Measure 12 A, Should Sample City establish a new traditional zoo costing 1,000,000",
      "eitherNeitherLabel": "VOTE FOR APPROVAL OF EITHER, OR AGAINST BOTH",
      "pickOneLabel": "AND VOTE FOR ONE",
      "eitherOption": {
        "id": "new-zoo-either-approved",
        "label": "FOR APPROVAL OF EITHER Initiative No. 12 OR Alternative Initiative No. 12 A"
      },
      "neitherOption": {
        "id": "new-zoo-neither-approved",
        "label": "AGAINST BOTH Initiative No. 12 AND Alternative Measure 12 A"
      },
      "firstOption": {
        "id": "new-zoo-safari",
        "label": "FOR Initiative No. 12"
      },
      "secondOption": {
        "id": "new-zoo-traditional",
        "label": "FOR Alternative Measure No. 12 A"
      }
    },
    {
      "id": "fishing",
      "section": "City",
      "districtId": "district-1",
      "type": "yesno",
      "title": "Ballot Measure 3",
      "partyId": "1",
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
  "sealURL": "/seals/Sample-Seal.svg"
}`
export const electionMinimalExhaustive: Election = safeParseElection(
  electionMinimalExhaustiveData
).unsafeUnwrap()
