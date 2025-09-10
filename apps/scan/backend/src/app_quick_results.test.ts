import { expect, test, vi, beforeEach } from 'vitest';
import { DEFAULT_SYSTEM_SETTINGS, SystemSettings } from '@votingworks/types';
import { electionFamousNames2021Fixtures } from '@votingworks/fixtures';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { configureApp } from '../test/helpers/shared_helpers';
import { withApp } from '../test/helpers/pdi_helpers';
import { PrecinctScannerPollsInfo } from '.';

const mockFeatureFlagger = getFeatureFlagMock();

vi.mock(import('@votingworks/utils'), async (importActual) => ({
  ...(await importActual()),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

const systemSettings: SystemSettings = {
  ...DEFAULT_SYSTEM_SETTINGS,
  quickResultsReportingUrl: 'http://example-results-url.com/something',
};
const electionPackageWithQuickResults =
  electionFamousNames2021Fixtures.electionJson.toElectionPackage(
    systemSettings
  );

const electionPackageWithoutQuickResults =
  electionFamousNames2021Fixtures.electionJson.toElectionPackage(
    DEFAULT_SYSTEM_SETTINGS
  );

const pollsTransitionTime = new Date('2021-01-01T00:00:00.000').getTime();
vi.mock(import('./util/get_current_time.js'), async (importActual) => ({
  ...(await importActual()),
  getCurrentTime: () => pollsTransitionTime,
}));

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('getQuickResultsReportingUrl returns expected results when system setting flag is set', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, {
      testMode: true,
      openPolls: true,
      electionPackage: electionPackageWithQuickResults,
    });
    expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
      pollsState: 'polls_open',
      lastPollsTransition: {
        type: 'open_polls',
        ballotCount: 0,
        time: pollsTransitionTime,
      },
    });
    // getQuickResultsReportingUrl should return an empty string when polls are open
    expect(await apiClient.getQuickResultsReportingUrl()).toEqual('');

    await apiClient.closePolls();
    expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
      pollsState: 'polls_closed_final',
      lastPollsTransition: {
        type: 'close_polls',
        ballotCount: 0,
        time: pollsTransitionTime,
      },
    });
    // Quick results URL should be returned as expected after polls are closed
    expect(await apiClient.getQuickResultsReportingUrl()).toMatch(
      /http:\/\/example-results-url\.com\/something\?p=[^&]+&s=[^&]+&c=[^&]+$/
    );
  });
});

test('getQuickResultsReportingUrl returns nothing when system setting flag is not set', async () => {
  await withApp(async ({ apiClient, mockUsbDrive, mockAuth }) => {
    await configureApp(apiClient, mockAuth, mockUsbDrive, {
      testMode: true,
      openPolls: true,
      electionPackage: electionPackageWithoutQuickResults,
    });
    expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
      pollsState: 'polls_open',
      lastPollsTransition: {
        type: 'open_polls',
        ballotCount: 0,
        time: pollsTransitionTime,
      },
    });
    // getQuickResultsReportingUrl should return an empty string when polls are open
    expect(await apiClient.getQuickResultsReportingUrl()).toEqual('');

    await apiClient.closePolls();
    expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
      pollsState: 'polls_closed_final',
      lastPollsTransition: {
        type: 'close_polls',
        ballotCount: 0,
        time: pollsTransitionTime,
      },
    });
    // Quick results URL should still be an empty string after polls are closed
    expect(await apiClient.getQuickResultsReportingUrl()).toEqual('');
  });
});
