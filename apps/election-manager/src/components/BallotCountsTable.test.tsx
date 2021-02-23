import React from 'react'

import { getByText as domGetByText } from '@testing-library/react'

import {
  electionWithMsEitherNeither,
  multiPartyPrimaryElectionDefinition,
} from '@votingworks/fixtures'

import renderInAppContext from '../../test/renderInAppContext'
import {
  Dictionary,
  ExternalTally,
  Tally,
  TallyCategory,
  VotingMethod,
} from '../config/types'
import BallotCountsTable from './BallotCountsTable'
import fakeTally from '../../test/helpers/fakeTally'
import fakeExternalTally from '../../test/helpers/fakeExternalTally'

describe('Ballot Counts by Precinct', () => {
  const resultsByPrecinct: Dictionary<Tally> = {
    // French Camp
    '6526': fakeTally({
      numberOfBallotsCounted: 25,
    }),
    // Kenego
    '6529': fakeTally({
      numberOfBallotsCounted: 52,
    }),
    // District 5
    '6522': fakeTally({
      numberOfBallotsCounted: 0,
    }),
  }
  const resultsByCategory = new Map()
  resultsByCategory.set(TallyCategory.Precinct, resultsByPrecinct)

  const externalResultsByPrecinct: Dictionary<ExternalTally> = {
    // French Camp
    '6526': fakeExternalTally({
      numberOfBallotsCounted: 13,
    }),
    // East Weir
    '6525': fakeExternalTally({
      numberOfBallotsCounted: 0,
    }),
    // Hebron
    '6528': fakeExternalTally({
      numberOfBallotsCounted: 22,
    }),
  }
  const externalResultsByCategory = new Map()
  externalResultsByCategory.set(
    TallyCategory.Precinct,
    externalResultsByPrecinct
  )

  const fullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  }
  const fullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: 54,
    }),
    resultsByCategory: externalResultsByCategory,
  }

  it('renders as expected when there is no tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />
    )
    electionWithMsEitherNeither.precincts.forEach((precinct) => {
      getByText(precinct.name)
      const tableRow = getByText(precinct.name).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, 0))
      expect(
        domGetByText(tableRow!, `View Unofficial ${precinct.name} Tally Report`)
      )
    })
    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 0))
    expect(
      domGetByText(tableRow!, 'View Unofficial Tally Reports for All Precincts')
    )

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toBe(
      electionWithMsEitherNeither.precincts.length + 2
    )
  })

  it('renders as expected when there is tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      {
        fullElectionTally,
      }
    )
    electionWithMsEitherNeither.precincts.forEach((precinct) => {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0
      getByText(precinct.name)
      const tableRow = getByText(precinct.name).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, expectedNumberOfBallots))
      expect(
        domGetByText(tableRow!, `View Unofficial ${precinct.name} Tally Report`)
      )
    })
    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 77))
    expect(
      domGetByText(tableRow!, 'View Unofficial Tally Reports for All Precincts')
    )

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toBe(
      electionWithMsEitherNeither.precincts.length + 2
    )
  })

  it('renders as expected when there is tally data and sems data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      {
        fullElectionTally,
        fullElectionExternalTally,
      }
    )
    electionWithMsEitherNeither.precincts.forEach((precinct) => {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        (resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0) +
        (externalResultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0)
      getByText(precinct.name)
      const tableRow = getByText(precinct.name).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, expectedNumberOfBallots))
      expect(
        domGetByText(tableRow!, `View Unofficial ${precinct.name} Tally Report`)
      )
    })
    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 131))
    expect(
      domGetByText(tableRow!, 'View Unofficial Tally Reports for All Precincts')
    )

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toBe(
      electionWithMsEitherNeither.precincts.length + 2
    )
  })
})

