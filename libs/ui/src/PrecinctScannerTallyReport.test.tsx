import React from 'react'
import { render, act, screen } from '@testing-library/react'
import { electionSample, electionSampleDefinition } from '@votingworks/fixtures'
import { CastVoteRecord, PrecinctSelectionKind } from '@votingworks/types'
import { calculateTallyForCastVoteRecords } from '@votingworks/utils'
import { fakeKiosk, mockOf } from '@votingworks/test-utils'

import { PrecinctScannerTallyReport } from './PrecinctScannerTallyReport'

afterEach(() => {
  window.kiosk = undefined
})

const time = new Date(2021, 8, 19, 11, 5).getTime()

test('renders without results reporting when no CVRs', async () => {
  const mockKiosk = fakeKiosk()
  mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE')
  window.kiosk = mockKiosk
  const tally = calculateTallyForCastVoteRecords(electionSample, new Set([]))

  await act(async () => {
    render(
      <PrecinctScannerTallyReport
        reportSavedTime={time}
        electionDefinition={electionSampleDefinition}
        signingMachineId="DEMO-0000"
        precinctSelection={{ kind: PrecinctSelectionKind.AllPrecincts }}
        reportPurpose="Testing"
        isPollsOpen={false}
        isLiveMode
        tally={tally}
      />
    )
  })

  expect(screen.queryByText('Automatic Election Results Reporting')).toBeNull()
})

const cvr: CastVoteRecord = {
  _precinctId: electionSample.precincts[0].id,
  _ballotId: 'test-123',
  _ballotStyleId: electionSample.ballotStyles[0].id,
  _batchId: 'batch-1',
  _batchLabel: 'batch-1',
  _ballotType: 'standard',
  _testBallot: false,
  _scannerId: 'DEMO-0000',
  'county-commissioners': ['argent'],
}

test('renders WITHOUT results reporting when there are CVRs but polls are open', async () => {
  const mockKiosk = fakeKiosk()
  mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE')
  window.kiosk = mockKiosk

  const tally = calculateTallyForCastVoteRecords(electionSample, new Set([cvr]))

  await act(async () => {
    render(
      <PrecinctScannerTallyReport
        reportSavedTime={time}
        electionDefinition={electionSampleDefinition}
        signingMachineId="DEMO-0000"
        precinctSelection={{ kind: PrecinctSelectionKind.AllPrecincts }}
        reportPurpose="Testing"
        isPollsOpen
        isLiveMode
        tally={tally}
      />
    )
  })

  expect(screen.queryByText('Automatic Election Results Reporting')).toBeNull()
})

test('renders with results reporting when there are CVRs and polls are closed', async () => {
  const mockKiosk = fakeKiosk()
  mockOf(mockKiosk.sign).mockResolvedValue('FAKESIGNATURE')
  window.kiosk = mockKiosk

  const tally = calculateTallyForCastVoteRecords(electionSample, new Set([cvr]))

  await act(async () => {
    render(
      <PrecinctScannerTallyReport
        reportSavedTime={time}
        electionDefinition={electionSampleDefinition}
        signingMachineId="DEMO-0000"
        precinctSelection={{ kind: PrecinctSelectionKind.AllPrecincts }}
        reportPurpose="Testing"
        isPollsOpen={false}
        isLiveMode
        tally={tally}
      />
    )
  })

  const payloadComponents = mockKiosk.sign.mock.calls[0][0].payload.split('.')
  expect(payloadComponents).toEqual([
    electionSampleDefinition.electionHash,
    'DEMO-0000',
    '1', // live election
    expect.any(String),
    expect.any(String),
  ])

  expect(
    screen.queryByText('Automatic Election Results Reporting')
  ).toBeTruthy()
})
