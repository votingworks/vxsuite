// The fixtures below mirror NH's AVSInterface JSON, whose field names (CX, CY,
// OX, OY) are two-letter abbreviations we don't control.
/* eslint-disable vx/gts-identifiers */
import { expect, test } from 'vitest';
import {
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import {
  convertNhElection,
  NhBallotStyle,
} from '../scripts/convert_nh_election';

// Minimal NH ballot-style fixtures. Only the fields convertNhElection reads
// carry meaningful values; the rest satisfy the schema with dummies.

function candidate(name: string) {
  return {
    Name: name,
    Pronunciation: '',
    CX: 0,
    CY: 0,
    OX: 0,
    OY: 0,
    City: '',
    State: 'NH',
  };
}

function contestInfo(title: string, candidateNames: string[], seats = 1) {
  return {
    OfficeName: {
      Name: title,
      Pronunciation: '',
      CX: 0,
      CY: 0,
      WinnerNote:
        seats === 1
          ? 'Vote for not more than 1'
          : `Vote for up to ${seats};X will be elected`,
    },
    CandidateName: candidateNames.map(candidate),
    WriteIn: { OX: 0, OY: 0, City: '', State: 'NH' },
  };
}

function makeBallotStyle(
  ward: number,
  party: string,
  contests: Array<ReturnType<typeof contestInfo>>
): NhBallotStyle {
  return {
    fileType: '',
    version: '',
    encoding: '',
    AVSInterface: {
      HeaderInfo: {
        ElectionDate: 'September 8, 2026',
        ElectionName: 'STATE PRIMARY ELECTION',
        TownName: 'DOVER',
        WardName: ward,
        PartyName: party,
        TownID: '1',
        PrecinctID: '1',
        ElectionID: '1',
        BallotType: '',
        BallotSize: '8.5x11',
      },
      Candidates: contests,
    },
  };
}

function renderedTitlesForWard(
  election: ReturnType<typeof convertNhElection>,
  ward: string
): string[] {
  const ballotStyle = assertDefined(
    election.ballotStyles.find(
      (bs) =>
        assertDefined(election.precincts.find((p) => p.id === bs.precincts[0]))
          .name === ward
    )
  );
  return getContests({ election, ballotStyle }).map((c) => c.title);
}

function ballotStyleForWard(
  election: ReturnType<typeof convertNhElection>,
  ward: string
) {
  return assertDefined(
    election.ballotStyles.find(
      (bs) =>
        assertDefined(election.precincts.find((p) => p.id === bs.precincts[0]))
          .name === ward
    )
  );
}

// The offices shared verbatim across every ward: statewide, the floterial
// state-rep district, and the county races. Using identical candidate lists
// keeps each of these a single canonical contest shared by all wards.
function governor() {
  return contestInfo('For Governor', ['Gina', 'Greg']);
}
function floterialRep() {
  return contestInfo(
    'For State Representatives Strafford District 21',
    ['Al', 'Bo'],
    3
  );
}
function sheriff() {
  return contestInfo('For Sheriff', ['Sam']);
}
function countyCommissioner() {
  return contestInfo('For County Commissioner', ['Cam']);
}

test('renders each ward in its source order despite shared floterial districts', () => {
  // Mirrors the Dover bug: each ward has its own state-rep district plus the
  // shared District 21. Ward 1 is processed first, so first-seen insertion
  // order would strand every later ward's own district after the county races.
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    governor(),
    contestInfo('For State Representative Strafford District 14', ['Dan']),
    floterialRep(),
    sheriff(),
    countyCommissioner(),
  ]);
  const ward2 = makeBallotStyle(2, 'DEMOCRATIC', [
    governor(),
    contestInfo('For State Representative Strafford District 15', ['Eve']),
    floterialRep(),
    sheriff(),
    countyCommissioner(),
  ]);
  // Like Dover Ward 4: two own districts, no shared floterial, both new.
  const ward4 = makeBallotStyle(4, 'DEMOCRATIC', [
    governor(),
    contestInfo('For State Representatives Strafford District 11', ['Fay'], 2),
    contestInfo('For State Representative Strafford District 20', ['Gus']),
    sheriff(),
    countyCommissioner(),
  ]);

  const election = convertNhElection([ward1, ward2, ward4]);

  // Each ward renders exactly its source-file order -- own state-rep district(s)
  // before the county races, not stranded after them.
  expect(renderedTitlesForWard(election, 'Ward 2')).toEqual([
    'For Governor',
    'For State Representative Strafford District 15',
    'For State Representatives Strafford District 21',
    'For Sheriff',
    'For County Commissioner',
  ]);
  expect(renderedTitlesForWard(election, 'Ward 4')).toEqual([
    'For Governor',
    'For State Representatives Strafford District 11',
    'For State Representative Strafford District 20',
    'For Sheriff',
    'For County Commissioner',
  ]);
});

test('preserves seats, write-ins, and each ward’s own candidate rotation', () => {
  // NH bakes candidate rotation into each ward file (RSA 656): both wards share
  // the same county commissioner contest but list its candidates rotated.
  const ward1 = makeBallotStyle(1, 'REPUBLICAN', [
    contestInfo('For County Commissioner', ['Ann', 'Bea', 'Cy'], 2),
  ]);
  const ward2 = makeBallotStyle(2, 'REPUBLICAN', [
    contestInfo('For County Commissioner', ['Bea', 'Cy', 'Ann'], 2),
  ]);

  const election = convertNhElection([ward1, ward2]);

  const contest = assertDefined(
    election.contests.find((c) => c.title === 'For County Commissioner')
  );
  assert(contest.type === 'candidate');
  expect(contest.seats).toEqual(2);
  expect(contest.allowWriteIns).toEqual(true);

  // One shared canonical contest, but each ward keeps its own rotation order.
  function rotation(ward: string): string[] {
    return getOrderedCandidatesForContestInBallotStyle({
      contest,
      ballotStyle: ballotStyleForWard(election, ward),
    }).map((c) => c.name);
  }
  expect(rotation('Ward 1')).toEqual(['Ann', 'Bea', 'Cy']);
  expect(rotation('Ward 2')).toEqual(['Bea', 'Cy', 'Ann']);
});

test('throws when a source file lists the same office twice', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [sheriff(), sheriff()]);

  expect(() => convertNhElection([ward1])).toThrow(/source file has/);
});

test('throws when source files disagree on the relative order of two contests', () => {
  // Both offices are shared (identical candidates), so they are the same two
  // contests in both wards -- listed in opposite order, which no single global
  // order can satisfy.
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    sheriff(),
    countyCommissioner(),
  ]);
  const ward2 = makeBallotStyle(2, 'DEMOCRATIC', [
    countyCommissioner(),
    sheriff(),
  ]);

  expect(() => convertNhElection([ward1, ward2])).toThrow(
    /disagree on contest ordering/
  );
});
