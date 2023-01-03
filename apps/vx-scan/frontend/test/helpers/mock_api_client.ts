import { Scan } from '@votingworks/api';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  ElectionDefinition,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { createMockClient } from '@votingworks/grout-test-utils';
// eslint-disable-next-line vx/gts-no-import-export-type
import type { Api } from '@votingworks/vx-scan-backend';

const defaultConfig: Scan.PrecinctScannerConfig = {
  ...Scan.InitialPrecinctScannerConfig,
  electionDefinition: electionSampleDefinition,
  precinctSelection: ALL_PRECINCTS_SELECTION,
};

export const statusNoPaper: Scan.PrecinctScannerStatus = {
  state: 'no_paper',
  canUnconfigure: false,
  ballotsCounted: 0,
};

/**
 * Creates a VxScan specific wrapper around commonly used methods from the Grout
 * mock API client to make it easier to use for our specific test needs
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createApiMock() {
  const mockApiClient = createMockClient<Api>();
  return {
    mockApiClient,

    expectGetConfig(config: Partial<Scan.PrecinctScannerConfig> = {}): void {
      mockApiClient.getConfig.expectCallWith().resolves({
        ...defaultConfig,
        ...config,
      });
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expectSetElection(electionDefinition: ElectionDefinition): void {
      // mockApiClient.setElection
      //   .expectCallWith({ electionData: electionDefinition.electionData })
      //   .resolves();
    },

    expectSetPrecinct(precinctSelection: PrecinctSelection): void {
      mockApiClient.setPrecinctSelection
        .expectCallWith({ precinctSelection })
        .resolves();
    },

    expectSetTestMode(isTestMode: boolean): void {
      mockApiClient.setTestMode.expectCallWith({ isTestMode }).resolves();
    },

    expectGetScannerStatus(
      status: Scan.PrecinctScannerStatus,
      times = 1
    ): void {
      for (let i = 0; i < times; i += 1) {
        mockApiClient.getScannerStatus.expectCallWith().resolves(status);
      }
    },

    expectSetPollsState(pollsState: PollsState): void {
      mockApiClient.setPollsState.expectCallWith({ pollsState }).resolves();
    },
  };
}
