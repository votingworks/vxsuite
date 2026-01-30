import { describe, expect, test } from 'vitest';
import { assert } from '@votingworks/basics';
import {
  createTestElection,
  createElectionDefinition,
  createMockVotes,
} from './election_helpers';

describe('createTestElection', () => {
  test('creates an election with the specified number of candidate contests', () => {
    const election = createTestElection({
      numCandidateContests: 5,
      numYesNoContests: 0,
      candidatesPerContest: 3,
    });

    const candidateContests = election.contests.filter(
      (c) => c.type === 'candidate'
    );
    expect(candidateContests).toHaveLength(5);
  });

  test('creates an election with the specified number of yes/no contests', () => {
    const election = createTestElection({
      numCandidateContests: 0,
      numYesNoContests: 4,
      candidatesPerContest: 2,
    });

    const yesNoContests = election.contests.filter((c) => c.type === 'yesno');
    expect(yesNoContests).toHaveLength(4);
  });

  test('creates candidate contests with the specified number of candidates', () => {
    const election = createTestElection({
      numCandidateContests: 2,
      numYesNoContests: 0,
      candidatesPerContest: 5,
    });

    const candidateContests = election.contests.filter(
      (c) => c.type === 'candidate'
    );
    for (const contest of candidateContests) {
      if (contest.type === 'candidate') {
        expect(contest.candidates).toHaveLength(5);
      }
    }
  });

  test('supports long candidate names', () => {
    const election = createTestElection({
      numCandidateContests: 1,
      numYesNoContests: 0,
      candidatesPerContest: 2,
      longCandidateNames: true,
    });

    const candidateContest = election.contests.find(
      (c) => c.type === 'candidate'
    );
    expect(candidateContest?.type).toEqual('candidate');
    if (candidateContest?.type === 'candidate') {
      expect(candidateContest.candidates[0]?.name).toContain(
        'Candidate With A Very Long Name'
      );
    }
  });

  test('supports long contest titles', () => {
    const election = createTestElection({
      numCandidateContests: 1,
      numYesNoContests: 1,
      candidatesPerContest: 2,
      longContestTitles: true,
    });

    const candidateContest = election.contests.find(
      (c) => c.type === 'candidate'
    );
    expect(candidateContest?.title).toContain(
      'Office of the Commissioner for Long Department Name'
    );

    const yesNoContest = election.contests.find((c) => c.type === 'yesno');
    expect(yesNoContest?.title).toContain(
      'Amendment to the State Constitution'
    );
  });

  test('supports long yes/no labels', () => {
    const election = createTestElection({
      numCandidateContests: 0,
      numYesNoContests: 1,
      candidatesPerContest: 2,
      longYesNoLabels: true,
    });

    const yesNoContest = election.contests.find((c) => c.type === 'yesno');
    expect(yesNoContest?.type).toEqual('yesno');
    if (yesNoContest?.type === 'yesno') {
      expect(yesNoContest.yesOption.label).toContain(
        'Yes, I approve of this proposition'
      );
      expect(yesNoContest.noOption.label).toContain(
        'No, I do not approve of this proposition'
      );
    }
  });

  test('creates a valid Election structure', () => {
    const election = createTestElection({
      numCandidateContests: 2,
      numYesNoContests: 2,
      candidatesPerContest: 3,
    });

    expect(election.id).toEqual('test-election');
    expect(election.type).toEqual('general');
    expect(election.title).toEqual(
      'Test Election for Multi-Page Summary Ballots'
    );
    expect(election.state).toEqual('Test State');
    expect(election.county.name).toEqual('Test County');
    expect(election.districts).toHaveLength(1);
    expect(election.precincts).toHaveLength(1);
    expect(election.ballotStyles).toHaveLength(1);
    expect(election.parties).toHaveLength(1);
    expect(election.contests).toHaveLength(4);
  });

  test('creates contests with correct district references', () => {
    const election = createTestElection({
      numCandidateContests: 1,
      numYesNoContests: 1,
      candidatesPerContest: 2,
    });

    const districtId = election.districts[0]?.id;
    for (const contest of election.contests) {
      expect(contest.districtId).toEqual(districtId);
    }
  });

  test('creates candidate contests with write-in support', () => {
    const election = createTestElection({
      numCandidateContests: 2,
      numYesNoContests: 0,
      candidatesPerContest: 2,
    });

    const candidateContests = election.contests.filter(
      (c) => c.type === 'candidate'
    );
    for (const contest of candidateContests) {
      if (contest.type === 'candidate') {
        expect(contest.allowWriteIns).toEqual(true);
      }
    }
  });
});

