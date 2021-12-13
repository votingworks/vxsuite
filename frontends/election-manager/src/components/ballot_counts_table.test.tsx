import React from 'react';

import { getByText as domGetByText } from '@testing-library/react';

import {
  electionWithMsEitherNeither,
  multiPartyPrimaryElectionDefinition,
} from '@votingworks/fixtures';
import {
  Dictionary,
  BatchTally,
  ExternalTally,
  ExternalTallySourceType,
  Tally,
  TallyCategory,
  VotingMethod,
  FullElectionTally,
  FullElectionExternalTally,
} from '@votingworks/types';

import { assert } from '@votingworks/utils';
import { renderInAppContext } from '../../test/render_in_app_context';

import { BallotCountsTable } from './ballot_counts_table';
import { fakeTally } from '../../test/helpers/fake_tally';
import { fakeExternalTally } from '../../test/helpers/fake_external_tally';

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
  };
  const externalResultsByCategory = new Map();
  externalResultsByCategory.set(
    TallyCategory.Precinct,
    externalResultsByPrecinct
  );

  const fullElectionTally: FullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  };
  const fullElectionExternalTally: FullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: 54,
    }),
    resultsByCategory: externalResultsByCategory,
    votingMethod: VotingMethod.Precinct,
    source: ExternalTallySourceType.SEMS,
    inputSourceName: 'imported-file-name.csv',
    timestampCreated: new Date(),
  };

  it('renders as expected when there is no tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />
    );
    for (const precinct of electionWithMsEitherNeither.precincts) {
      getByText(precinct.name);
      const tableRow = getByText(precinct.name).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0));
      expect(
        domGetByText(tableRow!, `View Unofficial ${precinct.name} Tally Report`)
      );
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0));
    expect(
      domGetByText(tableRow!, 'View Unofficial Tally Reports for All Precincts')
    );

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toBe(
      electionWithMsEitherNeither.precincts.length + 2
    );
  });

  it('renders as expected when there is tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      {
        fullElectionTally,
      }
    );
    for (const precinct of electionWithMsEitherNeither.precincts) {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0;
      getByText(precinct.name);
      const tableRow = getByText(precinct.name).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, expectedNumberOfBallots));
      expect(
        domGetByText(tableRow!, `View Unofficial ${precinct.name} Tally Report`)
      );
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77));
    expect(
      domGetByText(tableRow!, 'View Unofficial Tally Reports for All Precincts')
    );

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toBe(
      electionWithMsEitherNeither.precincts.length + 2
    );
  });

  it('renders as expected when there is tally data and sems data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Precinct} />,
      {
        fullElectionTally,
        fullElectionExternalTallies: [fullElectionExternalTally],
      }
    );
    for (const precinct of electionWithMsEitherNeither.precincts) {
      // Expect that 0 ballots are counted when the precinct is missing in the dictionary or the tally says there are 0 ballots
      const expectedNumberOfBallots =
        (resultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0) +
        (externalResultsByPrecinct[precinct.id]?.numberOfBallotsCounted ?? 0);
      getByText(precinct.name);
      const tableRow = getByText(precinct.name).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, expectedNumberOfBallots));
      expect(
        domGetByText(tableRow!, `View Unofficial ${precinct.name} Tally Report`)
      );
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131));
    expect(
      domGetByText(tableRow!, 'View Unofficial Tally Reports for All Precincts')
    );

    // There should be 2 more rows then the number of precincts (header row and totals row)
    expect(getAllByTestId('table-row').length).toBe(
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
  const fullElectionExternalTally: FullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: 54,
    }),
    votingMethod: VotingMethod.Precinct,
    resultsByCategory: new Map(),
    source: ExternalTallySourceType.SEMS,
    inputSourceName: 'imported-file-name.csv',
    timestampCreated: new Date(),
  };

  it('renders as expected when there is no tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />
    );

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0));

    // There should be 2 rows in the table, the header row and the totals row.
    expect(getAllByTestId('table-row').length).toBe(2);
  });

  it('renders as expected when there is tally data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      {
        fullElectionTally,
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
      expect(domGetByText(tableRow!, expectedNumberOfBallots));
      if (expectedNumberOfBallots > 0) {
        expect(
          domGetByText(
            tableRow!,
            `View Unofficial Scanner ${scannerId} Tally Report`
          )
        );
      }
    }
    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77));

    expect(getAllByTestId('table-row').length).toBe(scannerIds.length + 2);
  });

  it('renders as expected when there is tally data and sems data', () => {
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Scanner} />,
      {
        fullElectionTally,
        fullElectionExternalTallies: [fullElectionExternalTally],
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
      expect(domGetByText(tableRow!, expectedNumberOfBallots));
      if (expectedNumberOfBallots > 0) {
        expect(
          domGetByText(
            tableRow!,
            `View Unofficial Scanner ${scannerId} Tally Report`
          )
        );
      }
    }

    getByText('External Results (imported-file-name.csv)');
    let tableRow = getByText(
      'External Results (imported-file-name.csv)'
    ).closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 54));

    getByText('Total Ballot Count');
    tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131));

    expect(getAllByTestId('table-row').length).toBe(scannerIds.length + 3);
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

  const externalResultsByParty: Dictionary<ExternalTally> = {
    // Liberty
    '0': fakeExternalTally({
      numberOfBallotsCounted: 13,
    }),
    // Constitution
    '3': fakeExternalTally({
      numberOfBallotsCounted: 73,
    }),
  };
  const externalResultsByCategory = new Map();
  externalResultsByCategory.set(TallyCategory.Party, externalResultsByParty);

  const fullElectionTally: FullElectionTally = {
    overallTally: fakeTally({
      numberOfBallotsCounted: 77,
    }),
    resultsByCategory,
  };

  const fullElectionExternalTally: FullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: 54,
    }),
    resultsByCategory: externalResultsByCategory,
    votingMethod: VotingMethod.Precinct,
    source: ExternalTallySourceType.SEMS,
    inputSourceName: 'imported-file-name.csv',
    timestampCreated: new Date(),
  };

  it('does not render when the election has not ballot styles with parties', () => {
    // The default election is not a primary
    const { container } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Party} />
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
      }
    );

    for (const partyName of expectedParties) {
      getByText(partyName);
      const tableRow = getByText(partyName).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0));
      expect(
        domGetByText(tableRow!, `View Unofficial ${partyName} Tally Report`)
      );
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0));
    expect(
      domGetByText(tableRow!, 'View Unofficial Full Election Tally Report')
    );

    expect(getAllByTestId('table-row').length).toBe(expectedParties.length + 2);
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
      }
    );

    for (const { partyName, partyId } of expectedParties) {
      const expectedNumberOfBallots =
        resultsByParty[partyId]?.numberOfBallotsCounted ?? 0;
      getByText(partyName);
      const tableRow = getByText(partyName).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, expectedNumberOfBallots));
      expect(
        domGetByText(tableRow!, `View Unofficial ${partyName} Tally Report`)
      );
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77));
    expect(
      domGetByText(tableRow!, 'View Unofficial Full Election Tally Report')
    );

    expect(getAllByTestId('table-row').length).toBe(expectedParties.length + 2);
  });

  it('renders as expected where there is tally data and sems data', () => {
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
        fullElectionExternalTallies: [fullElectionExternalTally],
      }
    );

    for (const { partyName, partyId } of expectedParties) {
      const expectedNumberOfBallots =
        (resultsByParty[partyId]?.numberOfBallotsCounted ?? 0) +
        (externalResultsByParty[partyId]?.numberOfBallotsCounted ?? 0);
      getByText(partyName);
      const tableRow = getByText(partyName).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, expectedNumberOfBallots));
      expect(
        domGetByText(tableRow!, `View Unofficial ${partyName} Tally Report`)
      );
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131));
    expect(
      domGetByText(tableRow!, 'View Unofficial Full Election Tally Report')
    );

    expect(getAllByTestId('table-row').length).toBe(expectedParties.length + 2);
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

  const numExternalBallots = 54;

  const fullElectionExternalTally: FullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: numExternalBallots,
    }),
    resultsByCategory: new Map(),
    votingMethod: VotingMethod.Precinct,
    source: ExternalTallySourceType.SEMS,
    inputSourceName: 'imported-file-name.csv',
    timestampCreated: new Date(),
  };

  it('renders as expected when there is no data', () => {
    // No row for "Other" ballots renders when there are 0 CVRs for that category.
    const expectedLabels = ['Absentee', 'Precinct'];
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.VotingMethod} />
    );

    for (const label of expectedLabels) {
      getByText(label);
      const tableRow = getByText(label).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, 0));
      expect(
        domGetByText(tableRow!, `View Unofficial ${label} Ballot Tally Report`)
      );
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0));

    expect(getAllByTestId('table-row').length).toBe(expectedLabels.length + 2);
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
      { fullElectionTally }
    );

    for (const { method, label } of expectedLabels) {
      const expectedNumberOfBallots =
        resultsByVotingMethod[method]?.numberOfBallotsCounted ?? 0;
      getByText(label);
      const tableRow = getByText(label).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, expectedNumberOfBallots));
      expect(
        domGetByText(tableRow!, `View Unofficial ${label} Ballot Tally Report`)
      );
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 77));

    expect(getAllByTestId('table-row').length).toBe(expectedLabels.length + 2);
  });

  it('renders as expected where there is tally data and sems data', () => {
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
        fullElectionExternalTallies: [fullElectionExternalTally],
      }
    );

    // The external tally is configured to be labelled as precinct data.

    for (const { method, label } of expectedLabels) {
      let expectedNumberOfBallots =
        resultsByVotingMethod[method]?.numberOfBallotsCounted ?? 0;
      if (method === VotingMethod.Precinct) {
        expectedNumberOfBallots += numExternalBallots;
      }
      getByText(label);
      const tableRow = getByText(label).closest('tr');
      expect(tableRow).toBeDefined();
      expect(domGetByText(tableRow!, expectedNumberOfBallots));
      expect(
        domGetByText(tableRow!, `View Unofficial ${label} Ballot Tally Report`)
      );
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 131));

    expect(getAllByTestId('table-row').length).toBe(expectedLabels.length + 2);
  });
});

