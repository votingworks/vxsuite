import { render } from '@testing-library/react'
import React from 'react'
import LoadElectionScreen from './LoadElectionScreen'

test('shows a message that there is no election configuration', () => {
  const { getByText } = render(<LoadElectionScreen setElection={jest.fn()} />)

  getByText('Not Configured')
})
