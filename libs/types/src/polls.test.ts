import { expect, test } from 'vitest';
import { assert } from '@votingworks/basics';
import {
  doesPollsStateSupportLiveReporting,
  PollsState,
  PollsStateSupportsLiveReporting,
} from './polls';

test('doesPollsStateSupportLiveReporting', () => {
  expect(doesPollsStateSupportLiveReporting('polls_open')).toEqual(true);
  expect(doesPollsStateSupportLiveReporting('polls_closed_final')).toEqual(
    true
  );
  expect(doesPollsStateSupportLiveReporting('polls_paused')).toEqual(false);
  expect(doesPollsStateSupportLiveReporting('polls_closed_initial')).toEqual(
    false
  );

  const testState = 'polls_open' as PollsState;
  assert(doesPollsStateSupportLiveReporting(testState));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const testState2: PollsStateSupportsLiveReporting = testState;
});
