import { describe, expect, test } from 'vitest';
import {
  CandidateContest,
  Election,
  StraightPartyContest,
  Tabulation,
  YesNoContest,
} from '@votingworks/types';
import { applyStraightPartyRules } from './straight_party';

const straightPartyContest: StraightPartyContest = {
  id: 'straight-party-ticket',
  type: 'straight-party',
  title: 'Straight Party',
};

const governorContest: CandidateContest = {
  id: 'governor',
  type: 'candidate',
  title: 'Governor',
  districtId: 'district-1',
  seats: 1,
  allowWriteIns: true,
  candidates: [
    { id: 'alice', name: 'Alice', partyIds: ['dem'] },
    { id: 'bob', name: 'Bob', partyIds: ['rep'] },
  ],
};

const councilContest: CandidateContest = {
  id: 'council',
  type: 'candidate',
  title: 'City Council',
  districtId: 'district-1',
  seats: 3,
  allowWriteIns: false,
  candidates: [
    { id: 'carol', name: 'Carol', partyIds: ['dem'] },
    { id: 'dave', name: 'Dave', partyIds: ['dem'] },
    { id: 'eve', name: 'Eve', partyIds: ['rep'] },
    { id: 'frank', name: 'Frank', partyIds: ['rep'] },
  ],
};

const ballotMeasure: YesNoContest = {
  id: 'measure-1',
  type: 'yesno',
  title: 'Ballot Measure 1',
  districtId: 'district-1',
  description: 'A ballot measure',
  yesOption: { id: 'yes', label: 'Yes' },
  noOption: { id: 'no', label: 'No' },
};

const nonpartisanContest: CandidateContest = {
  id: 'judge',
  type: 'candidate',
  title: 'Judge',
  districtId: 'district-1',
  seats: 1,
  allowWriteIns: false,
  candidates: [
    { id: 'gary', name: 'Gary' },
    { id: 'heidi', name: 'Heidi' },
  ],
};

const election: Election = {
  type: 'general',
  title: 'Test Election',
  date: '2026-11-03T00:00:00Z',
  state: 'State',
  county: { id: 'county-1', name: 'County' },
  seal: '',
  ballotLayout: { paperSize: 'letter', metadataEncoding: 'qr-code' },
  districts: [{ id: 'district-1', name: 'District 1' }],
  precincts: [{ id: 'precinct-1', name: 'Precinct 1' }],
  parties: [
    { id: 'dem', name: 'Democrat', fullName: 'Democratic Party', abbrev: 'D' },
    {
      id: 'rep',
      name: 'Republican',
      fullName: 'Republican Party',
      abbrev: 'R',
    },
  ],
  contests: [
    straightPartyContest,
    governorContest,
    councilContest,
    ballotMeasure,
    nonpartisanContest,
  ],
  ballotStyles: [
    {
      id: 'ballot-style-1',
      groupId: 'group-1',
      precincts: ['precinct-1'],
      districts: ['district-1'],
    },
  ],
} as unknown as Election;

describe('applyStraightPartyRules', () => {
  test('no straight party contest in election', () => {
    const electionWithout = {
      ...election,
      contests: election.contests.filter((c) => c.type !== 'straight-party'),
    } as unknown as Election;
    const votes: Tabulation.Votes = { governor: ['alice'] };
    expect(applyStraightPartyRules(electionWithout, votes)).toEqual(votes);
  });

  test('no straight party vote', () => {
    const votes: Tabulation.Votes = { governor: ['alice'] };
    expect(applyStraightPartyRules(election, votes)).toEqual(votes);
  });

  test('empty straight party vote', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': [],
      governor: ['alice'],
    };
    expect(applyStraightPartyRules(election, votes)).toEqual(votes);
  });

  test('overvoted straight party vote', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem', 'rep'],
      governor: [],
    };
    expect(applyStraightPartyRules(election, votes)).toEqual(votes);
  });

  test('single-seat contest — fills with party candidate', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      governor: [],
      council: [],
    };
    const result = applyStraightPartyRules(election, votes);
    expect(result.governor).toEqual(['alice']);
  });

  test('multi-seat contest — fills all party candidates if they fit', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      governor: [],
      council: [],
    };
    const result = applyStraightPartyRules(election, votes);
    // 2 dem candidates (carol, dave) fit in 3 seats
    expect(result.council).toEqual(['carol', 'dave']);
  });

  test('voter already voted for party candidate — no duplicate', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      governor: ['alice'],
    };
    const result = applyStraightPartyRules(election, votes);
    expect(result.governor).toEqual(['alice']);
  });

  test('voter voted cross-party — party fills remaining seats', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      council: ['eve'],
    };
    const result = applyStraightPartyRules(election, votes);
    // Eve (rep) is already selected, 2 remaining seats, 2 dem candidates fit
    expect(result.council).toEqual(['eve', 'carol', 'dave']);
  });

  test('more party candidates than open seats — no expansion', () => {
    // Create a contest where the party has more candidates than open seats
    const tightContest: CandidateContest = {
      id: 'tight',
      type: 'candidate',
      title: 'Tight Race',
      districtId: 'district-1',
      seats: 1,
      allowWriteIns: false,
      candidates: [
        { id: 'c1', name: 'C1', partyIds: ['dem'] },
        { id: 'c2', name: 'C2', partyIds: ['dem'] },
        { id: 'c3', name: 'C3', partyIds: ['rep'] },
      ],
    };
    const tightElection = {
      ...election,
      contests: [straightPartyContest, tightContest],
    } as unknown as Election;

    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      tight: [],
    };
    const result = applyStraightPartyRules(tightElection, votes);
    // 2 dem candidates, 1 seat — ambiguous, don't expand
    expect(result.tight).toEqual([]);
  });

  test('contest with no party candidates — unchanged', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      judge: [],
    };
    const result = applyStraightPartyRules(election, votes);
    expect(result.judge).toEqual([]);
  });

  test('write-in slots are not affected by expansion', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      governor: ['write-in-0'],
    };
    const result = applyStraightPartyRules(election, votes);
    // Governor has 1 seat, voter wrote in — no expansion
    expect(result.governor).toEqual(['write-in-0']);
  });

  test('ballot measure is unaffected', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      'measure-1': ['yes'],
      governor: [],
    };
    const result = applyStraightPartyRules(election, votes);
    expect(result['measure-1']).toEqual(['yes']);
    expect(result.governor).toEqual(['alice']);
  });

  test('voter filled all seats — no expansion needed', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['dem'],
      council: ['carol', 'eve', 'frank'],
    };
    const result = applyStraightPartyRules(election, votes);
    expect(result.council).toEqual(['carol', 'eve', 'frank']);
  });

  test('partial cross-party with remaining seats for party expansion', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['rep'],
      council: ['carol'],
    };
    const result = applyStraightPartyRules(election, votes);
    // Carol (dem) is selected, 2 remaining seats, 2 rep candidates (eve, frank) fit
    expect(result.council).toEqual(['carol', 'eve', 'frank']);
  });
});
