import { render as testRender, RenderResult } from '@testing-library/react';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { LogSource, Logger } from '@votingworks/logging';
import { Dipped } from '@votingworks/test-utils';
import { DippedSmartcardAuth, ElectionDefinition } from '@votingworks/types';
import { MemoryStorage, Storage, usbstick } from '@votingworks/utils';
import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { AppContext, AppContextInterface } from '../src/contexts/app_context';

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition;
  machineId?: string;
  usbDriveStatus?: usbstick.UsbDriveStatus;
  usbDriveEject?: () => void;
  storage?: Storage;
  auth?: DippedSmartcardAuth.Auth;
  logger?: Logger;
}

export function makeAppContext({
  electionDefinition = testElectionDefinition,
  machineConfig = {
    machineId: '0000',
    codeVersion: 'TEST',
  },
  usbDriveStatus = usbstick.UsbDriveStatus.absent,
  usbDriveEject = jest.fn(),
  storage = new MemoryStorage(),
  auth = Dipped.fakeElectionManagerAuth(),
  logger = new Logger(LogSource.VxCentralScanFrontend),
}: Partial<AppContextInterface> = {}): AppContextInterface {
  return {
    electionDefinition,
    machineConfig,
    usbDriveStatus,
    usbDriveEject,
    storage,
    auth,
    logger,
  };
}

export function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    electionDefinition,
    machineId = '0000',
    usbDriveStatus,
    usbDriveEject,
    storage,
    auth,
    logger,
  }: RenderInAppContextParams = {}
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={makeAppContext({
        electionDefinition,
        machineConfig: { machineId, codeVersion: 'TEST' },
        usbDriveStatus,
        usbDriveEject,
        storage,
        auth,
        logger,
      })}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  );
}
