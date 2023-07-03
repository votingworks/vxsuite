import { Meta, StoryObj } from '@storybook/react';
import { electionMinimalExhaustiveSampleDefinition } from '@votingworks/fixtures';
import { TallyReportPreview } from './tally_report';
import {
  WriteInAdjudicationReport,
  WriteInAdjudicationReportProps,
} from './write_in_adjudication_report';

const { election } = electionMinimalExhaustiveSampleDefinition;

function WriteInTallyReportPreview(
  props: WriteInAdjudicationReportProps
): JSX.Element {
  return (
    <TallyReportPreview>
      <WriteInAdjudicationReport {...props} />
    </TallyReportPreview>
  );
}

type Story = StoryObj<typeof WriteInTallyReportPreview>;

const meta: Meta<typeof WriteInTallyReportPreview> = {
  title: 'libs-ui/WriteInTallyReport',
  component: WriteInTallyReportPreview,
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

const exampleReportArgs: WriteInAdjudicationReportProps = {
  election,
  isOfficialResults: true,
  generatedAtTime: new Date('2020-11-03T12:00:00.000Z'),
  electionWriteInSummary: {
    contestWriteInSummaries: {
      'zoo-council-mammal': {
        contestId: 'zoo-council-mammal',
        totalTally: 40,
        pendingTally: 11,
        invalidTally: 2,
        candidateTallies: {
          zebra: {
            id: 'zebra',
            name: 'Zebra',
            tally: 17,
          },
          lion: {
            id: 'lion',
            name: 'Lion',
            tally: 5,
          },
          bonobo: {
            id: 'bonobo',
            name: 'Bonobo',
            tally: 5,
            isWriteIn: true,
          },
        },
      },
      'aquarium-council-fish': {
        contestId: 'aquarium-council-fish',
        totalTally: 50,
        pendingTally: 1,
        invalidTally: 9,
        candidateTallies: {
          pufferfish: {
            id: 'pufferfish',
            name: 'Pufferfish',
            tally: 17,
          },
          relicanth: {
            id: 'relicanth',
            name: 'Relicanth',
            tally: 14,
            isWriteIn: true,
          },
          magikarp: {
            id: 'magikarp',
            name: 'Magikarp',
            tally: 9,
            isWriteIn: true,
          },
        },
      },
    },
  },
};

export const ExampleReport: Story = {
  args: exampleReportArgs,
};

export const EmptyReport: Story = {
  args: {
    election,
    isOfficialResults: true,
    generatedAtTime: new Date('2020-11-03T12:00:00.000Z'),
    electionWriteInSummary: {
      contestWriteInSummaries: {},
    },
  },
};

export default meta;
