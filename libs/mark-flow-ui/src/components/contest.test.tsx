import {
  electionGeneralDefinition,
  electionWithMsEitherNeitherDefinition,
} from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import { find } from '@votingworks/basics';
import { CandidateContest, YesNoContest } from '@votingworks/types';
import { render, screen } from '../../test/react_testing_library';

import { Contest } from './contest';
import {
  MsEitherNeitherContest,
  mergeMsEitherNeitherContests,
} from '../utils/ms_either_neither_contests';

const electionGeneral = electionGeneralDefinition.election;
const firstContestTitle = electionGeneral.contests[0].title;

const candidateContest = find(
  electionGeneral.contests,
  (c): c is CandidateContest => c.type === 'candidate'
);
const yesnoContest = find(
  electionGeneral.contests,
  (c): c is YesNoContest => c.type === 'yesno'
);
const msEitherNeitherContest = find(
  mergeMsEitherNeitherContests(
    electionWithMsEitherNeitherDefinition.election.contests
  ),
  (c): c is MsEitherNeitherContest => c.type === 'ms-either-neither'
);

test('renders', () => {
  const { container } = render(
    <Contest
      election={electionGeneral}
      contest={electionGeneral.contests[0]}
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
      election={electionGeneral}
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
      election={electionGeneral}
      contest={yesnoContest}
      votes={{
        [yesnoContest.id]: [yesnoContest.yesOption.id],
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
  expect(updateVote).toHaveBeenCalledWith('750000015', [
    msEitherNeitherContest.eitherOption.id,
  ]);
  userEvent.click(screen.getByRole('option', { name: /for alternative/i }));
  expect(updateVote).toHaveBeenCalledWith('750000016', [
    msEitherNeitherContest.secondOption.id,
  ]);
});
