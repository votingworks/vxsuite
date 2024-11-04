import { LogEventId } from '@votingworks/logging';
import {
  BooleanEnvironmentVariableName,
  getFeatureFlagMock,
} from '@votingworks/utils';
import { find, iter } from '@votingworks/basics';
import { configureApp } from '../test/helpers/shared_helpers';
import { scanBallot, withApp } from '../test/helpers/pdi_helpers';
import { PrecinctScannerPollsInfo } from '.';

jest.setTimeout(60_000);

const mockFeatureFlagger = getFeatureFlagMock();

jest.mock('@votingworks/utils', (): typeof import('@votingworks/utils') => ({
  ...jest.requireActual('@votingworks/utils'),
  isFeatureFlagEnabled: (flag) => mockFeatureFlagger.isEnabled(flag),
}));

const pollsTransitionTime = new Date('2021-01-01T00:00:00.000').getTime();
jest.mock('./util/get_current_time', () => ({
  getCurrentTime: () => pollsTransitionTime,
}));

beforeEach(() => {
  mockFeatureFlagger.resetFeatureFlags();
  mockFeatureFlagger.enableFeatureFlag(
    BooleanEnvironmentVariableName.SKIP_ELECTION_PACKAGE_AUTHENTICATION
  );
});

test('polls state flow', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      mockUsbDrive,
      mockAuth,
      workspace,
      logger,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: false,
      });
      expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
        pollsState: 'polls_closed_initial',
      });

      (await apiClient.openPolls()).unsafeUnwrap();
      expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
        pollsState: 'polls_open',
        lastPollsTransition: {
          type: 'open_polls',
          ballotCount: 0,
          time: pollsTransitionTime,
        },
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.PollsOpened,
        expect.objectContaining({
          disposition: 'success',
          message: 'User opened the polls.',
        })
      );

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);
      await apiClient.pauseVoting();
      expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
        pollsState: 'polls_paused',
        lastPollsTransition: {
          type: 'pause_voting',
          ballotCount: 1,
          time: pollsTransitionTime,
        },
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.VotingPaused,
        expect.objectContaining({
          disposition: 'success',
          message: 'User paused voting.',
        })
      );

      await apiClient.resumeVoting();
      expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
        pollsState: 'polls_open',
        lastPollsTransition: {
          type: 'resume_voting',
          ballotCount: 1,
          time: pollsTransitionTime,
        },
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.VotingResumed,
        expect.objectContaining({
          disposition: 'success',
          message: 'User resumed voting.',
        })
      );

      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1);
      await apiClient.closePolls();
      expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
        pollsState: 'polls_closed_final',
        lastPollsTransition: {
          type: 'close_polls',
          ballotCount: 2,
          time: pollsTransitionTime,
        },
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.PollsClosed,
        expect.objectContaining({
          disposition: 'success',
          message: 'User closed the polls.',
        })
      );

      await apiClient.resetPollsToPaused();
      expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
        pollsState: 'polls_paused',
        lastPollsTransition: {
          type: 'pause_voting',
          ballotCount: 2,
          time: pollsTransitionTime,
        },
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.ResetPollsToPaused,
        expect.objectContaining({
          disposition: 'success',
          message: 'User reset the polls to paused.',
        })
      );

      // closing from paused is also allowed

      await apiClient.closePolls();
      expect(await apiClient.getPollsInfo()).toEqual<PrecinctScannerPollsInfo>({
        pollsState: 'polls_closed_final',
        lastPollsTransition: {
          type: 'close_polls',
          ballotCount: 2,
          time: pollsTransitionTime,
        },
      });
      expect(logger.logAsCurrentRole).toHaveBeenCalledWith(
        LogEventId.PollsClosed,
        expect.objectContaining({
          disposition: 'success',
          message: 'User closed the polls.',
        })
      );
    }
  );
});

test('scanner batch flow', async () => {
  await withApp(
    async ({
      apiClient,
      mockScanner,
      logger,
      workspace,
      mockUsbDrive,
      mockAuth,
      clock,
    }) => {
      await configureApp(apiClient, mockAuth, mockUsbDrive, {
        testMode: true,
        openPolls: false,
      });
      const { store } = workspace;
      function getCvrIds() {
        return iter(store.forEachAcceptedSheet())
          .map((r) => r.id)
          .toArray();
      }
      function getBatchIds() {
        return store.getBatches().map((b) => b.id);
      }

      (await apiClient.openPolls()).unsafeUnwrap();
      let batchIds = getBatchIds();
      expect(batchIds).toHaveLength(1);
      const batch1Id = batchIds[0];

      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.ScannerBatchStarted,
        'system',
        expect.objectContaining({
          disposition: 'success',
          message: 'New scanning batch started on polls opened.',
          batchId: batch1Id,
        })
      );

      // Scan two ballots, which should have the same batch
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 0);
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 1);
      expect(getCvrIds()).toHaveLength(2);

      // Pause voting, which should stop the current batch
      await apiClient.pauseVoting();
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.ScannerBatchEnded,
        'system',
        expect.objectContaining({
          disposition: 'success',
          message: 'Current scanning batch finished on voting paused.',
          batchId: batch1Id,
        })
      );

      // Resume voting, which should start a new batch
      await apiClient.resumeVoting();
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.ScannerBatchStarted,
        'system',
        expect.objectContaining({
          disposition: 'success',
          message: 'New scanning batch started on voting resumed.',
          batchId: expect.not.stringMatching(batch1Id),
        })
      );

      // Confirm there is a new, second batch distinct from the first
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 2);
      await scanBallot(mockScanner, clock, apiClient, workspace.store, 3);
      batchIds = getBatchIds();
      expect(getCvrIds()).toHaveLength(4);
      expect(batchIds).toHaveLength(2);
      const batch2Id = find(batchIds, (batchId) => batchId !== batch1Id);

      await apiClient.closePolls();
      expect(logger.log).toHaveBeenCalledWith(
        LogEventId.ScannerBatchEnded,
        'system',
        expect.objectContaining({
          disposition: 'success',
          message: 'Current scanning batch finished on polls closed.',
          batchId: batch2Id,
        })
      );
    }
  );
});
