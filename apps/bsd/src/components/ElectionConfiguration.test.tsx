import { render, fireEvent } from '@testing-library/react'
import React from 'react'
import { act } from 'react-dom/test-utils'
import { electionSample } from '@votingworks/ballot-encoder'
import ElectionConfiguration from './ElectionConfiguration'

test('shows a message that there is no election configuration', () => {
  const { getByText } = render(
    <ElectionConfiguration acceptFiles={jest.fn()} />
  )

  getByText('Not Configured')
})

test('passes files back when selected by the <input>', async () => {
  const acceptFiles = jest.fn()
  const { getByTitle } = render(
    <ElectionConfiguration acceptFiles={acceptFiles} />
  )

  const input = getByTitle('Select election.json or ballot package')
  const files = [
    new File([JSON.stringify(electionSample)], 'election.json', {
      type: 'application/json',
    }),
  ]
  await act(async () => {
    fireEvent.change(input, { target: { files } })
  })

  expect(acceptFiles).toHaveBeenCalledWith(files)
})
