import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionCombinedBallotPrimaryFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { BallotStyleGroupId, Tabulation } from '@votingworks/types';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app.js';
import { seedCombinedBallotPrimaryCvrsAndAdjudications } from '../test/combined_ballot_primary_fixture.js';

vi.setConfig({
  testTimeout: 60_000,
});

// mock SKIP_CVR_BALLOT_HASH_CHECK to allow us to use old cvr fixtures
const featureFlagMock = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag: BooleanEnvironmentVariableName) =>
    featureFlagMock.isEnabled(flag),
}));

beforeEach(() => {
  vi.clearAllMocks();
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CVR_BALLOT_HASH_CHECK
  );
  featureFlagMock.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_CAST_VOTE_RECORDS_AUTHENTICATION
  );
});

afterEach(() => {
  featureFlagMock.resetFeatureFlags();
});

test('card counts', async () => {
  const electionDefinition =
    electionTwoPartyPrimaryFixtures.readElectionDefinition();
  const { castVoteRecordExport } = electionTwoPartyPrimaryFixtures;
  const { election } = electionDefinition;

  const { apiClient, auth } = buildTestEnvironment();
  await configureMachine(apiClient, auth, electionDefinition);
  mockElectionManagerAuth(auth, electionDefinition.election);

  const loadFileResult = await apiClient.addCastVoteRecordFile({
    path: castVoteRecordExport.asDirectoryPath(),
  });
  loadFileResult.assertOk('load file failed');

  await apiClient.setManualResults({
    precinctId: 'precinct-1',
    ballotStyleGroupId: '1M',
    votingMethod: 'precinct',
    manualResults: buildManualResultsFixture({
      election,
      ballotCount: 10,
      contestResultsSummaries: {},
    }),
  });

  expect(
    await apiClient.getCardCounts({
      filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
      groupBy: {},
    })
  ).toEqual([
    {
      bmd: [56],
      hmpb: [],
      manual: 10,
    },
  ]);

  expect(
    await apiClient.getCardCounts({
      filter: {},
      groupBy: { groupByPrecinct: true },
    })
  ).toEqual([
    {
      precinctId: 'precinct-1',
      bmd: [56],
      hmpb: [],
      manual: 10,
    },
    {
      precinctId: 'precinct-2',
      bmd: [56],
      hmpb: [],
      manual: 0,
    },
  ]);

  expect(
    await apiClient.getCardCounts({
      filter: { ballotStyleGroupIds: ['1M'] as BallotStyleGroupId[] },
      groupBy: { groupByPrecinct: true },
    })
  ).toEqual([
    {
      precinctId: 'precinct-1',
      bmd: [28],
      hmpb: [],
      manual: 10,
    },
    {
      precinctId: 'precinct-2',
      bmd: [28],
      hmpb: [],
      manual: 0,
    },
  ]);
});

