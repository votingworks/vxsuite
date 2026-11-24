import { expect, test } from 'vitest';
import {
  type BallotStyle,
  type District,
  LanguageCode,
  type Party,
  type YesNoContest,
} from '@votingworks/types';
import {
  generateStraightPartyContest,
  hasDuplicateOptionLabels,
} from './contests.js';

const contest: YesNoContest = {
  id: 'measure',
  type: 'yesno',
  title: 'Measure 1',
  districtId: 'district-1',
  description: 'Should we?',
  options: [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ],
};

test('hasDuplicateOptionLabels', () => {
  expect(hasDuplicateOptionLabels(contest)).toEqual(false);
  expect(
    hasDuplicateOptionLabels({
      ...contest,
      options: [...contest.options, { id: 'abstain', label: 'Yes' }],
    })
  ).toEqual(true);
});

const districts: District[] = [
  { id: 'district-1', name: 'District 1' },
  { id: 'district-2', name: 'District 2' },
];

const parties: Party[] = [
  { id: 'party-1', name: 'Party 1', fullName: 'Party 1', abbrev: 'P1' },
  { id: 'party-2', name: 'Party 2', fullName: 'Party 2', abbrev: 'P2' },
];

function ballotStyle(id: string, districtIds: string[]): BallotStyle {
  return {
    id,
    groupId: id,
    precincts: ['precinct-1'],
    districts: districtIds,
    languages: [LanguageCode.ENGLISH],
  };
}

test('generateStraightPartyContest uses a district on every ballot style', () => {
  expect(
    generateStraightPartyContest({
      electionId: 'election-1',
      districts,
      parties,
      ballotStyles: [
        ballotStyle('1', ['district-1', 'district-2']),
        ballotStyle('2', ['district-2']),
      ],
    })
  ).toEqual({
    id: 'election-1-straight-party-contest',
    type: 'straight-party',
    title: 'Straight Party Ticket',
    districtId: 'district-2',
    optionIds: ['party-1', 'party-2'],
  });
});

test('generateStraightPartyContest needs a district on every ballot style', () => {
  expect(
    generateStraightPartyContest({
      electionId: 'election-1',
      districts,
      parties,
      ballotStyles: [
        ballotStyle('1', ['district-1']),
        ballotStyle('2', ['district-2']),
      ],
    })
  ).toEqual(undefined);
});
