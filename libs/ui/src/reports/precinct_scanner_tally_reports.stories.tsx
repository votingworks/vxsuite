import { Meta, StoryObj } from '@storybook/react';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
} from '@votingworks/utils';
import { PrintedReportPreview } from './layout';
import {
  PrecinctScannerTallyReports,
  PrecinctScannerTallyReportsProps,
} from './precinct_scanner_tally_reports';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();
const { election } = electionTwoPartyPrimaryDefinition;

function PrecinctScannerTallyReportsPreview(
  props: PrecinctScannerTallyReportsProps
): JSX.Element {
  return (
    <PrintedReportPreview>
      <PrecinctScannerTallyReports {...props} />
    </PrintedReportPreview>
  );
}

type Story = StoryObj<typeof PrecinctScannerTallyReportsPreview>;

const meta: Meta<typeof PrecinctScannerTallyReportsPreview> = {
  title: 'libs-ui/PrecinctScannerTallyReports',
  component: PrecinctScannerTallyReportsPreview,
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

const electionResultsByParty = [
  {
    partyId: '1',
    ...buildElectionResultsFixture({
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
    }),
  },
];

const reportArgs: PrecinctScannerTallyReportsProps = {
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  electionResultsByParty,
  precinctSelection: ALL_PRECINCTS_SELECTION,
  pollsTransition: 'close_polls',
  isLiveMode: false,
  pollsTransitionedTime: Date.now(),
  reportPrintedTime: Date.now(),
  precinctScannerMachineId: 'VX-00-000',
};

export const PrecinctTallyReports: Story = {
  args: reportArgs,
};

export default meta;
