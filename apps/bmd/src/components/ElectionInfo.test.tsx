import React from 'react'
import { render } from '@testing-library/react'
import { Election } from '@votingworks/ballot-encoder'

import ElectionInfo from './ElectionInfo'
import electionSampleWithSeal from '../data/electionSampleWithSeal.json'

const electionDefinition = {
  election: electionSampleWithSeal as Election,
  electionHash: 'this-is-a-hash',
}

it('renders horizantal ElectionInfo with hash when specified', () => {
  const { container } = render(
    <ElectionInfo
      precinctId="23"
      electionDefinition={electionDefinition}
      horizontal
      showElectionHash
    />
  )
  expect(container).toMatchSnapshot()
})

it('renders horizantal ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo
      precinctId="23"
      electionDefinition={electionDefinition}
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
      showElectionHash
    />
  )
  expect(container).toMatchSnapshot()
})

it('renders vertical ElectionInfo without hash by default', () => {
  const { container } = render(
    <ElectionInfo precinctId="23" electionDefinition={electionDefinition} />
  )
  expect(container).toMatchSnapshot()
})
