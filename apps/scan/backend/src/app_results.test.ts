import { find } from '@votingworks/basics';
import {
  BooleanEnvironmentVariableName,
  buildContestResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { configureApp } from '../test/helpers/shared_helpers';
import { scanBallot, withApp } from '../test/helpers/custom_helpers';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('end-to-end tabulated results', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth, workspace }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      // scan a few ballots
      await scanBallot(mockScanner, apiClient, workspace.store, 0);
      await scanBallot(mockScanner, apiClient, workspace.store, 1);
      await scanBallot(mockScanner, apiClient, workspace.store, 2);

      const allResults = await apiClient.getScannerResultsByParty();
      expect(allResults).toHaveLength(1);

      const [results] = allResults;
      expect(results.partyId).toBeUndefined();
      expect(results.cardCounts).toEqual({
        bmd: 3,
        hmpb: [],
      });
      expect(results.contestResults['mayor']).toEqual(
        buildContestResultsFixture({
          contest: find(
            electionFamousNames2021Fixtures.election.contests,
            (c) => c.id === 'mayor'
          ),
          contestResultsSummary: {
            type: 'candidate',
            ballots: 3,
            officialOptionTallies: {
              'sherlock-holmes': 3,
            },
          },
          includeGenericWriteIn: true,
        })
      );
    }
  );
});
