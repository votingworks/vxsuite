import { electionSample } from '@votingworks/fixtures';
import { getBallotStyle, getContests, vote } from '@votingworks/types';
import React from 'react';
import { randomBase64 } from '@votingworks/utils';
import { Route } from 'react-router-dom';
import { render } from '../../test/test_utils';
import { PrintPage } from './print_page';
import {
  electionSampleNoSealDefinition,
  electionSampleWithSealDefinition,
} from '../data';

jest.mock('@votingworks/utils', (): { randomBase64: typeof randomBase64 } => {
  const original = jest.requireActual<Record<string, unknown>>(
    '@votingworks/utils'
  );
  // Mock random string generation so that snapshots match, while leaving the rest of the module
  // intact
  return {
    ...original,
    randomBase64: () => 'CHhgYxfN5GeqnK8KaVOt1w',
  };
});

it('renders PrintPage without votes', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: '21',
    route: '/print',
  });
  expect(container.firstChild).toMatchSnapshot();
});

it('renders PrintPage with votes', () => {
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    precinctId: '21',
    route: '/print',
    votes: vote(
      getContests({
        ballotStyle: getBallotStyle({
          election: electionSample,
          ballotStyleId: '5',
        })!,
        election: electionSample,
      }),
      {
        president: 'barchi-hallaren',
        'question-a': ['no'],
        'question-b': ['yes'],
        'lieutenant-governor': 'norberg',
      }
    ),
  });
  expect(container.childNodes[1]).toMatchSnapshot();
});

it('renders PrintPage without votes and inline seal', () => {
  const electionDefinition = electionSampleWithSealDefinition;
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: '21',
    route: '/print',
  });
  expect(container.childNodes[1]).toMatchSnapshot();
});

it('renders PrintPage without votes and no seal', () => {
  const electionDefinition = electionSampleNoSealDefinition;
  const { container } = render(<Route path="/print" component={PrintPage} />, {
    ballotStyleId: '5',
    electionDefinition,
    precinctId: '21',
    route: '/print',
  });
  expect(container.childNodes[1]).toMatchSnapshot();
});
