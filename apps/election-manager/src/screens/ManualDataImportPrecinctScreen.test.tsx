import React from 'react'
import {
  electionWithMsEitherNeitherDefinition,
  electionSampleDefinition,
} from '@votingworks/fixtures'
import { Route } from 'react-router-dom'
import { fireEvent } from '@testing-library/react'

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
import ManualDataImportPrecinctScreen from './ManualDataImportPrecinctScreen'

test('displays error screen for invalid precinct', async () => {
  const { getByText } = renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/12345',
      electionDefinition: electionWithMsEitherNeitherDefinition,
    }
  )
  getByText('Error: Could not find precinct 12345.')
  getByText('Back to Index')
})

test('displays correct contests for each precinct', async () => {
  const saveExternalTallies = jest.fn()
  const commissionerRaces = [
    'Election Commissioner 01',
    'Election Commissioner 02',
    'Election Commissioner 03',
    'Election Commissioner 04',
    'Election Commissioner 05',
  ]
  const testcases = [
    {
      precinctId: '6538',
      precinctName: 'Bywy',
      expectedCommissionerRace: commissionerRaces[0],
    },
    {
      precinctId: '6528',
      precinctName: 'Hebron',
      expectedCommissionerRace: commissionerRaces[1],
    },
    {
      precinctId: '6539',
      precinctName: 'West Weir',
      expectedCommissionerRace: commissionerRaces[2],
    },
    {
      precinctId: '6532',
      precinctName: 'Panhandle',
      expectedCommissionerRace: commissionerRaces[3],
    },
    {
      precinctId: '6522',
      precinctName: 'District 5',
      expectedCommissionerRace: commissionerRaces[4],
    },
  ]

  for (const {
    precinctId,
    precinctName,
    expectedCommissionerRace,
  } of testcases) {
    const {
      getByText,
      getAllByText,
      queryAllByText,
      unmount,
    } = renderInAppContext(
      <Route path="/tally/manual-data-import/precinct/:precinctId">
        <ManualDataImportPrecinctScreen />
      </Route>,
      {
        route: `/tally/manual-data-import/precinct/${precinctId}`,
        electionDefinition: electionWithMsEitherNeitherDefinition,
        saveExternalTallies,
      }
    )
    getByText('Manually Entered Precinct Results:')
    getByText(`Save Precinct Results for ${precinctName}`)

    // All precincts have the president contest
    getByText('President')
    // Check that only the expected election commissioner race is shown (the title is shown twice as the section and contest title)
    commissionerRaces.forEach((raceName) => {
      expect(queryAllByText(raceName)).toHaveLength(
        raceName === expectedCommissionerRace ? 2 : 0
      )
    })

    unmount()
  }
})