describe('Ballot Counts by Scanner', () => {
  const resultsByScanner: Dictionary<Tally> = {
    'scanner-1': fakeTally({
      numberOfBallotsCounted: 25,
    }),
    'scanner-2': fakeTally({
      numberOfBallotsCounted: 52,
    }),
    'scanner-3': fakeTally({
      numberOfBallotsCounted: 0,
    }),
  }
  const resultsByCategory = new Map()
  resultsByCategory.set(TallyCategory.Scanner, resultsByScanner)

  const fullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  }
  const fullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: 54,
    }),
    resultsByCategory: new Map(),
  }

  it('renders as expected when there is no tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />
    )

    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 0))

    // There should be 2 rows in the table, the header row and the totals row.
    expect(getAllByTestId('table-row').length).toBe(2)
  })

  it('renders as expected when there is tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      {
        fullElectionTally,
      }
    )

    const scannerIds = ['scanner-1', 'scanner-2', 'scanner-3']

    scannerIds.forEach((scannerId) => {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        resultsByScanner[scannerId]?.numberOfBallotsCounted ?? 0
      getByText(scannerId)
      const tableRow = getByText(scannerId).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, expectedNumberOfBallots))
      if (expectedNumberOfBallots > 0) {
        expect(
          domGetByText(
            tableRow!,
            `View Unofficial Scanner ${scannerId} Tally Report`
          )
        )
      }
    })
    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 77))

    expect(getAllByTestId('table-row').length).toBe(scannerIds.length + 2)
  })

  it('renders as expected when there is tally data and sems data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      {
        fullElectionTally,
        fullElectionExternalTally,
        externalVoteRecordsFile: new File(['blah'], 'file-name.csv'),
      }
    )

    const scannerIds = ['scanner-1', 'scanner-2', 'scanner-3']

    scannerIds.forEach((scannerId) => {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        resultsByScanner[scannerId]?.numberOfBallotsCounted ?? 0
      getByText(scannerId)
      const tableRow = getByText(scannerId).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, expectedNumberOfBallots))
      if (expectedNumberOfBallots > 0) {
        expect(
          domGetByText(
            tableRow!,
            `View Unofficial Scanner ${scannerId} Tally Report`
          )
        )
      }
    })

    getByText('SEMS File (file-name.csv)')
    let tableRow = getByText('SEMS File (file-name.csv)').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 54))

    getByText('Total Ballot Count')
    tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 131))

    expect(getAllByTestId('table-row').length).toBe(scannerIds.length + 3)
  })
})

// Test party ballot counts
describe('Ballots Counts by Party', () => {
  const resultsByParty: Dictionary<Tally> = {
    // Liberty
    '0': fakeTally({
      numberOfBallotsCounted: 25,
    }),
    // Federalist
    '4': fakeTally({
      numberOfBallotsCounted: 52,
    }),
  }
  const resultsByCategory = new Map()
  resultsByCategory.set(TallyCategory.Party, resultsByParty)

  const externalResultsByParty: Dictionary<ExternalTally> = {
    // Liberty
    '0': fakeExternalTally({
      numberOfBallotsCounted: 13,
    }),
    // Constitution
    '3': fakeExternalTally({
      numberOfBallotsCounted: 73,
    }),
  }
  const externalResultsByCategory = new Map()
  externalResultsByCategory.set(TallyCategory.Party, externalResultsByParty)

  const fullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  }

  const fullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: 54,
    }),
    resultsByCategory: externalResultsByCategory,
  }

  it('does not render when the election has not ballot styles with parties', () => {
    // The default election is not a primary
    const { container } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders as expected when there is no data', () => {
    const expectedParties = [
      'Constitution Party',
      'Federalist Party',
      'Liberty Party',
    ]
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      {
        electionDefinition: {
          ...multiPartyPrimaryElectionDefinition,
          electionData: '',
        },
      }
    )

    expectedParties.forEach((partyName) => {
      getByText(partyName)
      const tableRow = getByText(partyName).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, 0))
      expect(
        domGetByText(tableRow!, `View Unofficial ${partyName} Tally Report`)
      )
    })

    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 0))
    expect(
      domGetByText(tableRow!, 'View Unofficial Full Election Tally Report')
    )

    expect(getAllByTestId('table-row').length).toBe(expectedParties.length + 2)
  })

  it('renders as expected when there is tally data', () => {
    const expectedParties = [
      { partyName: 'Constitution Party', partyId: '3' },
      { partyName: 'Federalist Party', partyId: '4' },
      { partyName: 'Liberty Party', partyId: '0' },
    ]
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      {
        electionDefinition: {
          ...multiPartyPrimaryElectionDefinition,
          electionData: '',
        },
        fullElectionTally,
      }
    )

    expectedParties.forEach(({ partyName, partyId }) => {
      const expectedNumberOfBallots =
        resultsByParty[partyId]?.numberOfBallotsCounted ?? 0
      getByText(partyName)
      const tableRow = getByText(partyName).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, expectedNumberOfBallots))
      expect(
        domGetByText(tableRow!, `View Unofficial ${partyName} Tally Report`)
      )
    })

    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 77))
    expect(
      domGetByText(tableRow!, 'View Unofficial Full Election Tally Report')
    )

    expect(getAllByTestId('table-row').length).toBe(expectedParties.length + 2)
  })

  it('renders as expected where there is tally data and sems data', () => {
    const expectedParties = [
      { partyName: 'Constitution Party', partyId: '3' },
      { partyName: 'Federalist Party', partyId: '4' },
      { partyName: 'Liberty Party', partyId: '0' },
    ]
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      {
        electionDefinition: {
          ...multiPartyPrimaryElectionDefinition,
          electionData: '',
        },
        fullElectionTally,
        fullElectionExternalTally,
      }
    )

    expectedParties.forEach(({ partyName, partyId }) => {
      const expectedNumberOfBallots =
        (resultsByParty[partyId]?.numberOfBallotsCounted ?? 0) +
        (externalResultsByParty[partyId]?.numberOfBallotsCounted ?? 0)
      getByText(partyName)
      const tableRow = getByText(partyName).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, expectedNumberOfBallots))
      expect(
        domGetByText(tableRow!, `View Unofficial ${partyName} Tally Report`)
      )
    })

    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 131))
    expect(
      domGetByText(tableRow!, 'View Unofficial Full Election Tally Report')
    )

    expect(getAllByTestId('table-row').length).toBe(expectedParties.length + 2)
  })
})

