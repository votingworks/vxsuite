import { Election } from '../src/election'

export const election: Election = {
  title: 'ELECTION',
  ballotStyles: [
    {
      id: '1',
      districts: ['D'],
      precincts: ['P'],
    },
  ],
  districts: [{ id: 'D', name: 'DISTRICT' }],
  contests: [
    {
      type: 'candidate',
      id: 'CC',
      districtId: 'D',
      seats: 1,
      section: 'SECTION',
      title: 'TITLE',
      allowWriteIns: false,
      candidates: [{ id: 'C', name: 'CANDIDATE' }],
    },
    {
      type: 'yesno',
      id: 'YNC',
      districtId: 'D',
      section: 'SECTION',
      title: 'TITLE',
      description: 'DESCRIPTION',
    },
  ],
  county: { id: 'COUNTY', name: 'COUNTY' },
  date: '2020-11-03T00:00:00-10:00',
  parties: [
    { id: 'PARTY', name: 'PARTY', abbrev: 'PTY', fullName: 'POLITICAL PARTY' },
  ],
  precincts: [{ id: 'P', name: 'PRECINCT' }],
  state: 'STATE',
}
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
