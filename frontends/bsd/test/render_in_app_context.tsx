import { render as testRender, RenderResult } from '@testing-library/react';
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures';
import { LogSource, Logger } from '@votingworks/logging';
import { ElectionDefinition, UserSession } from '@votingworks/types';
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
  lockMachine?: () => void;
  currentUserSession?: UserSession;
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
  lockMachine = jest.fn(),
  currentUserSession = { type: 'admin', authenticated: true },
  logger = new Logger(LogSource.VxCentralScanFrontend),
}: Partial<AppContextInterface> = {}): AppContextInterface {
  return {
    electionDefinition,
    machineConfig,
    usbDriveStatus,
    usbDriveEject,
    storage,
    lockMachine,
    currentUserSession,
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
    lockMachine,
    currentUserSession,
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
        lockMachine,
        currentUserSession,
        logger,
      })}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  );
}
