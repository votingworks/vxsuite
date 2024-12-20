import { Meta, StoryObj } from '@storybook/react';
import {
  readElectionTwoPartyPrimaryDefinition,
  readElectionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import {
  BallotStyleId,
  ElectionDefinition,
  GridLayout,
  Tabulation,
} from '@votingworks/types';
import styled from 'styled-components';
import { getGroupedBallotStyles } from '@votingworks/utils';
import {
  BallotCountReport,
  BallotCountReportProps,
} from './ballot_count_report';
import { LabeledScannerBatch } from './utils';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();
const electionWithMsEitherNeitherDefinition =
  readElectionWithMsEitherNeitherDefinition();

const ReportPreview = styled.div`
  section {
    background: #fff;
    width: 8.5in;
    min-height: 11in;
    padding: 0.5in;
  }

  @media print {
    section {
      margin: 0;
      padding: 0;
    }
  }
`;

function BallotCountReportPreview(props: BallotCountReportProps): JSX.Element {
  return (
    <ReportPreview>
      <BallotCountReport {...props} />
    </ReportPreview>
  );
}

type Story = StoryObj<typeof BallotCountReportPreview>;

const meta: Meta<typeof BallotCountReportPreview> = {
  title: 'libs-ui/BallotCountReport',
  component: BallotCountReportPreview,
  parameters: {
    backgrounds: {
      default: 'light gray',
      values: [
        { name: 'light gray', value: '#D3D3D3' },
        { name: 'black', value: '#000000' },
      ],
    },
  },
};

function cc(
  bmd: number,
  manual?: number,
  ...hmpb: number[]
): Tabulation.CardCounts {
  return {
    bmd,
    manual,
    hmpb,
  };
}

const precinctCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> =
  electionWithMsEitherNeitherDefinition.election.precincts.map(
    (precinct, index) => ({
      ...cc(index * 10000, index * 30000, index * 50000),
      precinctId: precinct.id,
    })
  );

const precinctReportArgs: BallotCountReportProps = {
  title: 'Full Election Ballot Count Report',
  isOfficial: true,
  isTest: false,
  testId: 'tally-report',
  electionDefinition: electionWithMsEitherNeitherDefinition,
  electionPackageHash: '11111111111111111111',
  scannerBatches: [],
  groupBy: {
    groupByPrecinct: true,
  },
  cardCountsList: precinctCardCountsList,
  includeSheetCounts: false,
};

export const PrecinctReport: Story = {
  args: precinctReportArgs,
};

const primaryPrecinctCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> =
  electionWithMsEitherNeitherDefinition.election.precincts.flatMap(
    (precinct, index) => [
      {
        ...cc(index, index * 3, index * 5),
        precinctId: precinct.id,
        partyId: '2',
      },
      {
        ...cc(index * 2, index * 4, index * 6),
        precinctId: precinct.id,
        partyId: '3',
      },
    ]
  );

const primaryPrecinctReportArgs: BallotCountReportProps = {
  title: 'Full Election Ballot Count Report',
  isOfficial: true,
  isTest: false,
  testId: 'tally-report',
  electionDefinition: {
    ...electionWithMsEitherNeitherDefinition,
    election: {
      ...electionWithMsEitherNeitherDefinition.election,
      type: 'primary',
    },
  },
  electionPackageHash: '11111111111111111111',
  scannerBatches: [],
  groupBy: {
    groupByPrecinct: true,
    groupByParty: true,
  },
  cardCountsList: primaryPrecinctCardCountsList,
  includeSheetCounts: false,
};

export const PrimaryPrecinctReport: Story = {
  args: primaryPrecinctReportArgs,
};

const votingMethodCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> =
  [
    {
      ...cc(342, 174, 237),
      votingMethod: 'absentee',
    },
    {
      ...cc(132, 777, 342),
      votingMethod: 'precinct',
    },
  ];

const votingMethodReportArgs: BallotCountReportProps = {
  title: 'Full Election Ballot Count Report',
  isOfficial: true,
  isTest: false,
  testId: 'tally-report',
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  scannerBatches: [],
  groupBy: {
    groupByVotingMethod: true,
  },
  cardCountsList: votingMethodCardCountsList,
  includeSheetCounts: false,
};

export const VotingMethodReport: Story = {
  args: votingMethodReportArgs,
};

const noGroupsCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> = [
  cc(12312, 324234, 234233),
];

const noGroupsReportArgs: BallotCountReportProps = {
  title: 'Full Election Ballot Count Report',
  isOfficial: true,
  isTest: false,
  testId: 'tally-report',
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  scannerBatches: [],
  groupBy: {},
  cardCountsList: noGroupsCardCountsList,
  includeSheetCounts: false,
};

export const NoGroupsReport: Story = {
  args: noGroupsReportArgs,
};

const singleGroupCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> = [
  { ...cc(12312, 324234, 234233), batchId: 'batch-1' },
];

const singleGroupReportArgs: BallotCountReportProps = {
  title: 'Full Election Ballot Count Report',
  isOfficial: true,
  isTest: false,
  testId: 'tally-report',
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  scannerBatches: [
    {
      batchId: 'batch-1',
      label: 'Batch 1',
      scannerId: 'scanner-1',
    },
  ],
  groupBy: { groupByBatch: true },
  cardCountsList: singleGroupCardCountsList,
  includeSheetCounts: false,
};

export const SingleGroupReport: Story = {
  args: singleGroupReportArgs,
};

const maxReportScannerBatches: LabeledScannerBatch[] = [
  {
    batchId: 'batch-10',
    label: 'Batch 10',
    scannerId: 'scanner-1',
  },
  {
    batchId: 'batch-11',
    label: 'Batch 11',
    scannerId: 'scanner-1',
  },
  {
    batchId: 'batch-20',
    label: 'Batch 20',
    scannerId: 'scanner-2',
  },
  {
    batchId: 'batch-21',
    label: 'Batch 21',
    scannerId: 'scanner-2',
  },
  {
    batchId: 'batch-22',
    label: 'Batch 22',
    scannerId: 'scanner-2',
  },
  {
    batchId: 'batch-30',
    label: 'Batch 30',
    scannerId: 'scanner-3',
  },
  {
    batchId: 'batch-31',
    label: 'Batch 31',
    scannerId: 'scanner-3',
  },
  {
    batchId: 'batch-32',
    label: 'Batch 32',
    scannerId: 'scanner-3',
  },
];

const maxCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> = (() => {
  const list: Tabulation.GroupList<Tabulation.CardCounts> = [];
  const { election } = electionTwoPartyPrimaryDefinition;
  let i = 0;
  for (const ballotStyle of getGroupedBallotStyles(election.ballotStyles)) {
    for (const precinctId of ballotStyle.precincts) {
      for (const batch of maxReportScannerBatches) {
        for (const votingMethod of Tabulation.SUPPORTED_VOTING_METHODS) {
          list.push({
            ...cc(i, i * 2, i * 3),
            precinctId,
            ballotStyleGroupId: ballotStyle.id,
            votingMethod,
            batchId: batch.batchId,
          });
          i += 1;
        }
      }
    }
  }
  return list;
})();

const maxReportArgs: BallotCountReportProps = {
  title: 'Full Election Ballot Count Report',
  isOfficial: true,
  isTest: false,
  testId: 'tally-report',
  electionDefinition: {
    ...electionTwoPartyPrimaryDefinition,
    election: {
      ...electionTwoPartyPrimaryDefinition.election,
      precincts: [
        {
          id: 'precinct-1',
          name: 'Precinct 1',
        },
        {
          id: 'precinct-2',
          name: 'Precinct With Super Duper Long Name',
        },
      ],
    },
  },
  electionPackageHash: '11111111111111111111',
  scannerBatches: maxReportScannerBatches,
  groupBy: {
    groupByPrecinct: true,
    groupByBatch: true,
    groupByVotingMethod: true,
    groupByBallotStyle: true,
  },
  cardCountsList: maxCardCountsList,
  includeSheetCounts: false,
};

export const MaxReport: Story = {
  args: maxReportArgs,
};

export default meta;

const multiSheetPrecinctCardCountsList: Tabulation.GroupList<Tabulation.CardCounts> =
  electionWithMsEitherNeitherDefinition.election.precincts.map(
    (precinct, index) => ({
      ...cc(
        index * 1,
        index * 2,
        index * 3,
        Math.floor(index * 2.8),
        Math.floor(index * 2.2)
      ),
      precinctId: precinct.id,
    })
  );

const partialGridPosition = {
  type: 'option',
  side: 'front',
  column: 0,
  row: 0,
  contestId: 'any',
  optionId: 'any',
} as const;

const mockMultiSheetGridLayouts: GridLayout[] = [
  {
    ballotStyleId: 'any' as BallotStyleId,
    optionBoundsFromTargetMark: {
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
    },
    gridPositions: [
      {
        ...partialGridPosition,
        sheetNumber: 1,
      },
      {
        ...partialGridPosition,
        sheetNumber: 2,
      },
      {
        ...partialGridPosition,
        sheetNumber: 3,
      },
    ],
  },
];

const multiSheetElectionDefinition: ElectionDefinition = {
  ...electionWithMsEitherNeitherDefinition,
  election: {
    ...electionWithMsEitherNeitherDefinition.election,
    gridLayouts: mockMultiSheetGridLayouts,
  },
};

const multiSheetPrecinctReportArgs: BallotCountReportProps = {
  title: 'Full Election Ballot Count Report',
  isOfficial: true,
  isTest: false,
  testId: 'tally-report',
  electionDefinition: multiSheetElectionDefinition,
  electionPackageHash: '11111111111111111111',
  scannerBatches: [],
  groupBy: {
    groupByPrecinct: true,
  },
  cardCountsList: multiSheetPrecinctCardCountsList,
  includeSheetCounts: true,
};

export const MultiSheetPrecinctReport: Story = {
  args: multiSheetPrecinctReportArgs,
};
