import React from 'react'
import { render } from '@testing-library/react'
import { electionSampleDefinition } from '@votingworks/fixtures'
import ElectionInfoBar from './ElectionInfoBar'

test('Renders ElectionInfoBar', async () => {
  const { container } = render(
    <ElectionInfoBar electionDefinition={electionSampleDefinition} />
  )
  expect(container).toMatchSnapshot()
})
