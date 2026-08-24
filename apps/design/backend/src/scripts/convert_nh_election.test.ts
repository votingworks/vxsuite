/* eslint-disable vx/gts-identifiers */
import { expect, test } from 'vitest';
import {
  CandidateContest,
  getContests,
  getOrderedCandidatesForContestInBallotStyle,
  HmpbBallotPaperSize,
  safeParseElection,
} from '@votingworks/types';
import { assert, assertDefined } from '@votingworks/basics';
import { convertNhElection, NhBallotStyle } from './convert_nh_election.js';

const testSignatureImage = '<svg><text>Test Signature</text></svg>';

function candidate(name: string | string[], party?: string) {
  return {
    Name: name,
    Party: party,
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
    CandidateName: candidateNames.map((name) => candidate(name)),
    WriteIn: { OX: 0, OY: 0, City: '', State: 'NH' },
  };
}

function makeBallotStyle(
  ward: number | string,
  party: string,
  contests: NhBallotStyle['AVSInterface']['Candidates']
): NhBallotStyle {
  return {
    fileType: '',
    version: '',
    encoding: '',
    AVSInterface: {
      HeaderInfo: {
        ElectionDate: 'September 8, 2026',
        ElectionName: 'STATE PRIMARY ELECTION',
        TownName: 'SAMPLE CITY',
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

function contestTitlesForWard(
  election: ReturnType<typeof convertNhElection>,
  ward: string
): string[] {
  return getContests({
    election,
    ballotStyle: ballotStyleForWard(election, ward),
  }).map((c) => c.title);
}

function governor() {
  return contestInfo('For Governor', ['Gina', 'Greg']);
}
function sharedRep() {
  return contestInfo(
    'For State Representatives Sample District 21',
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

test('converts a multi-ward primary election', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    governor(),
    contestInfo('For State Representative Sample District 14', ['Dan']),
    sharedRep(),
    sheriff(),
    countyCommissioner(),
  ]);
  const ward2 = makeBallotStyle(2, 'DEMOCRATIC', [
    governor(),
    contestInfo('For State Representative Sample District 15', ['Eve']),
    sharedRep(),
    sheriff(),
    countyCommissioner(),
  ]);
  // Ward 4 has two districts of its own and skips the shared district.
  const ward4 = makeBallotStyle(4, 'DEMOCRATIC', [
    governor(),
    contestInfo('For State Representatives Sample District 11', ['Fay'], 2),
    contestInfo('For State Representative Sample District 20', ['Gus']),
    sheriff(),
    countyCommissioner(),
  ]);

  const election = convertNhElection([ward1, ward2, ward4], testSignatureImage);

  safeParseElection(JSON.stringify(election)).unsafeUnwrap();

  expect(election.signature).toEqual({
    image: testSignatureImage,
    caption: 'Secretary of State',
  });

  expect(election.date.toISOString()).toEqual('2026-09-08');

  // Contest order is preserved for each ward's ballot styles
  expect(contestTitlesForWard(election, 'Ward 2')).toEqual([
    'For Governor',
    'For State Representative Sample District 15',
    'For State Representatives Sample District 21',
    'For Sheriff',
    'For County Commissioner',
  ]);
  expect(contestTitlesForWard(election, 'Ward 4')).toEqual([
    'For Governor',
    'For State Representatives Sample District 11',
    'For State Representative Sample District 20',
    'For Sheriff',
    'For County Commissioner',
  ]);
});

test('splits a contest into separate districts when wards have differing candidate slates', () => {
  // "For County Commissioner" has the same title in every ward's file, but
  // wards 1 and 3 have different candidates than ward 2, meaning they should be
  // in a different district.
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    contestInfo('For County Commissioner', ['Cam']),
  ]);
  const ward2 = makeBallotStyle(2, 'DEMOCRATIC', [
    contestInfo('For County Commissioner', ['Kim']),
  ]);
  const ward3 = makeBallotStyle(3, 'DEMOCRATIC', [
    contestInfo('For County Commissioner', ['Cam']),
  ]);

  const election = convertNhElection([ward1, ward2, ward3], testSignatureImage);

  expect(
    election.contests.map((contest) => ({
      title: contest.title,
      district: assertDefined(
        election.districts.find((d) => d.id === contest.districtId)
      ).name,
    }))
  ).toEqual([
    { title: 'For County Commissioner', district: 'Wards 1, 3' },
    { title: 'For County Commissioner', district: 'Ward 2' },
  ]);

  for (const [ward, expectedCandidates] of [
    ['Ward 1', ['Cam']],
    ['Ward 2', ['Kim']],
    ['Ward 3', ['Cam']],
  ] as const) {
    const contests = getContests({
      election,
      ballotStyle: ballotStyleForWard(election, ward),
    });
    expect(contests).toHaveLength(1);
    assert(contests[0].type === 'candidate');
    expect(contests[0].candidates.map((c) => c.name)).toEqual(
      expectedCandidates
    );
  }
});

test('converts a town general election', () => {
  const town = makeBallotStyle('', '', [
    {
      ...contestInfo('For Governor', []),
      CandidateName: [
        candidate('Gina', 'Democratic'),
        candidate('Greg', 'Republican'),
      ],
    },
  ]);

  const election = convertNhElection([town], testSignatureImage);

  expect(election.type).toEqual('general');
  expect(election.precincts.map((p) => p.name)).toEqual(['Sample City']);
  expect(election.ballotStyles).toHaveLength(1);
  expect(election.ballotStyles[0].partyId).toBeUndefined();

  const contest = election.contests[0];
  assert(contest.type === 'candidate');
  expect(
    contest.candidates.map((c) => ({
      name: c.name,
      party: assertDefined(
        election.parties.find((p) => p.id === assertDefined(c.partyIds)[0])
      ).name,
    }))
  ).toEqual([
    { name: 'Gina', party: 'Democratic' },
    { name: 'Greg', party: 'Republican' },
  ]);
});

test('calculates ballot style districts across precincts/parties', () => {
  const dem = makeBallotStyle(1, 'DEMOCRATIC', [
    contestInfo('For Sheriff', ['Ann']),
    contestInfo('For Delegates to the State Convention', ['Bea', 'Cy'], 2),
  ]);
  const rep = makeBallotStyle(1, 'REPUBLICAN', [
    contestInfo('For Sheriff', ['Dee']),
  ]);

  const election = convertNhElection([dem, rep], testSignatureImage);

  // A ballot style's districts list is the union of all districts in its
  // precinct
  const precinct = election.precincts[0];
  assert('districtIds' in precinct);
  expect(precinct.districtIds).toHaveLength(2);
  for (const ballotStyle of election.ballotStyles) {
    expect([...ballotStyle.districts].sort()).toEqual(
      [...precinct.districtIds].sort()
    );
  }

  // Each ballot style only has contests for its own party
  const repParty = assertDefined(
    election.parties.find((party) => party.name === 'Republican')
  );
  const repBallotStyle = assertDefined(
    election.ballotStyles.find((bs) => bs.partyId === repParty.id)
  );
  expect(
    getContests({ election, ballotStyle: repBallotStyle }).map((c) => c.title)
  ).toEqual(['For Sheriff']);
});

test('converts contests correctly, including each ward’s own candidate rotation', () => {
  const ward1 = makeBallotStyle(1, 'REPUBLICAN', [
    contestInfo('For County Commissioner', ['Ann', 'Bea', 'Cy'], 2),
  ]);
  const ward2 = makeBallotStyle(2, 'REPUBLICAN', [
    contestInfo('For County Commissioner', ['Bea', 'Cy', 'Ann'], 2),
  ]);

  const election = convertNhElection([ward1, ward2], testSignatureImage);

  const contest = assertDefined(
    election.contests.find(
      (c): c is CandidateContest =>
        c.type === 'candidate' && c.title === 'For County Commissioner'
    )
  );
  expect(contest.seats).toEqual(2);
  expect(contest.allowWriteIns).toEqual(true);

  function rotation(ward: string): string[] {
    return getOrderedCandidatesForContestInBallotStyle({
      contest,
      ballotStyle: ballotStyleForWard(election, ward),
    }).map((c) => c.name);
  }
  expect(rotation('Ward 1')).toEqual(['Ann', 'Bea', 'Cy']);
  expect(rotation('Ward 2')).toEqual(['Bea', 'Cy', 'Ann']);
});

test('normalizes whitespace when matching candidate names across files', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    contestInfo('For Sheriff', ['Ann  Smith']),
  ]);
  const ward2 = makeBallotStyle(2, 'DEMOCRATIC', [
    contestInfo('For Sheriff', ['Ann Smith']),
  ]);

  const election = convertNhElection([ward1, ward2], testSignatureImage);

  expect(election.contests).toHaveLength(1);
  const contest = election.contests[0];
  assert(contest.type === 'candidate');
  expect(contest.candidates.map((c) => c.name)).toEqual(['Ann Smith']);
});

