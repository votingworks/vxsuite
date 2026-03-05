import { expect, test } from 'vitest';
import { Election } from '@votingworks/types';
import { injectStraightPartyContest } from './straight_party';

const BASE_ELECTION: Election = {
  title: 'Test General Election',
  state: 'Test State',
  county: { id: 'county-1', name: 'Test County' },
  date: '2024-11-05',
  type: 'general',
  seal: '',
  ballotLayout: { paperSize: 'letter', metadataEncoding: 'qr-code' },
  parties: [
    { id: 'dem', name: 'Democrat', fullName: 'Democratic Party', abbrev: 'D' },
    {
      id: 'rep',
      name: 'Republican',
      fullName: 'Republican Party',
      abbrev: 'R',
    },
  ],
  precincts: [{ id: 'p1', name: 'Precinct 1' }],
  districts: [{ id: 'd1', name: 'District 1' }],
  ballotStyles: [
    {
      id: 'bs1',
      groupId: 'bs1',
      precincts: ['p1'],
      districts: ['d1'],
    },
  ],
  ballotStrings: {},
  contests: [
    {
      id: 'president',
      type: 'candidate',
      title: 'President',
      districtId: 'd1',
      seats: 1,
      allowWriteIns: false,
      candidates: [
        { id: 'dem-pres', name: 'Dem', partyIds: ['dem'] },
        { id: 'rep-pres', name: 'Rep', partyIds: ['rep'] },
      ],
    },
  ],
} as unknown as Election;

test('injects SP contest for general election with parties and partisan candidates', () => {
  const result = injectStraightPartyContest(BASE_ELECTION);
  expect(result.contests[0]).toEqual({
    id: 'straight-party-ticket',
    type: 'straight-party',
    title: 'Straight Party Ticket',
  });
  expect(result.contests).toHaveLength(2);
});

test('does not inject for primary elections', () => {
  const election = { ...BASE_ELECTION, type: 'primary' } as unknown as Election;
  const result = injectStraightPartyContest(election);
  expect(result.contests).toHaveLength(1);
  expect(result.contests[0].type).toEqual('candidate');
});

test('does not inject when no parties defined', () => {
  const election = { ...BASE_ELECTION, parties: [] } as unknown as Election;
  const result = injectStraightPartyContest(election);
  expect(result.contests).toHaveLength(1);
});

test('does not inject when no candidates have party affiliations', () => {
  const election = {
    ...BASE_ELECTION,
    contests: [
      {
        id: 'nonpartisan',
        type: 'candidate',
        title: 'Nonpartisan Race',
        districtId: 'd1',
        seats: 1,
        allowWriteIns: false,
        candidates: [{ id: 'alice', name: 'Alice' }],
      },
    ],
  } as unknown as Election;
  const result = injectStraightPartyContest(election);
  expect(result.contests).toHaveLength(1);
});

test('does not inject when SP contest already exists', () => {
  const election = {
    ...BASE_ELECTION,
    contests: [
      { id: 'existing-sp', type: 'straight-party', title: 'SP' },
      ...BASE_ELECTION.contests,
    ],
  } as unknown as Election;
  const result = injectStraightPartyContest(election);
  expect(result.contests).toHaveLength(2);
  expect(result.contests[0].id).toEqual('existing-sp');
});

test('SP contest is prepended (first in list)', () => {
  const result = injectStraightPartyContest(BASE_ELECTION);
  expect(result.contests[0].type).toEqual('straight-party');
  expect(result.contests[1].type).toEqual('candidate');
});
