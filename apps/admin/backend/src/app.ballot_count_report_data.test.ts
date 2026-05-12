import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  electionOpenPrimaryFixtures,
  electionTwoPartyPrimaryFixtures,
} from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  buildManualResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { BallotStyleGroupId } from '@votingworks/types';
import {
  buildTestEnvironment,
  configureMachine,
  mockElectionManagerAuth,
} from '../test/app';
import { seedOpenPrimaryCvrsAndAdjudications } from '../test/open_primary_fixture';

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

test('open primary: card counts with party inferred from votes', async () => {
  const electionDefinition =
    electionOpenPrimaryFixtures.readElectionDefinition();
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
  await seedOpenPrimaryCvrsAndAdjudications({
    apiClient,
    electionId,
    store: workspace.store,
  });

  // Overall count, no grouping
  expect(await apiClient.getCardCounts({ filter: {}, groupBy: {} })).toEqual([
    { bmd: [2], hmpb: [7, 1], manual: 0 },
  ]);

  // Group by party only — collapses unassigned ballots into a single
  // partyId: undefined row (rendered as "No Party").
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
      partyId: undefined,
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
      partyId: undefined,
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
      partyId: undefined,
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
      partyId: undefined,
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
      partyId: undefined,
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
  // open-primary reroute (the Custom Ballot Count Report builder allows this
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
      partyId: undefined,
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
      partyId: undefined,
      bmd: [],
      hmpb: [],
      manual: 0,
    },
  ]);

  // Exercise the batch / batch date / scanner branches of the open-primary
  // reroute. All ballots are in batch-1 / scanner-1, so each party row
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
      partyId: undefined,
      batchId: 'batch-1',
      batchDate: expect.any(String),
      scannerId: 'scanner-1',
      bmd: [],
      hmpb: [2, 1],
      manual: 0,
    },
  ]);
});
