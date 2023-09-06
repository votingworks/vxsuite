import {
  electionSample,
  electionSampleDefinition,
} from '@votingworks/fixtures';
import { getBallotStyle, getContests, vote } from '@votingworks/types';
import { expectPrintToMatchSnapshot } from '@votingworks/test-utils';
import { render } from '../../test/react_testing_library';
import { PrintPage } from './print_page';

test('no votes', async () => {
  render(
    <PrintPage
      electionDefinition={electionSampleDefinition}
      ballotStyleId="5"
      precinctId="21"
      generateBallotId={() => 'CHhgYxfN5GeqnK8KaVOt1w'}
      isLiveMode={false}
      votes={{}}
      onPrintStarted={jest.fn()}
    />
  );
  await expectPrintToMatchSnapshot();
});

test('with votes', async () => {
  render(
    <PrintPage
      electionDefinition={electionSampleDefinition}
      ballotStyleId="5"
      precinctId="21"
      generateBallotId={() => 'CHhgYxfN5GeqnK8KaVOt1w'}
      votes={vote(
        getContests({
          ballotStyle: getBallotStyle({
            election: electionSample,
            ballotStyleId: '5',
          })!,
          election: electionSample,
        }),
        {
          president: 'barchi-hallaren',
          'question-a': ['question-a-option-no'],
          'question-b': ['question-b-option-yes'],
          'lieutenant-governor': 'norberg',
        }
      )}
      isLiveMode={false}
      onPrintStarted={jest.fn()}
    />
  );
  await expectPrintToMatchSnapshot();
});

test('without votes and inline seal', async () => {
  const electionDefinition = electionSampleDefinition;
  render(
    <PrintPage
      electionDefinition={electionDefinition}
      ballotStyleId="5"
      precinctId="21"
      generateBallotId={() => 'CHhgYxfN5GeqnK8KaVOt1w'}
      isLiveMode={false}
      votes={{}}
      onPrintStarted={jest.fn()}
    />
  );
  await expectPrintToMatchSnapshot();
});
