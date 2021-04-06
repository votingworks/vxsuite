import React from 'react'
import {
  multiPartyPrimaryElectionDefinition,
  electionWithMsEitherNeitherDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures'
import { Route } from 'react-router-dom'
import { fireEvent, within } from '@testing-library/react'

import ManualDataImportScreen from './ManualDataImportScreen'
import renderInAppContext from '../../test/renderInAppContext'
import {
  ContestOptionTally,
  ContestTally,
  ExternalTallySourceType,
  FullElectionExternalTally,
  TallyCategory,
  VotingMethod,
} from '../config/types'
import {
  getEmptyExternalTalliesByPrecinct,
  getEmptyExternalTally,
} from '../utils/externalTallies'

test('can toggle ballot types for data', async () => {
  const saveExternalTallies = jest.fn()
  const { getByText, getByTestId } = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: multiPartyPrimaryElectionDefinition,
      saveExternalTallies,
    }
  )
  getByText('Manually Add External Results')

  // Precinct ballots should be selected by default but should be able to toggle to absentee.
  expect(getByTestId('ballottype-precinct').closest('button')).toBeDisabled()
  expect(
    getByTestId('ballottype-absentee').closest('button')
  ).not.toBeDisabled()

  fireEvent.click(getByTestId('ballottype-absentee'))
  expect(
    getByTestId('ballottype-precinct').closest('button')
  ).not.toBeDisabled()
  expect(getByTestId('ballottype-absentee').closest('button')).toBeDisabled()

  fireEvent.click(getByText('Save Manual Data'))
  expect(saveExternalTallies).toHaveBeenCalled()
  expect(saveExternalTallies).toHaveBeenCalledWith([
    expect.objectContaining({
      source: ExternalTallySourceType.Manual,
      votingMethod: VotingMethod.Absentee,
    }),
  ])

  fireEvent.click(getByTestId('ballottype-precinct'))
  fireEvent.click(getByText('Save Manual Data'))
  expect(saveExternalTallies).toHaveBeenCalledTimes(2)
  expect(saveExternalTallies).toHaveBeenCalledWith([
    expect.objectContaining({
      source: ExternalTallySourceType.Manual,
      votingMethod: VotingMethod.Precinct,
    }),
  ])
})

test('can toggle precincts and view correct contests for each precinct', async () => {
  const saveExternalTallies = jest.fn()
  const { getByText, queryAllByText, getByTestId } = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: electionWithMsEitherNeitherDefinition,
      saveExternalTallies,
    }
  )
  getByText('Manually Add External Results')

  getByText('Contest Results for District 5')
  // Check that contests that don't exist in ballot styles for District 5 don't show up
  expect(queryAllByText(/Election Commissioner 01/).length).toBe(0)
  expect(queryAllByText(/Election Commissioner 02/).length).toBe(0)
  getByText(/Election Commissioner 05/)
  getByText(/President/)

  fireEvent.change(getByTestId('selectPrecinct'), { target: { value: '6532' } })

  getByText('Contest Results for Panhandle')
  // Check that contests that don't exist in ballot styles for District 5 don't show up
  expect(queryAllByText(/Election Commissioner 01/).length).toBe(0)
  expect(queryAllByText(/Election Commissioner 05/).length).toBe(0)
  getByText(/Election Commissioner 04/)
  getByText(/President/)

  fireEvent.change(getByTestId('selectPrecinct'), { target: { value: '6539' } })

  getByText('Contest Results for West Weir')
  // Check that contests that don't exist in ballot styles for District 5 don't show up
  expect(queryAllByText(/Election Commissioner 04/).length).toBe(0)
  expect(queryAllByText(/Election Commissioner 05/).length).toBe(0)
  getByText(/Election Commissioner 03/)
  getByText(/President/)
})

