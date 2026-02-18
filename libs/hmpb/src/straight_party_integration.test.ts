import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  Election,
  safeParseElection,
  StraightPartyContest,
  Tabulation,
} from '@votingworks/types';
import { applyStraightPartyRules } from '@votingworks/utils';

function loadMiGeneralElection(): Election {
  const raw = readFileSync(
    join(__dirname, '../fixtures/mi-general.json'),
    'utf-8'
  );
  return safeParseElection(raw).unsafeUnwrap();
}

function injectStraightPartyContest(election: Election): Election {
  const straightPartyContest: StraightPartyContest = {
    id: 'straight-party-ticket',
    type: 'straight-party',
    title: 'Straight Party Ticket',
  };
  return {
    ...election,
    contests: [straightPartyContest, ...election.contests],
  };
}

describe('Michigan straight-party integration', () => {
  const baseElection = loadMiGeneralElection();
  const election = injectStraightPartyContest(baseElection);

  test('election has parties and partisan candidates', () => {
    expect(election.parties.length).toBeGreaterThan(0);
    expect(election.type).toBe('general');
    const straightPartyContest = election.contests.find(
      (c) => c.type === 'straight-party'
    );
    expect(straightPartyContest).toBeDefined();
  });

  test('Democratic straight-party vote fills all partisan contests', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['democratic'],
    };

    const expanded = applyStraightPartyRules(election, votes);

    // Should have the original straight-party vote
    expect(expanded['straight-party-ticket']).toEqual(['democratic']);

    // Check each partisan candidate contest
    for (const contest of election.contests) {
      if (contest.type !== 'candidate') continue;
      const demCandidates = contest.candidates.filter((c) =>
        c.partyIds?.includes('democratic')
      );
      if (demCandidates.length === 0) continue;

      // If the number of dem candidates fits within seats, they should all be selected
      if (demCandidates.length <= contest.seats) {
        const expandedVotes = expanded[contest.id];
        expect(expandedVotes).toBeDefined();
        for (const candidate of demCandidates) {
          expect(expandedVotes).toContain(candidate.id);
        }
      }
    }
  });

  test('straight-party vote does not affect nonpartisan contests', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['republican'],
    };

    const expanded = applyStraightPartyRules(election, votes);

    // Nonpartisan contests (no candidates with partyIds) should not appear
    for (const contest of election.contests) {
      if (contest.type !== 'candidate') continue;
      const hasPartisanCandidates = contest.candidates.some(
        (c) => c.partyIds && c.partyIds.length > 0
      );
      if (!hasPartisanCandidates && !votes[contest.id]) {
        expect(expanded[contest.id]).toBeUndefined();
      }
    }
  });

  test('voter cross-party selection overrides straight-party for that contest', () => {
    // Vote straight Democratic, but pick Republican for president
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['democratic'],
      president: ['trump-pence'],
    };

    const expanded = applyStraightPartyRules(election, votes);

    // President should keep the cross-party vote (1 seat filled)
    expect(expanded['president']).toEqual(['trump-pence']);

    // Other contests should still get Democratic candidates
    const usSenator = election.contests.find((c) => c.id === 'us-senator');
    expect(usSenator?.type).toBe('candidate');
    if (usSenator?.type === 'candidate') {
      const demSenator = usSenator.candidates.find((c) =>
        c.partyIds?.includes('democratic')
      );
      expect(expanded['us-senator']).toContain(demSenator?.id);
    }
  });

  test('no straight-party vote leaves all contests unchanged', () => {
    const votes: Tabulation.Votes = {
      president: ['biden-harris'],
    };

    const expanded = applyStraightPartyRules(election, votes);

    // Should be identical — no expansion
    expect(expanded).toEqual(votes);
  });

  test('overvoted straight-party contest leaves all contests unchanged', () => {
    const votes: Tabulation.Votes = {
      'straight-party-ticket': ['democratic', 'republican'],
      president: ['biden-harris'],
    };

    const expanded = applyStraightPartyRules(election, votes);
    expect(expanded).toEqual(votes);
  });
});