describe('createElectionDefinition', () => {
  test('creates a valid ElectionDefinition from an Election', () => {
    const election = createTestElection({
      numCandidateContests: 2,
      numYesNoContests: 1,
      candidatesPerContest: 3,
    });

    const electionDefinition = createElectionDefinition(election);

    expect(electionDefinition.election).toEqual(election);
    expect(electionDefinition.ballotHash).toBeDefined();
    expect(electionDefinition.ballotHash.length).toBeGreaterThan(0);
    expect(electionDefinition.electionData).toBeDefined();
  });

  test('creates an ElectionDefinition with parseable election data', () => {
    const election = createTestElection({
      numCandidateContests: 1,
      numYesNoContests: 1,
      candidatesPerContest: 2,
    });

    const electionDefinition = createElectionDefinition(election);

    const parsedElection = JSON.parse(electionDefinition.electionData);
    expect(parsedElection.id).toEqual(election.id);
    expect(parsedElection.title).toEqual(election.title);
  });
});

describe('createMockVotes', () => {
  test('creates votes for all contests when no filter is provided', () => {
    const election = createTestElection({
      numCandidateContests: 2,
      numYesNoContests: 2,
      candidatesPerContest: 3,
    });

    const votes = createMockVotes([...election.contests]);

    expect(Object.keys(votes)).toHaveLength(4);
    for (const contest of election.contests) {
      expect(votes[contest.id]).toBeDefined();
    }
  });

  test('creates votes only for specified contests when filter is provided', () => {
    const election = createTestElection({
      numCandidateContests: 3,
      numYesNoContests: 2,
      candidatesPerContest: 3,
    });

    const contestIds = ['candidate-contest-0', 'yesno-contest-1'];
    const votes = createMockVotes([...election.contests], contestIds);

    expect(Object.keys(votes)).toHaveLength(2);
    expect(votes['candidate-contest-0']).toBeDefined();
    expect(votes['yesno-contest-1']).toBeDefined();
    expect(votes['candidate-contest-1']).toBeUndefined();
    expect(votes['candidate-contest-2']).toBeUndefined();
    expect(votes['yesno-contest-0']).toBeUndefined();
  });

  test('selects candidates up to the seats count for candidate contests', () => {
    const election = createTestElection({
      numCandidateContests: 1,
      numYesNoContests: 0,
      candidatesPerContest: 5,
    });

    // Default seats is 1
    const votes = createMockVotes([...election.contests]);
    const candidateContest = election.contests[0];
    assert(candidateContest !== undefined);

    expect(Array.isArray(votes[candidateContest.id])).toEqual(true);
    expect(votes[candidateContest.id]).toHaveLength(1);
  });

  test('selects the yes option for yes/no contests', () => {
    const election = createTestElection({
      numCandidateContests: 0,
      numYesNoContests: 2,
      candidatesPerContest: 2,
    });

    const votes = createMockVotes([...election.contests]);

    for (const contest of election.contests) {
      if (contest.type === 'yesno') {
        expect(votes[contest.id]).toEqual([contest.yesOption.id]);
      }
    }
  });

  test('returns empty object when no contests match filter', () => {
    const election = createTestElection({
      numCandidateContests: 2,
      numYesNoContests: 1,
      candidatesPerContest: 2,
    });

    const votes = createMockVotes(
      [...election.contests],
      ['nonexistent-contest']
    );

    expect(Object.keys(votes)).toHaveLength(0);
  });

  test('returns empty object for empty contests array', () => {
    const votes = createMockVotes([]);

    expect(Object.keys(votes)).toHaveLength(0);
  });
});
