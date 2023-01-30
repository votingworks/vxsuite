import React from 'react';
import { electionSampleDefinition } from '@votingworks/fixtures';
import { ALL_PRECINCTS_SELECTION } from '@votingworks/utils';
import {
  CastVoteRecord,
  MarkThresholds,
  PollsState,
  PrecinctSelection,
} from '@votingworks/types';
import { createMockClient } from '@votingworks/grout-test-utils';
// eslint-disable-next-line vx/gts-no-import-export-type
import type {
  Api,
  MachineConfig,
  PrecinctScannerConfig,
  PrecinctScannerStatus,
} from '@votingworks/vx-scan-backend';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok } from '@votingworks/basics';
import { ApiClientContext, queryClientDefaultOptions } from '../../src/api';

export const machineConfig: MachineConfig = {
  machineId: '0002',
  codeVersion: '3.14',
};

const defaultConfig: PrecinctScannerConfig = {
  isSoundMuted: false,
  isTestMode: true,
  pollsState: 'polls_closed_initial',
  ballotCountWhenBallotBagLastReplaced: 0,
  electionDefinition: electionSampleDefinition,
  precinctSelection: ALL_PRECINCTS_SELECTION,
};

export const statusNoPaper: PrecinctScannerStatus = {
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

    expectGetMachineConfig(): void {
      mockApiClient.getMachineConfig.expectCallWith().resolves(machineConfig);
    },

    expectGetConfig(config: Partial<PrecinctScannerConfig> = {}): void {
      mockApiClient.getConfig.expectCallWith().resolves({
        ...defaultConfig,
        ...config,
      });
    },

    expectSetPrecinct(precinctSelection: PrecinctSelection): void {
      mockApiClient.setPrecinctSelection
        .expectCallWith({ precinctSelection })
        .resolves();
    },

    expectSetTestMode(isTestMode: boolean): void {
      mockApiClient.setTestMode.expectCallWith({ isTestMode }).resolves();
    },

    expectSetMarkThresholdOverrides(
      markThresholdOverrides?: MarkThresholds
    ): void {
      mockApiClient.setMarkThresholdOverrides
        .expectCallWith({ markThresholdOverrides })
        .resolves();
    },

    expectGetScannerStatus(status: PrecinctScannerStatus, times = 1): void {
      for (let i = 0; i < times; i += 1) {
        mockApiClient.getScannerStatus.expectCallWith().resolves(status);
      }
    },

    expectSetPollsState(pollsState: PollsState): void {
      mockApiClient.setPollsState.expectCallWith({ pollsState }).resolves();
    },

    expectGetCastVoteRecordsForTally(castVoteRecords: CastVoteRecord[]): void {
      mockApiClient.getCastVoteRecordsForTally
        .expectCallWith()
        .resolves(castVoteRecords);
    },

    expectExportCastVoteRecordsToUsbDrive(): void {
      mockApiClient.exportCastVoteRecordsToUsbDrive
        .expectCallWith()
        .resolves(ok());
    },
  };
}

export function provideApi(
  apiMock: ReturnType<typeof createApiMock>,
  children: React.ReactNode
): JSX.Element {
  return (
    <ApiClientContext.Provider value={apiMock.mockApiClient}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: queryClientDefaultOptions })}
      >
        {children}
      </QueryClientProvider>
    </ApiClientContext.Provider>
  );
}
