import { join } from 'path'
import React from 'react'
import { Route } from 'react-router-dom'
import { loadElectionDefinition } from '@votingworks/fixtures'

import { render } from '../../test/testUtils'
import StartPage from './StartPage'

const electionSampleWithSealDefinition = loadElectionDefinition(
  join(__dirname, '../data/electionSampleWithSeal.json')
)
const electionSampleNoSealDefinition = loadElectionDefinition(
  join(__dirname, '../data/electionSampleNoSeal.json')
)
const electionPrimarySampleDefinition = loadElectionDefinition(
  join(__dirname, '../data/electionPrimarySample.json')
)

it('renders StartPage', async () => {
  const electionDefinition = electionPrimarySampleDefinition
  const { container, getAllByText, getByText } = render(
    <Route path="/" component={StartPage} />,
    {
      ballotStyleId: '12D',
      electionDefinition,
      precinctId: '23',
      route: '/',
    }
  )
  expect(getAllByText('Democratic Primary Election').length).toBeGreaterThan(1)
  getByText(/ballot style 12D/)
  expect(container.firstChild).toMatchSnapshot()
})

it('renders StartPage with inline SVG', async () => {
  const electionDefinition = electionSampleWithSealDefinition
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    precinctId: '23',
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
})

it('renders StartPage with no seal', async () => {
  const electionDefinition = electionSampleNoSealDefinition
  const { container } = render(<Route path="/" component={StartPage} />, {
    electionDefinition,
    precinctId: '23',
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
})
