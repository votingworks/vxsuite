import fetchMock from 'fetch-mock';
import { Scan } from '@votingworks/api';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION, typedAs } from '@votingworks/utils';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';

const defaultConfig: Scan.PrecinctScannerConfig = {
  ...Scan.InitialPrecinctScannerConfig,
  electionDefinition: electionSampleDefinition,
  precinctSelection: ALL_PRECINCTS_SELECTION,
};

export function mockConfig(
  paramsConfig: Partial<Scan.PrecinctScannerConfig> = {}
): {
  mockElectionDefinitionChange: (
    electionDefinition: ElectionDefinition
  ) => void;
  mockPrecinctChange: (precinctSelection: PrecinctSelection) => void;
  mockPollsChange: (pollsState: PollsState) => void;
  mockTestModeChange: (isTestMode: boolean) => void;
  mockBallotBagReplaced: (ballotCountWhenBallotBagLastReplaced: number) => void;
} {
  const config: Scan.PrecinctScannerConfig = {
    ...defaultConfig,
    ...paramsConfig,
  };

  fetchMock.get(
    '/precinct-scanner/config',
    {
      body: typedAs<Scan.GetPrecinctScannerConfigResponse>(config),
    },
    {
      overwriteRoutes: true,
    }
  );

  return {
    mockElectionDefinitionChange: (electionDefinition: ElectionDefinition) => {
      fetchMock.patchOnce('/precinct-scanner/config/election', {
        body: typedAs<Scan.PatchElectionConfigResponse>({ status: 'ok' }),
        status: 200,
      });
      config.electionDefinition = electionDefinition;
    },

    mockPrecinctChange: (precinctSelection: PrecinctSelection) => {
      fetchMock.patchOnce(
        {
          url: '/precinct-scanner/config/precinct',
          body: { precinctSelection },
        },
        {
          body: { status: 'ok' },
        }
      );
      config.precinctSelection = precinctSelection;
    },

    mockPollsChange: (pollsState: PollsState) => {
      fetchMock.patchOnce(
        { url: '/precinct-scanner/config/polls', body: { pollsState } },
        {
          body: { status: 'ok' },
        }
      );
      config.pollsState = pollsState;
    },

    mockTestModeChange: (testMode: boolean) => {
      fetchMock.patchOnce(
        { url: '/precinct-scanner/config/testMode', body: { testMode } },
        {
          body: { status: 'ok' },
          status: 200,
        }
      );
      config.isTestMode = testMode;
    },

    mockBallotBagReplaced: (ballotCountWhenBallotBagLastReplaced: number) => {
      fetchMock.patchOnce(
        {
          url: '/precinct-scanner/config/ballotBagReplaced',
        },
        {
          body: {
            status: 'ok',
          },
          status: 200,
        }
      );
      config.ballotCountWhenBallotBagLastReplaced =
        ballotCountWhenBallotBagLastReplaced;
    },
  };
}
