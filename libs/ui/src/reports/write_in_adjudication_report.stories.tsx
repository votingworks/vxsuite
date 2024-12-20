import { Meta, StoryObj } from '@storybook/react';
import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { PrintedReportPreview } from './layout';
import {
  WriteInAdjudicationReport,
  WriteInAdjudicationReportProps,
} from './write_in_adjudication_report';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

function WriteInTallyReportPreview(
  props: WriteInAdjudicationReportProps
): JSX.Element {
  return (
    <PrintedReportPreview>
      <WriteInAdjudicationReport {...props} />
    </PrintedReportPreview>
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

const generalReportArgs: WriteInAdjudicationReportProps = {
  electionDefinition: electionFamousNames2021Fixtures.readElectionDefinition(),
  electionPackageHash: '11111111111111111111',
  isOfficial: false,
  isTest: false,
  generatedAtTime: new Date('2020-11-03T12:00:00.000'),
  electionWriteInSummary: {
    contestWriteInSummaries: {
      mayor: {
        contestId: 'mayor',
        totalTally: 40,
        pendingTally: 16,
        invalidTally: 2,
        candidateTallies: {
          'sherlock-holmes': {
            id: 'sherlock-holmes',
            name: 'Sherlock Holmes',
            tally: 17,
          },
          'thomas-edison': {
            id: 'thomas-edison',
            name: 'Thomas Edison',
            tally: 5,
          },
        },
      },
      attorney: {
        contestId: 'attorney',
        totalTally: 50,
        pendingTally: 1,
        invalidTally: 9,
        candidateTallies: {
          'john-snow': {
            id: 'john-snow',
            name: 'John Snow',
            tally: 17,
          },
          'mark-twain': {
            id: 'mark-twain',
            name: 'Mark Twain',
            tally: 14,
          },
          'pooh-beer': {
            id: 'pooh-beer',
            name: 'Pooh Beer',
            tally: 9,
            isWriteIn: true,
          },
        },
      },
      'public-works-director': {
        contestId: 'public-works-director',
        totalTally: 50,
        pendingTally: 50,
        invalidTally: 0,
        candidateTallies: {},
      },
      'chief-of-police': {
        contestId: 'chief-of-police',
        totalTally: 50,
        pendingTally: 5,
        invalidTally: 32,
        candidateTallies: {
          grimace: {
            id: 'grimace',
            name: 'Grimace',
            tally: 8,
            isWriteIn: true,
          },
          hamburglar: {
            id: 'hamburglar',
            name: 'Hamburglar',
            tally: 5,
            isWriteIn: true,
          },
        },
      },
      'parks-and-recreation-director': {
        contestId: 'parks-and-recreation-director',
        totalTally: 50,
        pendingTally: 0,
        invalidTally: 0,
        candidateTallies: {
          'james-bond': {
            id: 'james-bond',
            name: 'James Bond',
            tally: 17,
            isWriteIn: true,
          },
          'james-kirk': {
            id: 'james-kirk',
            name: 'James Kirk',
            tally: 33,
            isWriteIn: true,
          },
        },
      },
      'city-council': {
        contestId: 'city-council',
        totalTally: 4500,
        pendingTally: 1500,
        invalidTally: 100,
        candidateTallies: {
          'indiana-jones': {
            id: 'indiana-jones',
            name: 'Indiana Jones',
            tally: 1900,
          },
          spock: {
            id: 'spock',
            name: 'Spock',
            tally: 700,
            isWriteIn: true,
          },
          'luke-skywalker': {
            id: 'luke-skywalker',
            name: 'Luke Skywalker',
            tally: 300,
            isWriteIn: true,
          },
        },
      },
    },
  },
};

export const GeneralReport: Story = {
  args: generalReportArgs,
};

const primaryReportArgs: WriteInAdjudicationReportProps = {
  electionDefinition: electionTwoPartyPrimaryDefinition,
  electionPackageHash: '11111111111111111111',
  isOfficial: true,
  isTest: false,
  generatedAtTime: new Date('2020-11-03T12:00:00.000'),
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

export const PrimaryReport: Story = {
  args: primaryReportArgs,
};

export const EmptyPrimaryReport: Story = {
  args: {
    electionDefinition: electionTwoPartyPrimaryDefinition,
    electionPackageHash: '11111111111111111111',
    isOfficialResults: true,
    generatedAtTime: new Date('2020-11-03T12:00:00.000'),
    electionWriteInSummary: {
      contestWriteInSummaries: {},
    },
  },
};

export default meta;
