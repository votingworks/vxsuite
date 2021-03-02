import React from 'react'
import { render } from '@testing-library/react'
import { asElectionDefinition } from '@votingworks/fixtures'
import { parseElection } from '@votingworks/types'

import ElectionInfo from './ElectionInfo'
import electionSampleWithSeal from '../data/electionSampleWithSeal.json'

const electionDefinition = asElectionDefinition(
  parseElection(electionSampleWithSeal)
)

it('renders horizontal ElectionInfo with hash when specified', () => {
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

it('renders horizontal ElectionInfo without hash by default', () => {
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
