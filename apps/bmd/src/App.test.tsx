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

it('election can be loaded and voter can vote', async () => {
  window.confirm = jest.fn(() => true) // approve
  window.print = jest.fn(() => true) // approve
  const { container, getByTestId, getByText, getByLabelText } = render(<App />)
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
  fireEvent.click(getByText('Mickey Mouse'))
  expect(container.firstChild).toMatchSnapshot()
  getByText('To vote for Mickey Mouse, first uncheck the vote for minnieMouse.')
  fireEvent.click(getByText('Okay'))
  expect(
    (getByLabelText('Minnie Mouse') as HTMLInputElement).checked
  ).toBeTruthy()
  fireEvent.click(getByText('Next'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('John Smith'))
  fireEvent.click(getByText('Chad Hanging'))
  expect(container.firstChild).toMatchSnapshot()
  getByText('To vote for Chad Hanging, first uncheck the vote for johnSmith.')
  fireEvent.click(getByText('Okay'))
  expect(
    (getByLabelText('John Smith') as HTMLInputElement).checked
  ).toBeTruthy()
  fireEvent.click(getByText('View Summary'))
  expect(container.firstChild).toMatchSnapshot()

  fireEvent.click(getByText('Print Ballot'))
  expect(window.print).toBeCalled()

  fireEvent.click(getByText('New Ballot'))
  expect(container.firstChild).toMatchSnapshot()
  getByText('Clear all votes and start over?')
  fireEvent.click(getByText('Cancel'))

  fireEvent.click(getByText('New Ballot'))
  fireEvent.click(getByText('Start Over'))
  expect(container.firstChild).toMatchSnapshot()
})

it('loads sample with url hash', async () => {
  window.location.href = '/#sample'
  const { container, getByText } = render(<App />)
  expect(getByText('Get Started')).toBeTruthy()
  expect(container.firstChild).toMatchSnapshot()
})
