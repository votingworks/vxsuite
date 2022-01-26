import { render as testRender, RenderResult } from '@testing-library/react';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { LogSource, Logger } from '@votingworks/logging';
import { ElectionDefinition, UserSession } from '@votingworks/types';
import { MemoryStorage, Storage, usbstick } from '@votingworks/utils';
import { createMemoryHistory, MemoryHistory } from 'history';
import React from 'react';
import { Router } from 'react-router-dom';
import { AppContext } from '../src/contexts/app_context';

interface RenderInAppContextParams {
  route?: string;
  history?: MemoryHistory;
  electionDefinition?: ElectionDefinition;
  machineId?: string;
  usbDriveStatus?: usbstick.UsbDriveStatus;
  usbDriveEject?: () => void;
  storage?: Storage;
  lockMachine?: () => void;
  bypassAuthentication?: boolean;
  currentUserSession?: UserSession;
  logger?: Logger;
}

export function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    electionDefinition = testElectionDefinition,
    machineId = '0000',
    bypassAuthentication = true,
    usbDriveStatus = usbstick.UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
    storage = new MemoryStorage(),
    lockMachine = jest.fn(),
    currentUserSession = { type: 'admin', authenticated: true },
    logger = new Logger(LogSource.VxCentralScanFrontend),
  }: RenderInAppContextParams = {}
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        electionDefinition,
        machineConfig: { machineId, codeVersion: 'TEST', bypassAuthentication },
        usbDriveStatus,
        usbDriveEject,
        storage,
        lockMachine,
        currentUserSession,
        logger,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  );
}
