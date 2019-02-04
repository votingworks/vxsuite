import React from 'react'
import ReactDOM from 'react-dom'
import { fireEvent, render, waitForElement } from 'react-testing-library'

import electionFile from './data/election.json'

import App from './App'

it('renders without crashing', () => {
  const div = document.createElement('div')
  ReactDOM.render(<App />, div)
  ReactDOM.unmountComponentAtNode(div)
})

test('election can be loaded and voter can vote', async () => {
  window.confirm = jest.fn(() => true) // approve
  window.print = jest.fn(() => true) // approve
  const { container, getByTestId, getByText } = render(<App />)
  expect(container).toMatchSnapshot()
  const fileInput = getByTestId('file-input')
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File([JSON.stringify(electionFile)], 'election.json', {
          type: 'application/json',
        }),
      ],
    },
  })
  await waitForElement(() => getByText('Demo Election'))
  expect(container).toMatchSnapshot()

  fireEvent.click(getByText('Get Started'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('Minnie Mouse'))
  fireEvent.click(getByText('Next'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('John Smith'))
  fireEvent.click(getByText('View Summary'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('Print Ballot'))
  expect(window.print).toBeCalled()

  fireEvent.click(getByText('New Ballot'))
  expect(window.confirm).toBeCalled()
  expect(container.firstChild).toMatchSnapshot()
})
