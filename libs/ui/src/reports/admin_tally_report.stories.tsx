import { Meta, StoryObj } from '@storybook/react';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  buildElectionResultsFixture,
  buildManualResultsFixture,
} from '@votingworks/utils';
import { getBallotStyle, getContests } from '@votingworks/types';
import { assertDefined } from '@votingworks/basics';
import { AdminTallyReportProps, AdminTallyReport } from './admin_tally_report';
import { TallyReportPreview } from './tally_report';

const electionDefinition = electionTwoPartyPrimaryDefinition;
const { election } = electionDefinition;
const { contests } = election;

function AdminTallyReportPreview(props: AdminTallyReportProps): JSX.Element {
  return (
    <TallyReportPreview>
      <AdminTallyReport {...props} />
    </TallyReportPreview>
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
  title: 'Official Batch Tally Report for Batch 1',
  subtitle: election.title,
  testId: 'tally-report',
  electionDefinition,
  contests,
  scannedElectionResults,
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
  title: 'TEST Ballot Style Tally Report for Ballot Style 2F',
  subtitle: election.title,
  testId: 'tally-report',
  electionDefinition,
  contests: getContests({
    election,
    ballotStyle: assertDefined(
      getBallotStyle({ ballotStyleId: '2F', election })
    ),
  }),
  scannedElectionResults,
  manualElectionResults,
};

export const BallotStyleManualReport: Story = {
  args: ballotStyleManualReportArgs,
};

export default meta;
