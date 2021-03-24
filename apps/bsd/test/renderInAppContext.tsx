import { createMemoryHistory, MemoryHistory } from 'history'
import { render as testRender } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import React from 'react'
import { Router } from 'react-router-dom'
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures'
import { ElectionDefinition } from '@votingworks/types'

import { UsbDriveStatus } from '../src/lib/usbstick'
import AppContext from '../src/contexts/AppContext'

interface RenderInAppContextParams {
  route?: string | undefined
  history?: MemoryHistory<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  electionDefinition?: ElectionDefinition
  machineId?: string
  usbDriveStatus?: UsbDriveStatus
  usbDriveEject?: () => void
}

export default function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    electionDefinition = testElectionDefinition,
    machineId = '0000',
    usbDriveStatus = UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
  } = {} as RenderInAppContextParams
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        electionDefinition,
        machineConfig: { machineId },
        usbDriveStatus,
        usbDriveEject,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  )
}
