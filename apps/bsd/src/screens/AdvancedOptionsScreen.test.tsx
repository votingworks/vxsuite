import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { createMemoryHistory } from 'history'
import { Router } from 'react-router-dom'
import { act } from 'react-dom/test-utils'
import AdvancedOptionsScreen from './AdvancedOptionsScreen'

test('clicking "Export Backup…" shows progress', async () => {
  const backup = jest.fn()
  const component = render(
    <Router history={createMemoryHistory()}>
      <AdvancedOptionsScreen
        hasBatches={false}
        unconfigureServer={jest.fn()}
        zeroData={jest.fn()}
        backup={backup}
      />
    </Router>
  )

  let resolve!: () => void
  backup.mockReturnValueOnce(
    new Promise((res) => {
      resolve = res
    })
  )

  await act(async () => {
    // Click to backup, verify we got called.
    const backupButton = component.getByText('Export Backup…')
    expect(backup).not.toHaveBeenCalled()
    backupButton.click()
    expect(backup).toHaveBeenCalledTimes(1)

    // Verify progress message is shown.
    await waitFor(() => component.getByText('Exporting…'))

    // Trigger backup finished, verify back to normal.
    resolve()
    await waitFor(() => component.getByText('Export Backup…'))
  })
})

test('backup error shows message', async () => {
  const backup = jest.fn()
  const component = render(
    <Router history={createMemoryHistory()}>
      <AdvancedOptionsScreen
        hasBatches={false}
        unconfigureServer={jest.fn()}
        zeroData={jest.fn()}
        backup={backup}
      />
    </Router>
  )

  let reject!: (reason?: unknown) => void
  backup.mockReturnValueOnce(
    new Promise((_res, rej) => {
      reject = rej
    })
  )

  await act(async () => {
    // Click to backup, verify we got called.
    const backupButton = component.getByText('Export Backup…')
    expect(backup).not.toHaveBeenCalled()
    backupButton.click()
    expect(backup).toHaveBeenCalledTimes(1)

    // Verify progress message is shown.
    await waitFor(() => component.getByText('Exporting…'))

    // Trigger backup error, verify back to normal with error.
    reject(new Error('two is one and one is none'))
    await waitFor(() => component.getByText('Export Backup…'))
    await waitFor(() =>
      component.getByText('Error: two is one and one is none')
    )
  })
})
