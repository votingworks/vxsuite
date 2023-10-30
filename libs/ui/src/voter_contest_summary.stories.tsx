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
    { id: 'scorsese', label: 'Martin Scorsese', caption: 'American' },
    { id: 'godard', label: 'Jean-Luc Godard', caption: 'French' },
    { id: 'kurosawa', label: 'Akira Kurosawa', caption: 'Japanese' },
    { id: 'barney', label: 'Barney', caption: '(write-in)' },
  ],
};

const meta: Meta<typeof VoterContestSummary> = {
  title: 'libs-ui/VoterContestSummary',
  component: VoterContestSummary,
  args: initialProps,
};

export default meta;

export { VoterContestSummary };