describe('Ballots Counts by VotingMethod', () => {
  const resultsByVotingMethod: Dictionary<Tally> = {
    [VotingMethod.Absentee]: fakeTally({
      numberOfBallotsCounted: 25,
    }),
    [VotingMethod.Precinct]: fakeTally({
      numberOfBallotsCounted: 42,
    }),
    [VotingMethod.Unknown]: fakeTally({
      numberOfBallotsCounted: 10,
    }),
  }
  const resultsByCategory = new Map()
  resultsByCategory.set(TallyCategory.VotingMethod, resultsByVotingMethod)

  const fullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  }

  const fullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: 54,
    }),
    resultsByCategory: new Map(),
  }

  it('renders as expected when there is no data', () => {
    // No row for "Other" ballots renders when there are 0 CVRs for that category.
    const expectedLabels = ['Absentee', 'Precinct']
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />
    )

    expectedLabels.forEach((label) => {
      getByText(label)
      const tableRow = getByText(label).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, 0))
      expect(
        domGetByText(tableRow!, `View Unofficial ${label} Ballot Tally Report`)
      )
    })

    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 0))

    expect(getAllByTestId('table-row').length).toBe(expectedLabels.length + 2)
  })

  it('renders as expected when there is tally data', () => {
    const expectedLabels = [
      {
        method: VotingMethod.Absentee,
        label: 'Absentee',
      },
      { method: VotingMethod.Precinct, label: 'Precinct' },
      { method: VotingMethod.Unknown, label: 'Other' },
    ]
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />,
      { fullElectionTally }
    )

    expectedLabels.forEach(({ method, label }) => {
      const expectedNumberOfBallots =
        resultsByVotingMethod[method]?.numberOfBallotsCounted ?? 0
      getByText(label)
      const tableRow = getByText(label).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, expectedNumberOfBallots))
      expect(
        domGetByText(tableRow!, `View Unofficial ${label} Ballot Tally Report`)
      )
    })

    getByText('Total Ballot Count')
    const tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 77))

    expect(getAllByTestId('table-row').length).toBe(expectedLabels.length + 2)
  })

  it('renders as expected where there is tally data and sems data', () => {
    const expectedLabels = [
      {
        method: VotingMethod.Absentee,
        label: 'Absentee',
      },
      { method: VotingMethod.Precinct, label: 'Precinct' },
      { method: VotingMethod.Unknown, label: 'Other' },
    ]
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />,
      {
        fullElectionTally,
        fullElectionExternalTally,
        externalVoteRecordsFile: new File(['blah'], 'file-name.csv'),
      }
    )

    expectedLabels.forEach(({ method, label }) => {
      const expectedNumberOfBallots =
        resultsByVotingMethod[method]?.numberOfBallotsCounted ?? 0
      getByText(label)
      const tableRow = getByText(label).closest('tr')
      expect(tableRow).toBeDefined()
      expect(domGetByText(tableRow!, expectedNumberOfBallots))
      expect(
        domGetByText(tableRow!, `View Unofficial ${label} Ballot Tally Report`)
      )
    })

    getByText('SEMS File (file-name.csv)')
    let tableRow = getByText('SEMS File (file-name.csv)').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 54))

    getByText('Total Ballot Count')
    tableRow = getByText('Total Ballot Count').closest('tr')
    expect(tableRow).toBeDefined()
    expect(domGetByText(tableRow!, 131))

    expect(getAllByTestId('table-row').length).toBe(expectedLabels.length + 3)
  })
})
