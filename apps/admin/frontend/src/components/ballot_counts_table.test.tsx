import React from 'react';

import {
  electionWithMsEitherNeither,
  multiPartyPrimaryElectionDefinition,
} from '@votingworks/fixtures';
import {
  Dictionary,
  BatchTally,
  ManualTally,
  Tally,
  TallyCategory,
  VotingMethod,
  FullElectionTally,
  FullElectionManualTally,
} from '@votingworks/types';

import { assert } from '@votingworks/basics';
import { getMockManualTally } from '@votingworks/utils';
import { getByText as domGetByText } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';

import { BallotCountsTable } from './ballot_counts_table';
import { fakeTally } from '../../test/helpers/fake_tally';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

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
  };
  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Precinct, resultsByPrecinct);

  const manualResultsByPrecinct: Dictionary<ManualTally> = {
    // French Camp
    '6526': getMockManualTally({
      numberOfBallotsCounted: 13,
    }),
    // East Weir
    '6525': getMockManualTally({
      numberOfBallotsCounted: 0,
    }),
    // Hebron
    '6528': getMockManualTally({
      numberOfBallotsCounted: 22,
    }),
  };
  const manualResultsByCategory = new Map();
  manualResultsByCategory.set(TallyCategory.Precinct, manualResultsByPrecinct);

  const fullElectionTally: FullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  };
  const fullElectionManualTally: FullElectionManualTally = {
    overallTally: getMockManualTally({
      numberOfBallotsCounted: 54,
    }),
    resultsByCategory: manualResultsByCategory,
    votingMethod: VotingMethod.Precinct,
    timestampCreated: new Date(),
  };

  it('renders as expected when there is no tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      { apiMock }
    );
    for (const precinct of electionWithMsEitherNeither.precincts) {
      getByText(precinct.name);
      const tableRow = getByText(precinct.name).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0)).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${precinct.name} Tally Report`)
      ).toBeInTheDocument();
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();
    expect(
      domGetByText(tableRow!, 'Unofficial Tally Reports for All Precincts')
    ).toBeInTheDocument();

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toEqual(
      electionWithMsEitherNeither.precincts.length + 2
    );
  });

  it('renders as expected when there is tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      {
        fullElectionTally,
        apiMock,
      }
    );
    for (const precinct of electionWithMsEitherNeither.precincts) {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0;
      getByText(precinct.name);
      const tableRow = getByText(precinct.name).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${precinct.name} Tally Report`)
      ).toBeInTheDocument();
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77)).toBeInTheDocument();
    expect(
      domGetByText(tableRow!, 'Unofficial Tally Reports for All Precincts')
    ).toBeInTheDocument();

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toEqual(
      electionWithMsEitherNeither.precincts.length + 2
    );
  });

  it('renders as expected when there is tally data and manual data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      {
        fullElectionTally,
        fullElectionManualTally,
        apiMock,
      }
    );
    for (const precinct of electionWithMsEitherNeither.precincts) {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        (resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0) +
        (manualResultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0);
      getByText(precinct.name);
      const tableRow = getByText(precinct.name).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${precinct.name} Tally Report`)
      ).toBeInTheDocument();
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131)).toBeInTheDocument();
    expect(
      domGetByText(tableRow!, 'Unofficial Tally Reports for All Precincts')
    ).toBeInTheDocument();

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toEqual(
      electionWithMsEitherNeither.precincts.length + 2
    );
  });
});

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
  };
  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Scanner, resultsByScanner);

  const fullElectionTally: FullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  };
  const fullElectionManualTally: FullElectionManualTally = {
    overallTally: getMockManualTally({
      numberOfBallotsCounted: 54,
    }),
    votingMethod: VotingMethod.Precinct,
    resultsByCategory: new Map(),
    timestampCreated: new Date(),
  };

  it('renders as expected when there is no tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      { apiMock }
    );

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();

    // There should be 2 rows in the table, the header row and the totals row.
    expect(getAllByTestId('table-row').length).toEqual(2);
  });

  it('renders as expected when there is tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      {
        fullElectionTally,
        apiMock,
      }
    );

    const scannerIds = ['scanner-1', 'scanner-2', 'scanner-3'];

    for (const scannerId of scannerIds) {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        resultsByScanner[scannerId]?.numberOfBallotsCounted ?? 0;
      getByText(scannerId);
      const tableRow = getByText(scannerId).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      if (expectedNumberOfBallots > 0) {
        expect(
          domGetByText(
            tableRow!,
            `Unofficial Scanner ${scannerId} Tally Report`
          )
        ).toBeInTheDocument();
      }
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(scannerIds.length + 2);
  });

  it('renders as expected when there is tally data and manual data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      {
        fullElectionTally,
        fullElectionManualTally,
        apiMock,
      }
    );

    const scannerIds = ['scanner-1', 'scanner-2', 'scanner-3'];

    for (const scannerId of scannerIds) {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        resultsByScanner[scannerId]?.numberOfBallotsCounted ?? 0;
      getByText(scannerId);
      const tableRow = getByText(scannerId).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      if (expectedNumberOfBallots > 0) {
        expect(
          domGetByText(
            tableRow!,
            `Unofficial Scanner ${scannerId} Tally Report`
          )
        ).toBeInTheDocument();
      }
    }

    getByText('Manually Entered Results');
    let tableRow = getByText('Manually Entered Results').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 54)).toBeInTheDocument();

    getByText('Total Ballot Count');
    tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(scannerIds.length + 3);
  });
});

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
  };
  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Party, resultsByParty);

  const manualResultsByParty: Dictionary<ManualTally> = {
    // Liberty
    '0': getMockManualTally({
      numberOfBallotsCounted: 13,
    }),
    // Constitution
    '3': getMockManualTally({
      numberOfBallotsCounted: 73,
    }),
  };
  const manualResultsByCategory = new Map();
  manualResultsByCategory.set(TallyCategory.Party, manualResultsByParty);

  const fullElectionTally: FullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  };

  const fullElectionManualTally: FullElectionManualTally = {
    overallTally: getMockManualTally({
      numberOfBallotsCounted: 54,
    }),
    resultsByCategory: manualResultsByCategory,
    votingMethod: VotingMethod.Precinct,
    timestampCreated: new Date(),
  };

  it('does not render when the election has not ballot styles with parties', () => {
    // The default election is not a primary
    const { container } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      { apiMock }
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders as expected when there is no data', () => {
    const expectedParties = [
      'Constitution Party',
      'Federalist Party',
      'Liberty Party',
    ];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      {
        electionDefinition: {
          ...multiPartyPrimaryElectionDefinition,
          electionData: '',
        },
        apiMock,
      }
    );

    for (const partyName of expectedParties) {
      getByText(partyName);
      const tableRow = getByText(partyName).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0)).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${partyName} Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedParties.length + 2
    );
  });

  it('renders as expected when there is tally data', () => {
    const expectedParties = [
      { partyName: 'Constitution Party', partyId: '3' },
      { partyName: 'Federalist Party', partyId: '4' },
      { partyName: 'Liberty Party', partyId: '0' },
    ];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      {
        electionDefinition: {
          ...multiPartyPrimaryElectionDefinition,
          electionData: '',
        },
        fullElectionTally,
        apiMock,
      }
    );

    for (const { partyName, partyId } of expectedParties) {
      const expectedNumberOfBallots =
        resultsByParty[partyId]?.numberOfBallotsCounted ?? 0;
      getByText(partyName);
      const tableRow = getByText(partyName).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${partyName} Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedParties.length + 2
    );
  });

  it('renders as expected where there is tally data and manual data', () => {
    const expectedParties = [
      { partyName: 'Constitution Party', partyId: '3' },
      { partyName: 'Federalist Party', partyId: '4' },
      { partyName: 'Liberty Party', partyId: '0' },
    ];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />,
      {
        electionDefinition: {
          ...multiPartyPrimaryElectionDefinition,
          electionData: '',
        },
        fullElectionTally,
        fullElectionManualTally,
        apiMock,
      }
    );

    for (const { partyName, partyId } of expectedParties) {
      const expectedNumberOfBallots =
        (resultsByParty[partyId]?.numberOfBallotsCounted ?? 0) +
        (manualResultsByParty[partyId]?.numberOfBallotsCounted ?? 0);
      getByText(partyName);
      const tableRow = getByText(partyName).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${partyName} Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedParties.length + 2
    );
  });
});

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
  };
  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.VotingMethod, resultsByVotingMethod);

  const fullElectionTally: FullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  };

  const numManualBallots = 54;

  const fullElectionManualTally: FullElectionManualTally = {
    overallTally: getMockManualTally({
      numberOfBallotsCounted: numManualBallots,
    }),
    resultsByCategory: new Map(),
    votingMethod: VotingMethod.Precinct,
    timestampCreated: new Date(),
  };

  it('renders as expected when there is no data', () => {
    // No row for "Other" ballots renders when there are 0 CVRs for that category.
    const expectedLabels = ['Absentee', 'Precinct'];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />,
      { apiMock }
    );

    for (const label of expectedLabels) {
      getByText(label);
      const tableRow = getByText(label).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0)).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${label} Ballot Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 2
    );
  });

  it('renders as expected when there is tally data', () => {
    const expectedLabels = [
      {
        method: VotingMethod.Absentee,
        label: 'Absentee',
      },
      { method: VotingMethod.Precinct, label: 'Precinct' },
      { method: VotingMethod.Unknown, label: 'Other' },
    ];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />,
      { fullElectionTally, apiMock }
    );

    for (const { method, label } of expectedLabels) {
      const expectedNumberOfBallots =
        resultsByVotingMethod[method]?.numberOfBallotsCounted ?? 0;
      getByText(label);
      const tableRow = getByText(label).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${label} Ballot Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 2
    );
  });

  it('renders as expected where there is tally data and manual data', () => {
    const expectedLabels = [
      {
        method: VotingMethod.Absentee,
        label: 'Absentee',
      },
      { method: VotingMethod.Precinct, label: 'Precinct' },
      { method: VotingMethod.Unknown, label: 'Other' },
    ];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />,
      {
        fullElectionTally,
        fullElectionManualTally,
        apiMock,
      }
    );

    // The manual tally is configured to be labelled as precinct data.

    for (const { method, label } of expectedLabels) {
      let expectedNumberOfBallots =
        resultsByVotingMethod[method]?.numberOfBallotsCounted ?? 0;
      if (method === VotingMethod.Precinct) {
        expectedNumberOfBallots += numManualBallots;
      }
      getByText(label);
      const tableRow = getByText(label).closest('tr');
      expect(tableRow).toBeDefined();
      expect(
        domGetByText(tableRow!, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(
        domGetByText(tableRow!, `Unofficial ${label} Ballot Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 2
    );
  });
});

