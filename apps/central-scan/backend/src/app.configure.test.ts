import { beforeEach, describe, expect, vi } from 'vitest';

import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import {
  mockElectionPackageFileTree,
  type PartialElectionPackage,
} from '@votingworks/backend';

import {
  getFeatureFlagMock,
  BooleanEnvironmentVariableName as Feature,
} from '@votingworks/utils';
import { toSplitFileElection } from '@votingworks/test-utils';
import { mockElectionManagerAuth } from '../test/helpers/auth.js';
import { testWithApp, type TestAppContext } from '../test/helpers/setup_app.js';

const mockFeatures = getFeatureFlagMock();
vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (f: Feature) => mockFeatures.isEnabled(f),
}));

const fixtures = electionFamousNames2021Fixtures;
const electionDefinition = fixtures.readElectionDefinition();
const { election } = electionDefinition;

beforeEach(() => {
  mockFeatures.enableFeatureFlag(Feature.SKIP_ELECTION_PACKAGE_AUTHENTICATION);
});

describe('populates ballot meta store', () => {
  testWithApp('for single-file elections', async (ctx) => {
    mockElectionManagerAuth(ctx.auth, electionDefinition);

    await configureFromUsb(ctx, {
      electionDefinition,
      systemSettings: {
        ...DEFAULT_SYSTEM_SETTINGS,
        splitElectionDefinition: false,
      },
    });

    const ballotMetaStore = ctx.workspace.store.getBallotMetaStore();
    for (const bs of election.ballotStyles) {
      expect(ballotMetaStore.getPositions(bs.id)).toEqual(bs.ballotPositions);
      expect(ballotMetaStore.getCandidateOrderings(bs.id)).toEqual(
        bs.orderedCandidatesByContest
      );
    }
  });

  testWithApp('for split-file elections', async (ctx) => {
    mockElectionManagerAuth(ctx.auth, electionDefinition);

    const splitElection = toSplitFileElection(election);

    await configureFromUsb(ctx, {
      ballotPositions: splitElection.ballotPositions,
      candidateOrderings: splitElection.candidateOrderings,
      electionDefinition: {
        ballotHash: 'unused',
        election: splitElection.election,
        electionData: JSON.stringify(splitElection.election),
      },
      systemSettings: {
        ...DEFAULT_SYSTEM_SETTINGS,
        splitElectionDefinition: true,
      },
    });

    const electionRecord = ctx.workspace.store.getElectionRecord();
    const storedElection = electionRecord?.electionDefinition.election;
    expect(storedElection).toEqual(splitElection.election);

    const metaStore = ctx.workspace.store.getBallotMetaStore();

    for (const bs of election.ballotStyles) {
      expect(metaStore.getPositions(bs.id)).toEqual(bs.ballotPositions);
      expect(metaStore.getCandidateOrderings(bs.id)).toEqual(
        bs.orderedCandidatesByContest
      );
    }
  });
});

async function configureFromUsb(
  ctx: TestAppContext,
  pkg: PartialElectionPackage
) {
  ctx.mockUsbDrive.insertUsbDrive(await mockElectionPackageFileTree(pkg));
  const res = await ctx.apiClient.configureFromElectionPackageOnUsbDrive();
  res.unsafeUnwrap();
}
