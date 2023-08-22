import * as grout from '@votingworks/grout';
import { find, ok } from '@votingworks/basics';
import { CustomScanner, mocks } from '@votingworks/custom-scanner';
import {
  BooleanEnvironmentVariableName,
  buildContestResultsFixture,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import { SheetInterpretation } from '@votingworks/types';
import { Api } from './app';
import { configureApp, waitForStatus } from '../test/helpers/shared_helpers';
import { ballotImages, withApp } from '../test/helpers/custom_helpers';

jest.setTimeout(20_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => {
  return {
    ...jest.requireActual('@votingworks/utils'),
    isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
  };
});

async function scanBallot(
  mockScanner: jest.Mocked<CustomScanner>,
  apiClient: grout.Client<Api>,
  initialBallotsCounted: number
) {
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_SCAN));
  await waitForStatus(apiClient, {
    state: 'ready_to_scan',
    ballotsCounted: initialBallotsCounted,
    canUnconfigure:
      initialBallotsCounted === 0 || (await apiClient.getConfig()).isTestMode,
  });

  const interpretation: SheetInterpretation = {
    type: 'ValidSheet',
  };

  mockScanner.scan.mockResolvedValueOnce(ok(await ballotImages.completeBmd()));
  await apiClient.scanBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_READY_TO_EJECT));
  await waitForStatus(apiClient, {
    state: 'ready_to_accept',
    interpretation,
    ballotsCounted: initialBallotsCounted,
    canUnconfigure: true,
  });
  await apiClient.acceptBallot();
  mockScanner.getStatus.mockResolvedValue(ok(mocks.MOCK_NO_PAPER));
  await waitForStatus(apiClient, {
    ballotsCounted: initialBallotsCounted + 1,
    state: 'accepted',
    interpretation,
    canUnconfigure: true,
  });

  // Wait for transition back to no paper
  await waitForStatus(apiClient, {
    state: 'no_paper',
    ballotsCounted: initialBallotsCounted + 1,
    canUnconfigure: true,
  });
}

beforeEach(() => {
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_BALLOT_PACKAGE_AUTHENTICATION
  );
});

test('end-to-end tabulated results', async () => {
  await withApp(
    {},
    async ({ apiClient, mockScanner, mockUsbDrive, mockAuth }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, { testMode: true });

      // scan a few ballots
      await scanBallot(mockScanner, apiClient, 0);
      await scanBallot(mockScanner, apiClient, 1);
      await scanBallot(mockScanner, apiClient, 2);

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