describe('Ballots Counts by Batch', () => {
  beforeEach(() => {
    apiMock.expectGetCastVoteRecordFileMode('official');
  });

  const resultsByBatch: Dictionary<BatchTally> = {
    '12341': {
      ...fakeTally({
        numberOfBallotsCounted: 25,
      }),
      batchLabel: 'Batch 1',
      scannerIds: ['001'],
    },
    '12342': {
      ...fakeTally({
        numberOfBallotsCounted: 15,
      }),
      batchLabel: 'Batch 2',
      scannerIds: ['001'],
    },
    '12343': {
      ...fakeTally({
        numberOfBallotsCounted: 32,
      }),
      batchLabel: 'Batch 1',
      scannerIds: ['002'],
    },
    'missing-batch-id': {
      ...fakeTally({
        numberOfBallotsCounted: 50,
      }),
      scannerIds: ['003', '004'],
      batchLabel: 'Missing Batch',
    },
  };
  const resultsByCategory = new Map();
  resultsByCategory.set(TallyCategory.Batch, resultsByBatch);

  const fullElectionTally: FullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 122,
    }),
    resultsByCategory,
  };

  const numManualBallots = 54;

  const fullElectionManualTally: FullElectionManualTally = {
    overallTally: getMockManualTally({
      numberOfBallotsCounted: numManualBallots,
    }),
    resultsByCategory: new Map(),
    votingMethod: VotingMethod.Precinct,
    timestampCreated: new Date(),
  };

  it('renders as expected when there is no data', () => {
    // No row for "Other" ballots renders when there are 0 CVRs for that category.
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Batch} />,
      { apiMock }
    );

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0)).toBeInTheDocument();

    expect(getAllByTestId('table-row').length).toEqual(2);
  });

  it('renders as expected when there is tally data', () => {
    const expectedLabels = [
      {
        batchId: '12341',
        label: 'Batch 1',
        scannerLabel: '001',
      },
      {
        batchId: '12342',
        label: 'Batch 2',
        scannerLabel: '001',
      },
      {
        batchId: '12343',
        label: 'Batch 1',
        scannerLabel: '002',
      },
      {
        batchId: 'missing-batch-id',
        label: 'Missing Batch',
        scannerLabel: '003, 004',
      },
    ];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Batch} />,
      { fullElectionTally, apiMock }
    );

    for (const { batchId, label, scannerLabel } of expectedLabels) {
      const expectedNumberOfBallots =
        resultsByBatch[batchId]?.numberOfBallotsCounted ?? 0;
      const tableRow = getAllByTestId(`batch-${batchId}`)[0].closest('tr');
      assert(tableRow);
      expect(domGetByText(tableRow, label)).toBeInTheDocument();
      expect(
        domGetByText(tableRow, expectedNumberOfBallots)
      ).toBeInTheDocument();
      expect(domGetByText(tableRow, scannerLabel)).toBeInTheDocument();
      expect(
        domGetByText(tableRow, `Unofficial ${label} Tally Report`)
      ).toBeInTheDocument();
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 122)).toBeInTheDocument();

    // There should be 2 extra table rows in addition to the batches, one for the headers, and one for the total row.
    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 2
    );
  });

  it('renders as expected where there is tally data and manual data', () => {
    const expectedLabels = [
      {
        batchId: '12341',
        label: 'Batch 1',
        scannerLabel: '001',
      },
      {
        batchId: '12342',
        label: 'Batch 2',
        scannerLabel: '001',
      },
      {
        batchId: '12343',
        label: 'Batch 1',
        scannerLabel: '002',
      },
      {
        batchId: 'missing-batch-id',
        label: 'Missing Batch',
        scannerLabel: '003, 004',
      },
    ];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Batch} />,
      {
        fullElectionTally,
        fullElectionManualTally,
        apiMock,
      }
    );

    // The manual tally is configured to be labelled as precinct data.

    for (const { batchId, label, scannerLabel } of expectedLabels) {
      const expectedNumberOfBallots =
        resultsByBatch[batchId]?.numberOfBallotsCounted ?? 0;
      const tableRow = getAllByTestId(`batch-${batchId}`)[0].closest('tr');
      expect(tableRow).toBeDefined();
      domGetByText(tableRow!, label);
      domGetByText(tableRow!, expectedNumberOfBallots);
      domGetByText(tableRow!, scannerLabel);
      domGetByText(tableRow!, `Unofficial ${label} Tally Report`);
    }

    const manualTableRow = getAllByTestId('batch-manual')[0].closest('tr');
    assert(manualTableRow);
    domGetByText(manualTableRow, 'Manually Entered Results');
    domGetByText(manualTableRow, numManualBallots);

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    assert(tableRow);
    domGetByText(tableRow, 176);

    // There should be 3 extra table rows in addition to the batches, one for the headers, one for the manual data, and one for the total row.
    expect(getAllByTestId('table-row').length).toEqual(
      expectedLabels.length + 3
    );
  });
});