test('throws when wards have overlapping but differing candidate lists for an office', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    contestInfo('For County Commissioner', ['Ann Smith', 'Bea Jones']),
  ]);
  const ward2 = makeBallotStyle(2, 'DEMOCRATIC', [
    contestInfo('For County Commissioner', ['Ann Smith', 'Bee Jones']),
  ]);

  expect(() => convertNhElection([ward1, ward2], testSignatureImage)).toThrow(
    /overlapping candidate lists/
  );
});

test('throws when two source files cover the same party and ward', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [sheriff()]);
  const ward1Again = makeBallotStyle(1, 'DEMOCRATIC', [sheriff()]);

  expect(() =>
    convertNhElection([ward1, ward1Again], testSignatureImage)
  ).toThrow(/Multiple source files for the same \(party, ward\)/);

  const ward1Denormalized = makeBallotStyle('1', 'Democratic', [sheriff()]);
  expect(() =>
    convertNhElection([ward1, ward1Denormalized], testSignatureImage)
  ).toThrow(/Multiple source files for the same \(party, ward\)/);
});

test('throws when source files mix primary and general', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [sheriff()]);
  const ward2 = makeBallotStyle(2, '', [sheriff()]);

  expect(() => convertNhElection([ward1, ward2], testSignatureImage)).toThrow(
    /all primary or all general/
  );
});

