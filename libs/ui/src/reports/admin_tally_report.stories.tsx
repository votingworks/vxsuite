import { Meta, StoryObj } from '@storybook/react';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  buildElectionResultsFixture,
  buildManualResultsFixture,
} from '@votingworks/utils';
import {
  BallotStyleId,
  Tabulation,
  getBallotStyle,
  getContests,
} from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { AdminTallyReportProps, AdminTallyReport } from './admin_tally_report';
import { PrintedReportPreview } from './layout';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();
const { election } = electionTwoPartyPrimaryDefinition;
const { contests } = election;

function AdminTallyReportPreview(props: AdminTallyReportProps): JSX.Element {
  return (
    <PrintedReportPreview>
      <AdminTallyReport {...props} />
    </PrintedReportPreview>
  );
}

type Story = StoryObj<typeof AdminTallyReportPreview>;

const meta: Meta<typeof AdminTallyReportPreview> = {
  title: 'libs-ui/AdminTallyReport',
  component: AdminTallyReportPreview,
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

const scannedElectionResults = buildElectionResultsFixture({
  election,
  cardCounts: {
    bmd: 4,
    hmpb: [3450, 3150],
  },
  includeGenericWriteIn: true,
  contestResultsSummaries: {
    fishing: {
      type: 'yesno',
      ballots: 3300,
      overvotes: 2,
      undervotes: 298,
      yesTally: 2700,
      noTally: 300,
    },
    'best-animal-fish': {
      type: 'candidate',
      ballots: 4350,
      overvotes: 50,
      undervotes: 300,
      officialOptionTallies: {
        seahorse: 2500,
        salmon: 1500,
      },
    },
  },
});

const batchReportArgs: AdminTallyReportProps = {
  title: 'Batch Tally Report for Batch 1',
  isOfficial: true,
  isTest: false,
  testId: 'tally-report',
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  contests,
  scannedElectionResults,
  customFilter: undefined,
  scannerBatches: undefined,
  includeSignatureLines: false,
};

export const BatchTallyReport: Story = {
  args: batchReportArgs,
};

const manualElectionResults = buildManualResultsFixture({
  election,
  ballotCount: 34,
  contestResultsSummaries: {
    fishing: {
      type: 'yesno',
      ballots: 33,
      overvotes: 20,
      undervotes: 10,
      yesTally: 3,
      noTally: 0,
    },
    'best-animal-fish': {
      type: 'candidate',
      ballots: 34,
      overvotes: 23,
      undervotes: 5,
      officialOptionTallies: {
        seahorse: 3,
        salmon: 0,
        'write-in': 3,
      },
    },
  },
});

const ballotStyleManualReportArgs: AdminTallyReportProps = {
  title: 'Ballot Style Tally Report for Ballot Style 2F',
  isTest: true,
  isOfficial: true,
  testId: 'tally-report',
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  contests: getContests({
    election,
    ballotStyle: assertDefined(
      getBallotStyle({ ballotStyleId: '2F' as BallotStyleId, election })
    ),
  }),
  scannedElectionResults,
  manualElectionResults,
  customFilter: undefined,
  scannerBatches: undefined,
  includeSignatureLines: false,
};

export const BallotStyleManualReport: Story = {
  args: ballotStyleManualReportArgs,
};

const fullElectionWriteInReportArgs: AdminTallyReportProps = {
  title: 'Full Election Tally Report',
  isTest: true,
  isOfficial: false,
  testId: 'tally-report',
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  contests,
  scannedElectionResults: buildElectionResultsFixture({
    election,
    cardCounts: {
      bmd: 0,
      hmpb: [100],
    },
    includeGenericWriteIn: false,
    contestResultsSummaries: {
      'zoo-council-mammal': {
        type: 'candidate',
        ballots: 100,
        officialOptionTallies: {
          zebra: 50,
          lion: 15,
          kangaroo: 10,
          elephant: 5,
        },
        writeInOptionTallies: {
          'write-in-1': {
            name: 'Salty Sally',
            tally: 15,
          },
          'write-in-2': {
            name: 'Joe Handsome',
            tally: 3,
          },
          'write-in-3': {
            name: 'Faux Francis',
            tally: 2,
          },
          [Tabulation.PENDING_WRITE_IN_ID]: {
            ...Tabulation.PENDING_WRITE_IN_CANDIDATE,
            tally: 10,
          },
        },
      },
    },
  }),
  manualElectionResults: buildManualResultsFixture({
    election,
    ballotCount: 50,
    contestResultsSummaries: {
      'zoo-council-mammal': {
        type: 'candidate',
        ballots: 50,
        officialOptionTallies: {
          zebra: 10,
          lion: 5,
          kangaroo: 5,
          elephant: 0,
        },
        writeInOptionTallies: {
          'write-in-4': {
            name: 'Billy Bob',
            tally: 30,
          },
        },
      },
    },
  }),
  customFilter: undefined,
  scannerBatches: undefined,
  includeSignatureLines: true,
};

export const FullElectionWriteInReport: Story = {
  args: fullElectionWriteInReportArgs,
};

export default meta;
