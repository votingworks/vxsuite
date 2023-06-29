import {
  electionSampleDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { find } from '@votingworks/basics';
import { CandidateContest } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';

import { Contest } from './contest';
import {
  MsEitherNeitherContest,
  mergeMsEitherNeitherContests,
} from '../utils/ms_either_neither_contests';

const electionSample = electionSampleDefinition.election;
const firstContestTitle = electionSample.contests[0].title;

const candidateContest = find(
  electionSample.contests,
  (c): c is CandidateContest => c.type === 'candidate'
);
const yesnoContest = find(electionSample.contests, (c) => c.type === 'yesno');
const msEitherNeitherContest = find(
  mergeMsEitherNeitherContests(
    electionWithMsEitherNeitherDefinition.election.contests
  ),
  (c): c is MsEitherNeitherContest => c.type === 'ms-either-neither'
);

test('renders', () => {
  const { container } = render(
    <Contest
      election={electionSample}
      contest={electionSample.contests[0]}
      votes={{}}
      updateVote={jest.fn()}
    />
  );
  screen.getByText(firstContestTitle);
  expect(container).toMatchSnapshot();
});

test.each([
  ['with votes', candidateContest.candidates.slice(0, 1)],
  ['without votes', undefined],
])('candidate contest %s', (_, vote) => {
  render(
    <Contest
      election={electionSample}
      contest={candidateContest}
      votes={{
        [candidateContest.id]: vote,
      }}
      updateVote={jest.fn()}
    />
  );
  screen.getByText(firstContestTitle);
});

test('yesno contest', () => {
  render(
    <Contest
      election={electionSample}
      contest={yesnoContest}
      votes={{
        [yesnoContest.id]: ['yes'],
      }}
      updateVote={jest.fn()}
    />
  );
  screen.getByText(yesnoContest.title);
});

test('renders ms-either-neither contests', () => {
  const electionDefinition = electionWithMsEitherNeitherDefinition;
  const updateVote = jest.fn();
  render(
    <Contest
      election={electionDefinition.election}
      contest={msEitherNeitherContest}
      votes={{}}
      updateVote={updateVote}
    />
  );

  screen.getByText('Ballot Measure 1');
  userEvent.click(
    screen.getByRole('option', { name: /for approval of either/i })
  );
  expect(updateVote).toHaveBeenCalledWith('750000015', ['yes']);
  userEvent.click(screen.getByRole('option', { name: /for alternative/i }));
  expect(updateVote).toHaveBeenCalledWith('750000016', ['no']);
});
