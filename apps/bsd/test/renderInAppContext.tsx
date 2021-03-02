import { createMemoryHistory, MemoryHistory } from 'history'
import { render as testRender } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import type { Election } from '@votingworks/types'
import React from 'react'

import { electionSampleDefinition } from '@votingworks/fixtures'
import { Router } from 'react-router-dom'
import { UsbDriveStatus } from '../src/lib/usbstick'
import AppContext from '../src/contexts/AppContext'

interface RenderInAppContextParams {
  route?: string | undefined
  history?: MemoryHistory<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  election?: Election
  electionHash?: string
  machineId?: string
  usbDriveStatus?: UsbDriveStatus
  usbDriveEject?: () => void
}

export default function renderInAppContext(
  component: React.ReactNode,
  {
    route = '/',
    history = createMemoryHistory({ initialEntries: [route] }),
    election = electionSampleDefinition.election,
    electionHash = electionSampleDefinition.electionHash,
    machineId = '0000',
    usbDriveStatus = UsbDriveStatus.absent,
    usbDriveEject = jest.fn(),
  } = {} as RenderInAppContextParams
): RenderResult {
  return testRender(
    <AppContext.Provider
      value={{
        election,
        electionHash,
        machineConfig: { machineId },
        usbDriveStatus,
        usbDriveEject,
      }}
    >
      <Router history={history}>{component}</Router>
    </AppContext.Provider>
  )
}
