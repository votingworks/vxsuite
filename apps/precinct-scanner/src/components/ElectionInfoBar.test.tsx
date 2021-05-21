import React from 'react'
import { render } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import ElectionInfoBar from './ElectionInfoBar'
import AppContext from '../contexts/AppContext'

test('Renders ElectionInfoBar', async () => {
  const { container } = render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        machineConfig: { machineId: '0000', codeVersion: 'DEV' },
      }}
    >
      <ElectionInfoBar />
    </AppContext.Provider>
  )
  expect(container).toMatchSnapshot()
})

test('Renders admin ElectionInfoBar with precinct set', async () => {
  const { container } = render(
    <AppContext.Provider
      value={{
        electionDefinition: electionSampleDefinition,
        currentPrecinctId: '23',
        machineConfig: { machineId: '0002', codeVersion: 'DEV' },
      }}
    >
      <ElectionInfoBar mode="admin" />
    </AppContext.Provider>
  )
  expect(container).toMatchSnapshot()
})
