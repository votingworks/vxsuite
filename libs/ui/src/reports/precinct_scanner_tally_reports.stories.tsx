import { Meta, StoryObj } from '@storybook/react';
import { electionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import {
  ALL_PRECINCTS_SELECTION,
  buildElectionResultsFixture,
} from '@votingworks/utils';
import { ElectionDefinition } from '@votingworks/types';
import { TallyReportPreview } from './tally_report';
import {
  PrecinctScannerTallyReports,
  PrecinctScannerTallyReportsProps,
} from './precinct_scanner_tally_reports';

const { election } = electionTwoPartyPrimaryDefinition;

function PrecinctScannerTallyReportsPreview(
  props: PrecinctScannerTallyReportsProps
): JSX.Element {
  return (
    <TallyReportPreview>
      <PrecinctScannerTallyReports {...props} />
    </TallyReportPreview>
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

const electionDefinitionWithTermDescription: ElectionDefinition = {
  ...electionTwoPartyPrimaryDefinition,
  election: {
    ...electionTwoPartyPrimaryDefinition.election,
    contests: electionTwoPartyPrimaryDefinition.election.contests.map((c) => {
      if (c.type === 'candidate') {
        return {
          ...c,
          termDescription: 'For three years',
        };
      }
      return c;
    }),
  },
};

const reportArgs: PrecinctScannerTallyReportsProps = {
  electionDefinition: electionDefinitionWithTermDescription,
  electionResultsByParty,
  precinctSelection: ALL_PRECINCTS_SELECTION,
  pollsTransition: 'close_polls',
  isLiveMode: false,
  pollsTransitionedTime: Date.now(),
  precinctScannerMachineId: 'VX-00-000',
  signedQuickResultsReportingUrl: 'foobar',
  totalBallotsScanned: 3450,
};

export const PrecinctTallyReports: Story = {
  args: reportArgs,
};

export default meta;
