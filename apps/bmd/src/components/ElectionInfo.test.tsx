import React from 'react'
import { render } from '@testing-library/react'

import ElectionInfo from './ElectionInfo'
import { electionSampleWithSealDefinition as electionDefinition } from '../data'
import fakeMachineConfig from '../../test/helpers/fakeMachineConfig'

it('renders horizontal ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctId="23"
      electionDefinition={electionDefinition}
      machineConfig={fakeMachineConfig()}
      horizontal
      showElectionHash
    />
  )
  expect(container).toMatchSnapshot()
})

it('renders horizontal ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctId="23"
      electionDefinition={electionDefinition}
      machineConfig={fakeMachineConfig()}
      horizontal
    />
  )
  expect(container).toMatchSnapshot()
})

it('renders vertical ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctId="23"
      electionDefinition={electionDefinition}
      machineConfig={fakeMachineConfig()}
      showElectionHash
    />
  )
  expect(container).toMatchSnapshot()
})

it('renders vertical ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctId="23"
      electionDefinition={electionDefinition}
      machineConfig={fakeMachineConfig()}
    />
  )
  expect(container).toMatchSnapshot()
})