test('can enter data for candidate contests as expected', async () => {
  const saveExternalTallies = jest.fn()
  const { getByText, queryAllByTestId, getByTestId } = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      saveExternalTallies,
      electionDefinition: electionSampleDefinition,
    }
  )
  getByText('Manually Add External Results')

  // Input elements start as 0
  expect(getByTestId('president-numBallots').closest('input')!.value).toBe('0')
  // We can not change the input to a non number
  fireEvent.change(getByTestId('president-numBallots').closest('input')!, {
    target: { value: 'daylight' },
  })
  expect(getByTestId('president-numBallots').closest('input')!.value).toBe('0')

  // We can change the input to a number
  fireEvent.change(getByTestId('president-numBallots').closest('input')!, {
    target: { value: '100' },
  })
  expect(getByTestId('president-numBallots').closest('input')!.value).toBe(
    '100'
  )
  fireEvent.change(getByTestId('president-undervotes').closest('input')!, {
    target: { value: '4' },
  })
  fireEvent.change(getByTestId('president-overvotes').closest('input')!, {
    target: { value: '6' },
  })
  fireEvent.change(getByTestId('president-barchi-hallaren').closest('input')!, {
    target: { value: '10' },
  })
  fireEvent.change(getByTestId('president-cramer-vuocolo').closest('input')!, {
    target: { value: '20' },
  })
  fireEvent.change(getByTestId('president-court-blumhardt').closest('input')!, {
    target: { value: '35' },
  })
  fireEvent.change(getByTestId('president-boone-lian').closest('input')!, {
    target: { value: '25' },
  })

  // A contest that does not allow write ins has no write in row.
  expect(queryAllByTestId('president-__write-in').length).toBe(0)
  fireEvent.click(getByText('Save Manual Data'))
  expect(saveExternalTallies).toHaveBeenCalledTimes(1)
  expect(saveExternalTallies).toHaveBeenCalledWith([
    expect.objectContaining({
      overallTally: {
        numberOfBallotsCounted: 100,
        contestTallies: expect.objectContaining({
          president: expect.objectContaining({
            metadata: { ballots: 100, undervotes: 4, overvotes: 6 },
            tallies: {
              'barchi-hallaren': expect.objectContaining({ tally: 10 }),
              'cramer-vuocolo': expect.objectContaining({ tally: 20 }),
              'court-blumhardt': expect.objectContaining({ tally: 35 }),
              'boone-lian': expect.objectContaining({ tally: 25 }),
              'hildebrand-garritty': expect.objectContaining({ tally: 0 }),
              'patterson-lariviere': expect.objectContaining({ tally: 0 }),
            },
          }),
        }),
      },
    }),
  ])

  // A contest that allows write ins has a write in row.
  getByTestId('county-commissioners-__write-in')
  fireEvent.change(
    getByTestId('county-commissioners-numBallots').closest('input')!,
    {
      target: { value: '10' },
    }
  )
  fireEvent.change(
    getByTestId('county-commissioners-__write-in').closest('input')!,
    {
      target: { value: '10' },
    }
  )
  fireEvent.click(getByText('Save Manual Data'))
  expect(saveExternalTallies).toHaveBeenCalledWith([
    expect.objectContaining({
      overallTally: {
        numberOfBallotsCounted: 100,
        contestTallies: expect.objectContaining({
          president: expect.objectContaining({
            metadata: { ballots: 100, undervotes: 4, overvotes: 6 },
          }),
          'county-commissioners': expect.objectContaining({
            metadata: { ballots: 10, undervotes: 0, overvotes: 0 },
            tallies: expect.objectContaining({
              '__write-in': expect.objectContaining({ tally: 10 }),
            }),
          }),
        }),
      },
    }),
  ])
})

test('can enter data for yes no contests as expected', async () => {
  const saveExternalTallies = jest.fn()
  const { getByText, queryAllByTestId, getByTestId } = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      saveExternalTallies,
      electionDefinition: electionSampleDefinition,
    }
  )
  getByText('Manually Add External Results')

  // Input elements start as 0
  expect(
    getByTestId('judicial-robert-demergue-numBallots').closest('input')!.value
  ).toBe('0')
  // We can not change the input to a non number
  fireEvent.change(
    getByTestId('judicial-robert-demergue-numBallots').closest('input')!,
    {
      target: { value: 'daylight' },
    }
  )
  expect(
    getByTestId('judicial-robert-demergue-numBallots').closest('input')!.value
  ).toBe('0')

  // We can change the input to a number
  fireEvent.change(
    getByTestId('judicial-robert-demergue-numBallots').closest('input')!,
    {
      target: { value: '100' },
    }
  )
  expect(
    getByTestId('judicial-robert-demergue-numBallots').closest('input')!.value
  ).toBe('100')
  fireEvent.change(
    getByTestId('judicial-robert-demergue-undervotes').closest('input')!,
    {
      target: { value: '4' },
    }
  )
  fireEvent.change(
    getByTestId('judicial-robert-demergue-overvotes').closest('input')!,
    {
      target: { value: '6' },
    }
  )
  fireEvent.change(
    getByTestId('judicial-robert-demergue-yes').closest('input')!,
    {
      target: { value: '50' },
    }
  )
  fireEvent.change(
    getByTestId('judicial-robert-demergue-no').closest('input')!,
    {
      target: { value: '40' },
    }
  )

  // A yes no contest does not allow write ins has no write in row.
  expect(queryAllByTestId('president-__write-in').length).toBe(0)
  fireEvent.click(getByText('Save Manual Data'))
  expect(saveExternalTallies).toHaveBeenCalledTimes(1)
  expect(saveExternalTallies).toHaveBeenCalledWith([
    expect.objectContaining({
      overallTally: {
        numberOfBallotsCounted: 100,
        contestTallies: expect.objectContaining({
          'judicial-robert-demergue': expect.objectContaining({
            metadata: { ballots: 100, undervotes: 4, overvotes: 6 },
            tallies: {
              yes: { option: ['yes'], tally: 50 },
              no: { option: ['no'], tally: 40 },
            },
          }),
        }),
      },
    }),
  ])
})

