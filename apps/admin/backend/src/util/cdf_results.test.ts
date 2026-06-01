import { expect, test } from 'vitest';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  Election,
  ResultsReporting,
  StraightPartyContest,
  Tabulation,
} from '@votingworks/types';
import { getEmptyElectionResults } from '@votingworks/utils';
import { assertDefined } from '@votingworks/basics';

import { MachineConfig } from '../types';
import { buildElectionResultsReport } from './cdf_results';

const MACHINE_CONFIG: MachineConfig = {
  machineId: 'test-machine',
  codeVersion: 'test',
};

test('buildElectionResultsReport emits PartyContest for straight-party contests', () => {
  const baseElection = electionFamousNames2021Fixtures.readElection();
  const spContest: StraightPartyContest = {
    id: 'straight-party-ticket',
    type: 'straight-party',
    title: 'Straight Party Ticket',
  };
  const election: Election = {
    ...baseElection,
    contests: [spContest, ...baseElection.contests],
  };

  const electionResults = getEmptyElectionResults(election);
  // Manually populate one party tally so the PartyContest output is non-trivial.
  const spResults = electionResults.contestResults[
    'straight-party-ticket'
  ] as Tabulation.StraightPartyContestResults;
  const firstParty = assertDefined(election.parties[0]);
  const firstPartyId = firstParty.id;
  spResults.tallies[firstPartyId] = {
    partyId: firstPartyId,
    name: firstParty.fullName,
    tally: 7,
  };
  spResults.overvotes = 1;
  spResults.undervotes = 2;
  spResults.ballots = 10;

  const report = buildElectionResultsReport({
    election,
    electionResults,
    writeInCandidates: [],
    isTestMode: true,
    machineConfig: MACHINE_CONFIG,
    isOfficialResults: false,
  });

  const partyContest = assertDefined(report.Election?.[0]?.Contest).find(
    (c): c is ResultsReporting.PartyContest =>
      c['@type'] === 'ElectionResults.PartyContest'
  );
  expect(partyContest).toBeDefined();
  expect(partyContest?.Name).toEqual('Straight Party Ticket');
  expect(partyContest?.ContestSelection).toHaveLength(election.parties.length);
  const firstPartySelection = partyContest?.ContestSelection?.find(
    (s): s is ResultsReporting.PartySelection =>
      s['@type'] === 'ElectionResults.PartySelection' &&
      (s.PartyIds[0]?.endsWith(firstPartyId) ?? false)
  );
  expect(firstPartySelection?.VoteCounts?.[0]?.Count).toEqual(7);
  expect(partyContest?.OtherCounts?.[0]?.Overvotes).toEqual(1);
  expect(partyContest?.OtherCounts?.[0]?.Undervotes).toEqual(2);
});
