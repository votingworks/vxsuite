import { axe } from 'jest-axe'
import React from 'react'
import { fireEvent, render, waitForElement } from 'react-testing-library'

import goodElectionFile from '../../public/data/election.json'

import UploadConfig from './UploadConfig'

it(`allows file to be uploaded via file input`, async () => {
  const setElection = jest.fn()
  const { container, getByText, getByTestId } = render(
    <UploadConfig setElection={setElection} />
  )
  const fileInput = getByTestId('file-input')
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File([JSON.stringify(goodElectionFile)], 'election.json', {
          type: 'application/json',
        }),
      ],
    },
  })
  await waitForElement(() => getByText('Loading file…'))
  await waitForElement(() => getByText('File loaded'))
  expect(setElection).toHaveBeenCalled()
  expect(container.firstChild).toMatchSnapshot()
})

it(`allows file to be uploaded via drag and drop`, async () => {
  const setElection = jest.fn()
  const { container, getByText, getByTestId } = render(
    <UploadConfig setElection={setElection} />
  )
  const dropzone = getByTestId('dropzone')
  fireEvent.dragEnter(dropzone)
  await waitForElement(() => getByText('Drop files here…'))
  fireEvent.drop(dropzone, {
    target: {
      files: [
        new File([JSON.stringify(goodElectionFile)], 'election.json', {
          type: 'application/json',
        }),
      ],
    },
  })
  await waitForElement(() => getByText('Loading file…'))
  await waitForElement(() => getByText('File loaded'))
  expect(setElection).toHaveBeenCalled()
  expect(container.firstChild).toMatchSnapshot()
})

it(`allows one-click config`, async () => {
  const setElection = jest.fn()
  const { container, getByText, getByTestId } = render(
    <UploadConfig setElection={setElection} />
  )
  fireEvent.click(getByText('Load Sample Election File'))
  expect(setElection).toHaveBeenCalled()
})

it(`doesn't allow files other than 'election.json'`, async () => {
  const setElection = jest.fn()
  const { getByText, getByTestId } = render(
    <UploadConfig setElection={setElection} />
  )
  const fileInput = getByTestId('file-input')
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File([''], 'foo.json', {
          type: 'application/json',
        }),
      ],
    },
  })
  await waitForElement(() =>
    getByText('Only election.json file is accepted. Try again.')
  )
})

it(`doesn't allow upload of multiple files`, async () => {
  const setElection = jest.fn()
  const { getByText, getByTestId } = render(
    <UploadConfig setElection={setElection} />
  )
  const fileInput = getByTestId('file-input')
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File([''], 'one.json', {
          type: 'application/json',
        }),
        new File([''], 'two.json', {
          type: 'application/json',
        }),
      ],
    },
  })
  await waitForElement(() =>
    getByText('Only election.json file is accepted. Try again.')
  )
})

it(`election config file must contain json content`, async () => {
  const setElection = jest.fn()
  const { getByText, getByTestId } = render(
    <UploadConfig setElection={setElection} />
  )
  const fileInput = getByTestId('file-input')
  fireEvent.change(fileInput, {
    target: {
      files: [
        new File(['asdf'], 'election.json', {
          type: 'application/json',
        }),
      ],
    },
  })
  await waitForElement(() =>
    getByText('File content must be JSON text only. Try again.')
  )
})

it(`UploadConfig is accessible`, async () => {
  const { container } = render(<UploadConfig setElection={jest.fn()} />)
  expect(await axe(container.innerHTML)).toHaveNoViolations()
})
