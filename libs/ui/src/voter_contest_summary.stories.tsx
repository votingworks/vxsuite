import { Meta } from '@storybook/react';

import {
  VoterContestSummary,
  VoterContestSummaryProps,
} from './voter_contest_summary';

const initialProps: VoterContestSummaryProps = {
  districtName: 'East Fullerton',
  title: 'City Council',
  titleType: 'h3',
  votes: [
    { label: 'Martin Scorsese', caption: 'American' },
    { label: 'Jean-Luc Godard', caption: 'French' },
    { label: 'Akira Kurosawa', caption: 'Japanese' },
    { label: 'Barney', caption: '(write-in)' },
  ],
};

const meta: Meta<typeof VoterContestSummary> = {
  title: 'libs-ui/VoterContestSummary',
  component: VoterContestSummary,
  args: initialProps,
};

export default meta;

export { VoterContestSummary };