describe('Ballots Counts by Batch', () => {
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

  const numExternalBallots = 54;

  const fullElectionExternalTally: FullElectionExternalTally = {
    overallTally: fakeExternalTally({
      numberOfBallotsCounted: numExternalBallots,
    }),
    resultsByCategory: new Map(),
    votingMethod: VotingMethod.Precinct,
    source: ExternalTallySourceType.SEMS,
    inputSourceName: 'imported-file-name.csv',
    timestampCreated: new Date(),
  };

  it('renders as expected when there is no data', () => {
    // No row for "Other" ballots renders when there are 0 CVRs for that category.
    const { getByText, getAllByTestId } = renderInAppContext(
      <BallotCountsTable breakdownCategory={TallyCategory.Batch} />
    );

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 0));

    expect(getAllByTestId('table-row').length).toBe(2);
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
      { fullElectionTally }
    );

    for (const { batchId, label, scannerLabel } of expectedLabels) {
      const expectedNumberOfBallots =
        resultsByBatch[batchId]?.numberOfBallotsCounted ?? 0;
      const tableRow = getAllByTestId(`batch-${batchId}`)[0].closest('tr');
      assert(tableRow);
      expect(domGetByText(tableRow, label));
      expect(domGetByText(tableRow, expectedNumberOfBallots));
      expect(domGetByText(tableRow, scannerLabel));
      expect(domGetByText(tableRow, `View Unofficial ${label} Tally Report`));
    }

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    expect(tableRow).toBeDefined();
    expect(domGetByText(tableRow!, 122));

    // There should be 2 extra table rows in addition to the batches, one for the headers, and one for the total row.
    expect(getAllByTestId('table-row').length).toBe(expectedLabels.length + 2);
  });

  it('renders as expected where there is tally data and sems data', () => {
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
        fullElectionExternalTallies: [fullElectionExternalTally],
      }
    );

    // The external tally is configured to be labelled as precinct data.

    for (const { batchId, label, scannerLabel } of expectedLabels) {
      const expectedNumberOfBallots =
        resultsByBatch[batchId]?.numberOfBallotsCounted ?? 0;
      const tableRow = getAllByTestId(`batch-${batchId}`)[0].closest('tr');
      expect(tableRow).toBeDefined();
      domGetByText(tableRow!, label);
      domGetByText(tableRow!, expectedNumberOfBallots);
      domGetByText(tableRow!, scannerLabel);
      domGetByText(tableRow!, `View Unofficial ${label} Tally Report`);
    }

    const externalTableRow = getAllByTestId('batch-external')[0].closest('tr');
    assert(externalTableRow);
    domGetByText(externalTableRow, 'External Results (imported-file-name.csv)');
    domGetByText(externalTableRow, numExternalBallots);

    getByText('Total Ballot Count');
    const tableRow = getByText('Total Ballot Count').closest('tr');
    assert(tableRow);
    domGetByText(tableRow, 176);

    // There should be 3 extra table rows in addition to the batches, one for the headers, one for the external data, and one for the total row.
    expect(getAllByTestId('table-row').length).toBe(expectedLabels.length + 3);
  });
});
