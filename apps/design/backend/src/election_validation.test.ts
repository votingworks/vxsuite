import { test, expect } from 'vitest';
import { Election, ElectionId, HmpbBallotPaperSize } from '@votingworks/types';
import { BallotTemplateId } from '@votingworks/hmpb';
import { DateWithoutTime } from '@votingworks/basics';
import { validateElectionForExport } from './election_validation';

function baseElection(): Election {
  return ({
    id: 'e1' as ElectionId,
    type: 'general',
    title: 'Title',
    date: new DateWithoutTime('2026-01-01'),
    state: 'ST',
    county: { id: 'c', name: 'County' },
    seal: 'SEAL',
    districts: [{ id: 'd1', name: 'D1' }],
    precincts: [{ id: 'p1', name: 'P1', splits: [] }],
    contests: [{ id: 'c1', title: 'Contest 1', type: 'candidate', seats: 1, candidates: [], allowWriteIns: false, districtId: 'd1' }],
    parties: [],
    ballotStyles: [{ id: 'bs1', partyId: undefined, districts: ['d1'], groupId: 'bg1', precincts: ['p1'] }],
    ballotLayout: { paperSize: HmpbBallotPaperSize.Letter, metadataEncoding: 'qr-code' },
    ballotStrings: {},
  })
};

test('no blockers for valid election', () => {
  const election = baseElection();
  const blockers = validateElectionForExport(
    election,
    undefined as BallotTemplateId | undefined, 
  );
  expect(blockers).toEqual([]);
});

test('missing signature for NH ballot', () => {
  const election: Election = {
    ...baseElection(),
    signature: undefined,
  };
  const blockers = validateElectionForExport(election, 'NhBallot');
  expect(blockers).toContain('missingSignature');
});

test('missing seal produces blocker', () => {
  const election: Election = {
    ...baseElection(),
    seal: '',
  };
  const blockers = validateElectionForExport(election, undefined);
  expect(blockers).toContain('missingSeal');
});

test('no districts/contests/precincts/ballotStyles produce blockers', () => {
  const election: Election = {
    ...baseElection(),
    districts: [],
    contests: [],
    precincts: [],
    ballotStyles: [],
  };
  const blockers = validateElectionForExport(election, undefined);
  expect(blockers).toEqual(expect.arrayContaining(['noDistricts', 'noContests', 'noPrecincts', 'noBallotStyles']));
});
