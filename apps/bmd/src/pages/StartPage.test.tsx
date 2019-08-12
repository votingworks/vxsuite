import React from 'react'
import { Route } from 'react-router-dom'

import { render } from '../../test/testUtils'
import electionSampleWithSeal from '../data/electionSampleWithSeal.json'
import electionSampleNoSeal from '../data/electionSampleNoSeal.json'

import StartPage from './StartPage'

it(`renders StartPage`, async () => {
  const { container } = render(<Route path="/" component={StartPage} />, {
    precinctId: '23',
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders StartPage with inline SVG`, async () => {
  const { container } = render(<Route path="/" component={StartPage} />, {
    election: electionSampleWithSeal,
    precinctId: '23',
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
})

it(`renders StartPage with no seal`, async () => {
  const { container } = render(<Route path="/" component={StartPage} />, {
    election: electionSampleNoSeal,
    precinctId: '23',
    route: '/',
  })
  expect(container.firstChild).toMatchSnapshot()
})
