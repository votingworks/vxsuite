import React from 'react';
import { Meta } from '@storybook/react';

import {
  ContestVoterSummary as Component,
  ContestVoterSummaryProps as Props,
} from './contest_voter_summary';
import { Caption, P } from './typography';

const initialProps: Props = {
  districtName: 'East Fullerton',
  title: 'City Council',
  titleType: 'h3',
  votes: [
    {
      id: 'scorsese',
      label: 'Martin Scorsese',
      caption: 'American',
    },
    {
      id: 'godard',
      label: 'Jean-Luc Godard',
      caption: 'French',
    },
    {
      id: 'kurosawa',
      label: 'Akira Kurosawa',
      caption: 'Japanese',
    },
    {
      id: 'barney',
      label: 'Barney',
      caption: '(write-in)',
    },
  ]
};

const meta: Meta<typeof Component> = {
  title: 'Organisms/ContestVoterSummary',
  component: Component,
  args: initialProps,
  argTypes: {
    onChange: {},
  },
};

export default meta;

export function ContestVoterSummary(props: Props): JSX.Element {
  return <Component {...props} />;
}