test('summary table stays up to date', async () => {
  const { getByText, getByTestId } = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: electionSampleDefinition,
    }
  )
  getByText('Manually Add External Results')

  // Everything should start as 0s
  const summaryTable = getByTestId('summary-data')
  const centerSpringfield = within(summaryTable)
    .getByText('Center Springfield')
    .closest('tr')!
  expect(within(centerSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  )
  const southSpringfield = within(summaryTable)
    .getByText('South Springfield')
    .closest('tr')!
  expect(within(southSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  )
  const northSpringfield = within(summaryTable)
    .getByText('North Springfield')
    .closest('tr')!
  expect(within(northSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  )
  expect(getByTestId('total-ballots-entered')).toHaveTextContent('0')

  // Change the number of ballots in center springfield
  fireEvent.change(getByTestId('president-numBallots').closest('input')!, {
    target: { value: '100' },
  })
  expect(within(centerSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '100'
  )
  expect(within(southSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  )
  expect(within(northSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  )
  expect(getByTestId('total-ballots-entered')).toHaveTextContent('100')

  // Change the number of ballots in south springfield
  fireEvent.change(getByTestId('selectPrecinct'), { target: { value: '20' } })
  fireEvent.change(
    getByTestId('primary-constitution-head-of-party-numBallots').closest(
      'input'
    )!,
    {
      target: { value: '50' },
    }
  )
  expect(within(centerSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '100'
  )
  expect(within(southSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '50'
  )
  expect(within(northSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '0'
  )
  expect(getByTestId('total-ballots-entered')).toHaveTextContent('150')
})

test('loads prexisting manual data to edit', async () => {
  const talliesByPrecinct = getEmptyExternalTalliesByPrecinct(
    electionSampleDefinition.election
  )
  talliesByPrecinct['23'] = {
    numberOfBallotsCounted: 100,
    contestTallies: {
      ...talliesByPrecinct['23']?.contestTallies,
      'county-commissioners': ({
        tallies: {
          argent: { tally: 80 } as ContestOptionTally,
          '__write-in': { tally: 60 } as ContestOptionTally,
          witherspoonsmithson: { tally: 40 } as ContestOptionTally,
        },
        metadata: { undervotes: 220, overvotes: 0, ballots: 100 },
      } as unknown) as ContestTally,
      'judicial-robert-demergue': ({
        tallies: {
          yes: { option: ['yes'], tally: 40 },
          no: { option: ['no'], tally: 30 },
        },
        metadata: { ballots: 90, undervotes: 12, overvotes: 8 },
      } as unknown) as ContestTally,
    },
  }
  talliesByPrecinct['20'] = {
    numberOfBallotsCounted: 50,
    contestTallies: {
      ...talliesByPrecinct['20']?.contestTallies,
      'primary-constitution-head-of-party': ({
        tallies: {
          alice: { tally: 25 } as ContestOptionTally,
          bob: { tally: 5 } as ContestOptionTally,
        },
        metadata: { undervotes: 4, overvotes: 6, ballots: 50 },
      } as unknown) as ContestTally,
    },
  }
  talliesByPrecinct['21'] = {
    numberOfBallotsCounted: 7,
    contestTallies: {
      ...talliesByPrecinct['21']?.contestTallies,
      'judicial-robert-demergue': ({
        tallies: {
          yes: { option: ['yes'], tally: 4 },
          no: { option: ['no'], tally: 3 },
        },
        metadata: { ballots: 7, undervotes: 0, overvotes: 0 },
      } as unknown) as ContestTally,
    },
  }
  const resultsByCategory = new Map()
  resultsByCategory.set(TallyCategory.Precinct, talliesByPrecinct)
  const externalTally: FullElectionExternalTally = {
    overallTally: getEmptyExternalTally(),
    resultsByCategory,
    votingMethod: VotingMethod.Absentee,
    inputSourceName: 'Doesnt matter',
    source: ExternalTallySourceType.Manual,
    timestampCreated: new Date(),
  }

  const saveExternalTallies = jest.fn()
  const { getByText, getByTestId } = renderInAppContext(
    <Route path="/tally/manual-data-import">
      <ManualDataImportScreen />
    </Route>,
    {
      route: '/tally/manual-data-import',
      electionDefinition: electionSampleDefinition,
      saveExternalTallies,
      fullElectionExternalTallies: [externalTally],
    }
  )
  getByText('Manually Add External Results')
  // Absentee ballot type should be selected
  expect(
    getByTestId('ballottype-precinct').closest('button')
  ).not.toBeDisabled()
  expect(getByTestId('ballottype-absentee').closest('button')).toBeDisabled()

  // Make sure all the summary loaded as expected
  expect(getByTestId('total-ballots-entered')).toHaveTextContent('157')
  const summaryTable = getByTestId('summary-data')
  const centerSpringfield = within(summaryTable)
    .getByText('Center Springfield')
    .closest('tr')!
  expect(within(centerSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '100'
  )
  const southSpringfield = within(summaryTable)
    .getByText('South Springfield')
    .closest('tr')!
  expect(within(southSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '50'
  )
  const northSpringfield = within(summaryTable)
    .getByText('North Springfield')
    .closest('tr')!
  expect(within(northSpringfield).getByTestId('numBallots')).toHaveTextContent(
    '7'
  )

  // Make sure the specific contests loaded as expected. First for Center Springfield
  getByText('Contest Results for Center Springfield')
  expect(
    getByTestId('county-commissioners-numBallots').closest('input')!.value
  ).toBe('100')
  expect(
    getByTestId('county-commissioners-undervotes').closest('input')!.value
  ).toBe('220')
  expect(
    getByTestId('county-commissioners-overvotes').closest('input')!.value
  ).toBe('0')
  expect(
    getByTestId('county-commissioners-argent').closest('input')!.value
  ).toBe('80')
  expect(
    getByTestId('county-commissioners-witherspoonsmithson').closest('input')!
      .value
  ).toBe('40')
  expect(
    getByTestId('county-commissioners-bainbridge').closest('input')!.value
  ).toBe('0')
  expect(
    getByTestId('county-commissioners-__write-in').closest('input')!.value
  ).toBe('60')

  expect(
    getByTestId('judicial-robert-demergue-numBallots').closest('input')!.value
  ).toBe('90')
  expect(
    getByTestId('judicial-robert-demergue-undervotes').closest('input')!.value
  ).toBe('12')
  expect(
    getByTestId('judicial-robert-demergue-overvotes').closest('input')!.value
  ).toBe('8')
  expect(
    getByTestId('judicial-robert-demergue-yes').closest('input')!.value
  ).toBe('40')
  expect(
    getByTestId('judicial-robert-demergue-no').closest('input')!.value
  ).toBe('30')

  // Check South Springfield
  fireEvent.change(getByTestId('selectPrecinct'), { target: { value: '20' } })
  expect(
    getByTestId('primary-constitution-head-of-party-numBallots').closest(
      'input'
    )!.value
  ).toBe('50')
  expect(
    getByTestId('primary-constitution-head-of-party-undervotes').closest(
      'input'
    )!.value
  ).toBe('4')
  expect(
    getByTestId('primary-constitution-head-of-party-overvotes').closest(
      'input'
    )!.value
  ).toBe('6')
  expect(
    getByTestId('primary-constitution-head-of-party-alice').closest('input')!
      .value
  ).toBe('25')
  expect(
    getByTestId('primary-constitution-head-of-party-bob').closest('input')!
      .value
  ).toBe('5')

  // Check North Springfield
  fireEvent.change(getByTestId('selectPrecinct'), { target: { value: '21' } })
  expect(
    getByTestId('judicial-robert-demergue-numBallots').closest('input')!.value
  ).toBe('7')
  expect(
    getByTestId('judicial-robert-demergue-undervotes').closest('input')!.value
  ).toBe('0')
  expect(
    getByTestId('judicial-robert-demergue-overvotes').closest('input')!.value
  ).toBe('0')
  expect(
    getByTestId('judicial-robert-demergue-yes').closest('input')!.value
  ).toBe('4')
  expect(
    getByTestId('judicial-robert-demergue-no').closest('input')!.value
  ).toBe('3')
})
