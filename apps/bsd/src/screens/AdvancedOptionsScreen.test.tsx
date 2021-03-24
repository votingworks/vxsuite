import React from 'react'
import { render, waitFor } from '@testing-library/react'
import { createMemoryHistory } from 'history'
import { Router } from 'react-router-dom'
import { act } from 'react-dom/test-utils'
import { electionSampleDefinition as testElectionDefinition } from '@votingworks/fixtures'
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
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
      />
    </Router>
  )

  let resolve!: () => void
  backup.mockReturnValueOnce(
    new Promise<void>((res) => {
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

test('clicking "Factory Reset…" shows progress', async () => {
  const unconfigureServer = jest.fn()
  const component = render(
    <Router history={createMemoryHistory()}>
      <AdvancedOptionsScreen
        hasBatches={false}
        unconfigureServer={unconfigureServer}
        zeroData={jest.fn()}
        backup={jest.fn()}
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
      />
    </Router>
  )

  let resolve!: () => void
  unconfigureServer.mockReturnValueOnce(
    new Promise<void>((res) => {
      resolve = res
    })
  )

  await act(async () => {
    // Click to reset.
    expect(unconfigureServer).not.toHaveBeenCalled()
    const resetButton = component.getByText('Factory Reset…')
    resetButton.click()

    // Confirm reset.
    expect(unconfigureServer).not.toHaveBeenCalled()
    const confirmResetButton = await waitFor(() =>
      component.getByText('Yes, Factory Reset')
    )
    confirmResetButton.click()
    expect(unconfigureServer).toHaveBeenCalledTimes(1)

    // Verify progress message is shown.
    await waitFor(() => component.getByText('Resetting…'))

    // Trigger reset finished, verify back to initial screen.
    resolve()
    await waitFor(() => !component.getByText('Resetting…'))
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
        isTestMode={false}
        isTogglingTestMode={false}
        toggleTestMode={jest.fn()}
        setMarkThresholdOverrides={jest.fn()}
        markThresholds={undefined}
        electionDefinition={testElectionDefinition}
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

test('override mark thresholds button shows when there are no overrides', async () => {
  const backup = jest.fn()

  const testCases = [
    {
      hasBatches: true,
      markThresholds: undefined,
      expectedText: 'Override Mark Thresholds…',
      expectButtonDisabled: true,
    },
    {
      hasBatches: true,
      markThresholds: { marginal: 0.3, definite: 0.4 },
      expectedText: 'Reset Mark Thresholds…',
      expectButtonDisabled: true,
    },
    {
      hasBatches: false,
      markThresholds: undefined,
      expectedText: 'Override Mark Thresholds…',
      expectButtonDisabled: false,
    },
    {
      hasBatches: false,
      markThresholds: { marginal: 0.3, definite: 0.4 },
      expectedText: 'Reset Mark Thresholds…',
      expectButtonDisabled: false,
    },
  ]

  for (const testCase of testCases) {
    const { getByText, unmount } = render(
      <Router history={createMemoryHistory()}>
        <AdvancedOptionsScreen
          hasBatches={testCase.hasBatches}
          unconfigureServer={jest.fn()}
          zeroData={jest.fn()}
          backup={backup}
          isTestMode={false}
          isTogglingTestMode={false}
          toggleTestMode={jest.fn()}
          setMarkThresholdOverrides={jest.fn()}
          markThresholds={testCase.markThresholds}
          electionDefinition={testElectionDefinition}
        />
      </Router>
    )

    getByText(testCase.expectedText)
    expect(
      getByText(testCase.expectedText)
        .closest('button')!
        .hasAttribute('disabled')
    ).toBe(testCase.expectButtonDisabled)
    unmount()
  }
})