test('can enter data for candidate contests as expected', async () => {
  const saveExternalTallies = jest.fn()
  const {
    getByText,
    getAllByText,
    queryAllByTestId,
    getByTestId,
  } = renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      saveExternalTallies,
      electionDefinition: electionSampleDefinition,
    }
  )
  getByText('Manually Entered Precinct Results:')
  getByText('Center Springfield')

  // Input elements start as 0
  expect(getByTestId('president-undervotes').closest('input')!.value).toBe('0')
  // We can not change the input to a non number
  fireEvent.change(getByTestId('president-undervotes').closest('input')!, {
    target: { value: 'daylight' },
  })
  expect(getByTestId('president-undervotes').closest('input')!.value).toBe('0')
  // We can change the input to an empty string
  fireEvent.change(getByTestId('president-undervotes').closest('input')!, {
    target: { value: '' },
  })
  expect(getByTestId('president-undervotes').closest('input')!.value).toBe('')

  // We can change the input to a number
  fireEvent.change(getByTestId('president-undervotes').closest('input')!, {
    target: { value: '4' },
  })
  expect(getByTestId('president-undervotes').closest('input')!.value).toBe('4')
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
  fireEvent.click(getByText('Save Precinct Results for Center Springfield'))
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
    getByTestId('county-commissioners-__write-in').closest('input')!,
    {
      target: { value: '10' },
    }
  )
  fireEvent.change(
    getByTestId('county-commissioners-undervotes').closest('input')!,
    {
      target: { value: '30' },
    }
  )
  fireEvent.click(getByText('Save Precinct Results for Center Springfield'))
  expect(saveExternalTallies).toHaveBeenCalledTimes(2)
  expect(saveExternalTallies).toHaveBeenNthCalledWith(2, [
    expect.objectContaining({
      overallTally: {
        numberOfBallotsCounted: 100,
        contestTallies: expect.objectContaining({
          president: expect.objectContaining({
            metadata: { ballots: 100, undervotes: 4, overvotes: 6 },
          }),
          'county-commissioners': expect.objectContaining({
            metadata: { ballots: 10, undervotes: 30, overvotes: 0 },
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
  const {
    getByText,
    getAllByText,
    queryAllByTestId,
    getByTestId,
  } = renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      saveExternalTallies,
      electionDefinition: electionSampleDefinition,
    }
  )
  getByText('Manually Entered Precinct Results:')
  getByText('Center Springfield')

  // Input elements start as 0
  expect(
    getByTestId('judicial-robert-demergue-yes').closest('input')!.value
  ).toBe('0')
  // We can not change the input to a non number
  fireEvent.change(
    getByTestId('judicial-robert-demergue-yes').closest('input')!,
    {
      target: { value: 'daylight' },
    }
  )
  expect(
    getByTestId('judicial-robert-demergue-yes').closest('input')!.value
  ).toBe('0')

  // We can change the input to a number
  fireEvent.change(
    getByTestId('judicial-robert-demergue-yes').closest('input')!,
    {
      target: { value: '50' },
    }
  )
  expect(
    getByTestId('judicial-robert-demergue-yes').closest('input')!.value
  ).toBe('50')
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
    getByTestId('judicial-robert-demergue-no').closest('input')!,
    {
      target: { value: '40' },
    }
  )

  // A yes no contest does not allow write ins has no write in row.
  expect(queryAllByTestId('president-__write-in').length).toBe(0)
  fireEvent.click(getByText('Save Precinct Results for Center Springfield'))
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

test('loads prexisting manual data to edit', async () => {
  const talliesByPrecinct = getEmptyExternalTalliesByPrecinct(
    electionSampleDefinition.election
  )
  talliesByPrecinct['23'] = {
    numberOfBallotsCounted: 100,
    contestTallies: {
      ...talliesByPrecinct['23']?.contestTallies,
      'county-commissioners': ({
        ...talliesByPrecinct['23']?.contestTallies['county-commissioners'],
        tallies: {
          argent: { tally: 80 } as ContestOptionTally,
          '__write-in': { tally: 60 } as ContestOptionTally,
          witherspoonsmithson: { tally: 40 } as ContestOptionTally,
        },
        metadata: { undervotes: 220, overvotes: 0, ballots: 100 },
      } as unknown) as ContestTally,
      'judicial-robert-demergue': ({
        ...talliesByPrecinct['23']?.contestTallies['judicial-robert-demergue'],
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
        ...talliesByPrecinct['20']?.contestTallies[
          'primary-constitution-head-of-party'
        ],
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
        ...talliesByPrecinct['21']?.contestTallies['judicial-robert-demergue'],
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
  const centerSpringfield = renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/23',
      saveExternalTallies,
      electionDefinition: electionSampleDefinition,
      fullElectionExternalTallies: [externalTally],
    }
  )
  centerSpringfield.getByText('Manually Entered Absentee Results:')

  // Make sure the specific contests loaded as expected.
  expect(
    centerSpringfield.getByTestId('county-commissioners-numBallots')
  ).toHaveTextContent('100')
  expect(
    centerSpringfield
      .getByTestId('county-commissioners-undervotes')
      .closest('input')!.value
  ).toBe('220')
  expect(
    centerSpringfield
      .getByTestId('county-commissioners-overvotes')
      .closest('input')!.value
  ).toBe('0')
  expect(
    centerSpringfield
      .getByTestId('county-commissioners-argent')
      .closest('input')!.value
  ).toBe('80')
  expect(
    centerSpringfield
      .getByTestId('county-commissioners-witherspoonsmithson')
      .closest('input')!.value
  ).toBe('40')
  expect(
    centerSpringfield
      .getByTestId('county-commissioners-bainbridge')
      .closest('input')!.value
  ).toBe('0')
  expect(
    centerSpringfield
      .getByTestId('county-commissioners-__write-in')
      .closest('input')!.value
  ).toBe('60')

  expect(
    centerSpringfield.getByTestId('judicial-robert-demergue-numBallots')
  ).toHaveTextContent('90')
  expect(
    centerSpringfield
      .getByTestId('judicial-robert-demergue-undervotes')
      .closest('input')!.value
  ).toBe('12')
  expect(
    centerSpringfield
      .getByTestId('judicial-robert-demergue-overvotes')
      .closest('input')!.value
  ).toBe('8')
  expect(
    centerSpringfield
      .getByTestId('judicial-robert-demergue-yes')
      .closest('input')!.value
  ).toBe('40')
  expect(
    centerSpringfield
      .getByTestId('judicial-robert-demergue-no')
      .closest('input')!.value
  ).toBe('30')

  // Check South Springfield
  centerSpringfield.unmount()
  const southSpringfieldComponent = renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/20',
      saveExternalTallies,
      electionDefinition: electionSampleDefinition,
      fullElectionExternalTallies: [externalTally],
    }
  )
  southSpringfieldComponent.getByText('Manually Entered Absentee Results:')
  southSpringfieldComponent.getByText('South Springfield')
  expect(
    southSpringfieldComponent.getByTestId(
      'primary-constitution-head-of-party-numBallots'
    )
  ).toHaveTextContent('50')
  expect(
    southSpringfieldComponent
      .getByTestId('primary-constitution-head-of-party-undervotes')
      .closest('input')!.value
  ).toBe('4')
  expect(
    southSpringfieldComponent
      .getByTestId('primary-constitution-head-of-party-overvotes')
      .closest('input')!.value
  ).toBe('6')
  expect(
    southSpringfieldComponent
      .getByTestId('primary-constitution-head-of-party-alice')
      .closest('input')!.value
  ).toBe('25')
  expect(
    southSpringfieldComponent
      .getByTestId('primary-constitution-head-of-party-bob')
      .closest('input')!.value
  ).toBe('5')

  // Check North Springfield
  southSpringfieldComponent.unmount()
  const northSpringfieldComponent = renderInAppContext(
    <Route path="/tally/manual-data-import/precinct/:precinctId">
      <ManualDataImportPrecinctScreen />
    </Route>,
    {
      route: '/tally/manual-data-import/precinct/21',
      saveExternalTallies,
      electionDefinition: electionSampleDefinition,
      fullElectionExternalTallies: [externalTally],
    }
  )
  northSpringfieldComponent.getByText('Manually Entered Absentee Results:')
  northSpringfieldComponent.getByText('North Springfield')

  expect(
    northSpringfieldComponent.getByTestId('judicial-robert-demergue-numBallots')
  ).toHaveTextContent('7')
  expect(
    northSpringfieldComponent
      .getByTestId('judicial-robert-demergue-undervotes')
      .closest('input')!.value
  ).toBe('0')
  expect(
    northSpringfieldComponent
      .getByTestId('judicial-robert-demergue-overvotes')
      .closest('input')!.value
  ).toBe('0')
  expect(
    northSpringfieldComponent
      .getByTestId('judicial-robert-demergue-yes')
      .closest('input')!.value
  ).toBe('4')
  expect(
    northSpringfieldComponent
      .getByTestId('judicial-robert-demergue-no')
      .closest('input')!.value
  ).toBe('3')
})
