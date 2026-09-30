import { describe, expect, vi } from 'vitest';

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

describe('populates ballot_positions DB table', () => {
  mockFeatures.enableFeatureFlag(Feature.SKIP_ELECTION_PACKAGE_AUTHENTICATION);

  // [TODO] Add test for split-file elections (pending shared fixtures).
  testWithApp('for single-file elections', async (ctx) => {
    mockElectionManagerAuth(ctx.auth, electionDefinition);

    await configureFromUsb(ctx, {
      electionDefinition,
      systemSettings: DEFAULT_SYSTEM_SETTINGS,
    });

    const ballotMetaStore = ctx.workspace.store.getBallotMetaStore();
    for (const bs of election.ballotStyles) {
      expect(ballotMetaStore.getPositions(bs.id)).toEqual(bs.ballotPositions);
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