test('joins multi-line candidate names', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    {
      ...contestInfo('For Governor', []),
      CandidateName: [candidate(['Jane Smith', 'John Doe'])],
    },
  ]);

  const election = convertNhElection([ward1], testSignatureImage);

  const contest = election.contests[0];
  assert(contest.type === 'candidate');
  expect(contest.candidates.map((c) => c.name)).toEqual([
    'Jane Smith<br/>John Doe',
  ]);
});

test('converts a contest with no declared candidates (write-ins only)', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    { ...contestInfo('For Auditor', []), CandidateName: undefined },
  ]);

  const election = convertNhElection([ward1], testSignatureImage);

  const contest = election.contests[0];
  assert(contest.type === 'candidate');
  expect(contest.candidates).toEqual([]);
  expect(contest.allowWriteIns).toEqual(true);
});

test('maps ballot sizes to paper sizes and rejects unknown sizes', () => {
  const legal = makeBallotStyle(1, 'DEMOCRATIC', [sheriff()]);
  legal.AVSInterface.HeaderInfo.BallotSize = '8.5x14';
  expect(
    convertNhElection([legal], testSignatureImage).ballotLayout.paperSize
  ).toEqual(HmpbBallotPaperSize.Legal);

  const unknown = makeBallotStyle(1, 'DEMOCRATIC', [sheriff()]);
  unknown.AVSInterface.HeaderInfo.BallotSize = '11x17';
  expect(() => convertNhElection([unknown], testSignatureImage)).toThrow(
    /Unsupported ballot size: 11x17/
  );
});

test('throws when wards disagree on an office’s seat count', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    contestInfo('For County Commissioner', ['Cam'], 1),
  ]);
  const ward2 = makeBallotStyle(2, 'DEMOCRATIC', [
    contestInfo('For County Commissioner', ['Cam'], 2),
  ]);

  expect(() => convertNhElection([ward1, ward2], testSignatureImage)).toThrow(
    /seat count differs/
  );
});

test('throws when a source file lists the same office twice', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [sheriff(), sheriff()]);

  expect(() => convertNhElection([ward1], testSignatureImage)).toThrow(
    /source file lists "For Sheriff" twice/
  );
});

test('throws when a candidate is listed with different parties across files', () => {
  function governorContest(party: string) {
    return {
      ...contestInfo('For Governor', []),
      CandidateName: [candidate('Ann Smith', party)],
    };
  }
  const ward1 = makeBallotStyle(1, '', [governorContest('Democratic')]);
  const ward2 = makeBallotStyle(2, '', [governorContest('Republican')]);

  expect(() => convertNhElection([ward1, ward2], testSignatureImage)).toThrow(
    /"Ann Smith" is listed with different parties/
  );
});

test('throws when source files disagree on the relative order of two contests', () => {
  const ward1 = makeBallotStyle(1, 'DEMOCRATIC', [
    sheriff(),
    countyCommissioner(),
  ]);
  const ward2 = makeBallotStyle(2, 'DEMOCRATIC', [
    countyCommissioner(),
    sheriff(),
  ]);

  expect(() => convertNhElection([ward1, ward2], testSignatureImage)).toThrow(
    /Cycle detected/
  );
});