test('combined ballot primary: card counts with party inferred from votes', async () => {
  const electionDefinition =
    electionCombinedBallotPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth, workspace } = buildTestEnvironment();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  mockElectionManagerAuth(auth, electionDefinition.election);

  // 10 CVRs after adjudication:
  //   4 Dem:
  //     2 happy-path HMPB sheet 1 + 1 happy-path BMD (mixed card types in
  //       one group — exercises card-type axis of (group, card) aggregation)
  //     + 1 resolved crossover HMPB sheet 1
  //   2 Rep — HMPB sheet 1
  //   1 Lib — BMD
  //   3 No Party:
  //     1 nonpartisan-only — HMPB sheet 2 (exercises sheet-number axis)
  //     1 unresolved crossover + 1 flipped Dem — HMPB sheet 1
  await seedCombinedBallotPrimaryCvrsAndAdjudications({
    apiClient,
    electionId,
    store: workspace.store,
  });

  // Overall count, no grouping
  expect(await apiClient.getCardCounts({ filter: {}, groupBy: {} })).toEqual([
    { bmd: [2], hmpb: [7, 1], manual: 0 },
  ]);

  // Group by party only — collapses unassigned ballots into a single
  // NO_PARTY_ID row (rendered as "No Party").
  expect(
    await apiClient.getCardCounts({
      filter: {},
      groupBy: { groupByParty: true },
    })
  ).toEqual([
    {
      partyId: 'democratic-party',
      bmd: [1],
      hmpb: [3],
      manual: 0,
    },
    {
      partyId: 'republican-party',
      bmd: [],
      hmpb: [2],
      manual: 0,
    },
    {
      partyId: 'libertarian-party',
      bmd: [1],
      hmpb: [],
      manual: 0,
    },
    {
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [2, 1],
      manual: 0,
    },
  ]);

  // Group by precinct + party — matches the Precinct Ballot Count Report
  // screen's groupBy. All ballots are in precinct-1; precinct-2 gets zero-count
  // rows for each party.
  expect(
    await apiClient.getCardCounts({
      filter: {},
      groupBy: { groupByPrecinct: true, groupByParty: true },
    })
  ).toEqual([
    {
      precinctId: 'precinct-1',
      partyId: 'democratic-party',
      bmd: [1],
      hmpb: [3],
      manual: 0,
    },
    {
      precinctId: 'precinct-1',
      partyId: 'republican-party',
      bmd: [],
      hmpb: [2],
      manual: 0,
    },
    {
      precinctId: 'precinct-1',
      partyId: 'libertarian-party',
      bmd: [1],
      hmpb: [],
      manual: 0,
    },
    {
      precinctId: 'precinct-1',
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [2, 1],
      manual: 0,
    },
    {
      precinctId: 'precinct-2',
      partyId: 'democratic-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      precinctId: 'precinct-2',
      partyId: 'republican-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      precinctId: 'precinct-2',
      partyId: 'libertarian-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      precinctId: 'precinct-2',
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [],
      manual: 0,
    },
  ]);

  // Group by voting method + party — matches the canned Voting Method
  // Ballot Count Report screen's groupBy. All ballots are 'precinct';
  // 'absentee' rows are zero.
  expect(
    await apiClient.getCardCounts({
      filter: {},
      groupBy: { groupByVotingMethod: true, groupByParty: true },
    })
  ).toEqual([
    {
      votingMethod: 'precinct',
      partyId: 'democratic-party',
      bmd: [1],
      hmpb: [3],
      manual: 0,
    },
    {
      votingMethod: 'precinct',
      partyId: 'republican-party',
      bmd: [],
      hmpb: [2],
      manual: 0,
    },
    {
      votingMethod: 'precinct',
      partyId: 'libertarian-party',
      bmd: [1],
      hmpb: [],
      manual: 0,
    },
    {
      votingMethod: 'precinct',
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [2, 1],
      manual: 0,
    },
    {
      votingMethod: 'absentee',
      partyId: 'democratic-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      votingMethod: 'absentee',
      partyId: 'republican-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      votingMethod: 'absentee',
      partyId: 'libertarian-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      votingMethod: 'absentee',
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [],
      manual: 0,
    },
  ]);

  // Non-party groupings still aggregate every ballot regardless of party.
  // ballot-style-2 exists in the election but has no CVRs in this fixture.
  expect(
    await apiClient.getCardCounts({
      filter: {},
      groupBy: { groupByBallotStyle: true },
    })
  ).toEqual([
    {
      ballotStyleGroupId: 'ballot-style-1',
      bmd: [2],
      hmpb: [7, 1],
      manual: 0,
    },
    {
      ballotStyleGroupId: 'ballot-style-2',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
  ]);

  // Ballot style + party — exercises the groupByBallotStyle branch of the
  // combined ballot primary reroute (the Custom Ballot Count Report builder allows this
  // combination). All CVRs are on ballot-style-1; ballot-style-2 gets
  // zero-count rows for each party.
  expect(
    await apiClient.getCardCounts({
      filter: {},
      groupBy: { groupByBallotStyle: true, groupByParty: true },
    })
  ).toEqual([
    {
      ballotStyleGroupId: 'ballot-style-1',
      partyId: 'democratic-party',
      bmd: [1],
      hmpb: [3],
      manual: 0,
    },
    {
      ballotStyleGroupId: 'ballot-style-1',
      partyId: 'republican-party',
      bmd: [],
      hmpb: [2],
      manual: 0,
    },
    {
      ballotStyleGroupId: 'ballot-style-1',
      partyId: 'libertarian-party',
      bmd: [1],
      hmpb: [],
      manual: 0,
    },
    {
      ballotStyleGroupId: 'ballot-style-1',
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [2, 1],
      manual: 0,
    },
    {
      ballotStyleGroupId: 'ballot-style-2',
      partyId: 'democratic-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      ballotStyleGroupId: 'ballot-style-2',
      partyId: 'republican-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      ballotStyleGroupId: 'ballot-style-2',
      partyId: 'libertarian-party',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
    {
      ballotStyleGroupId: 'ballot-style-2',
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [],
      manual: 0,
    },
  ]);

  // Exercise the batch / batch date / scanner branches of the combined ballot
  // primary reroute. All ballots are in batch-1 / scanner-1, so each party row
  // collapses to a single (party, batch, scanner) bucket.
  expect(
    await apiClient.getCardCounts({
      filter: {},
      groupBy: {
        groupByParty: true,
        groupByBatch: true,
        groupByBatchDate: true,
        groupByScanner: true,
      },
    })
  ).toEqual([
    {
      partyId: 'democratic-party',
      batchId: 'batch-1',
      batchDate: expect.any(String),
      scannerId: 'scanner-1',
      bmd: [1],
      hmpb: [3],
      manual: 0,
    },
    {
      partyId: 'republican-party',
      batchId: 'batch-1',
      batchDate: expect.any(String),
      scannerId: 'scanner-1',
      bmd: [],
      hmpb: [2],
      manual: 0,
    },
    {
      partyId: 'libertarian-party',
      batchId: 'batch-1',
      batchDate: expect.any(String),
      scannerId: 'scanner-1',
      bmd: [1],
      hmpb: [],
      manual: 0,
    },
    {
      partyId: Tabulation.NO_PARTY_ID,
      batchId: 'batch-1',
      batchDate: expect.any(String),
      scannerId: 'scanner-1',
      bmd: [],
      hmpb: [2, 1],
      manual: 0,
    },
  ]);
});

test('combined ballot primary: card counts with partyIds filter', async () => {
  const electionDefinition =
    electionCombinedBallotPrimaryFixtures.readElectionDefinition();
  const { apiClient, auth, workspace } = buildTestEnvironment();
  const electionId = await configureMachine(
    apiClient,
    auth,
    electionDefinition
  );
  mockElectionManagerAuth(auth, electionDefinition.election);

  await seedCombinedBallotPrimaryCvrsAndAdjudications({
    apiClient,
    electionId,
    store: workspace.store,
  });

  // Filter to a single party — only ballots whose inferred party matches.
  // Dem inferred ballots: 3 HMPB sheet 1 (2 happy-path + 1 resolved crossover)
  // + 1 BMD. Crossover ballots and the flipped-to-no-party ballot
  // are excluded.
  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: ['democratic-party'] },
      groupBy: {},
    })
  ).toEqual([{ bmd: [1], hmpb: [3], manual: 0 }]);

  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: ['republican-party'] },
      groupBy: {},
    })
  ).toEqual([{ bmd: [], hmpb: [2], manual: 0 }]);

  // Multi-party filter — union of matching ballots.
  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: ['democratic-party', 'libertarian-party'] },
      groupBy: {},
    })
  ).toEqual([{ bmd: [2], hmpb: [3], manual: 0 }]);

  // Combined with groupByPrecinct — only precinct-1 has matching ballots;
  // precinct-2 has zero.
  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: ['democratic-party'] },
      groupBy: { groupByPrecinct: true },
    })
  ).toEqual([
    {
      precinctId: 'precinct-1',
      bmd: [1],
      hmpb: [3],
      manual: 0,
    },
    {
      precinctId: 'precinct-2',
      bmd: [],
      hmpb: [],
      manual: 0,
    },
  ]);

  // Combined with groupByParty — the group expansion should only include the
  // filtered party, not the full set.
  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: ['democratic-party'] },
      groupBy: { groupByParty: true },
    })
  ).toEqual([
    {
      partyId: 'democratic-party',
      bmd: [1],
      hmpb: [3],
      manual: 0,
    },
  ]);

  // "No Party" filter — matches ballots with no inferred party. After
  // adjudication, these are: 1 unresolved crossover (HMPB sheet 1) +
  // 1 flipped-Dem (HMPB sheet 1) + 1 nonpartisan-only (HMPB sheet 2).
  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: [Tabulation.NO_PARTY_ID] },
      groupBy: {},
    })
  ).toEqual([{ bmd: [], hmpb: [2, 1], manual: 0 }]);

  // Real party + "No Party" — union of Dem (4) + No Party (3)
  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: ['democratic-party', Tabulation.NO_PARTY_ID] },
      groupBy: {},
    })
  ).toEqual([{ bmd: [1], hmpb: [5, 1], manual: 0 }]);

  // "No Party" filter combined with groupByParty — only the "No Party" group
  // appears.
  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: [Tabulation.NO_PARTY_ID] },
      groupBy: { groupByParty: true },
    })
  ).toEqual([
    {
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [2, 1],
      manual: 0,
    },
  ]);

  // Real party + "No Party" with groupByParty — both groups appear, real
  // parties not in the filter are omitted.
  expect(
    await apiClient.getCardCounts({
      filter: { partyIds: ['democratic-party', Tabulation.NO_PARTY_ID] },
      groupBy: { groupByParty: true },
    })
  ).toEqual([
    {
      partyId: 'democratic-party',
      bmd: [1],
      hmpb: [3],
      manual: 0,
    },
    {
      partyId: Tabulation.NO_PARTY_ID,
      bmd: [],
      hmpb: [2, 1],
      manual: 0,
    },
  ]);
});
