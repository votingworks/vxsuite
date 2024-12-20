import { expect, test } from 'vitest';
import {
  getPollsReportTitle,
  getPollsStateName,
  getPollsTransitionAction,
  getPollsTransitionActionPastTense,
  getPollsTransitionDestinationState,
  getPollTransitionsFromState,
  isPollsSuspensionTransition,
  isValidPollsStateChange,
} from './polls';

test('getPollsTransitionDestinationState', () => {
  expect(getPollsTransitionDestinationState('close_polls')).toEqual(
    'polls_closed_final'
  );
  expect(getPollsTransitionDestinationState('open_polls')).toEqual(
    'polls_open'
  );
  expect(getPollsTransitionDestinationState('resume_voting')).toEqual(
    'polls_open'
  );
  expect(getPollsTransitionDestinationState('pause_voting')).toEqual(
    'polls_paused'
  );
});

test('getPollsTransitionAction', () => {
  expect(getPollsTransitionAction('close_polls')).toEqual('Close Polls');
  expect(getPollsTransitionAction('open_polls')).toEqual('Open Polls');
  expect(getPollsTransitionAction('resume_voting')).toEqual('Resume Voting');
  expect(getPollsTransitionAction('pause_voting')).toEqual('Pause Voting');
});

test('getPollsReportTitle', () => {
  expect(getPollsReportTitle('close_polls')).toEqual('Polls Closed Report');
  expect(getPollsReportTitle('open_polls')).toEqual('Polls Opened Report');
  expect(getPollsReportTitle('resume_voting')).toEqual('Voting Resumed Report');
  expect(getPollsReportTitle('pause_voting')).toEqual('Voting Paused Report');
});

test('getPollsStateName', () => {
  expect(getPollsStateName('polls_open')).toEqual('Open');
  expect(getPollsStateName('polls_paused')).toEqual('Paused');
  expect(getPollsStateName('polls_closed_initial')).toEqual('Closed');
  expect(getPollsStateName('polls_closed_final')).toEqual('Closed');
});

test('isValidPollsStateChange', () => {
  // from polls closed initial
  expect(
    isValidPollsStateChange('polls_closed_initial', 'polls_closed_initial')
  ).toEqual(false);
  expect(isValidPollsStateChange('polls_closed_initial', 'polls_open')).toEqual(
    true
  );
  expect(
    isValidPollsStateChange('polls_closed_initial', 'polls_paused')
  ).toEqual(false);
  expect(
    isValidPollsStateChange('polls_closed_initial', 'polls_closed_final')
  ).toEqual(false);

  // from polls open
  expect(isValidPollsStateChange('polls_open', 'polls_closed_initial')).toEqual(
    false
  );
  expect(isValidPollsStateChange('polls_open', 'polls_open')).toEqual(false);
  expect(isValidPollsStateChange('polls_open', 'polls_paused')).toEqual(true);
  expect(isValidPollsStateChange('polls_open', 'polls_closed_final')).toEqual(
    true
  );

  // from polls paused
  expect(
    isValidPollsStateChange('polls_paused', 'polls_closed_initial')
  ).toEqual(false);
  expect(isValidPollsStateChange('polls_paused', 'polls_open')).toEqual(true);
  expect(isValidPollsStateChange('polls_paused', 'polls_paused')).toEqual(
    false
  );
  expect(isValidPollsStateChange('polls_paused', 'polls_closed_final')).toEqual(
    true
  );

  // from polls closed final
  expect(
    isValidPollsStateChange('polls_closed_final', 'polls_closed_initial')
  ).toEqual(false);
  expect(isValidPollsStateChange('polls_closed_final', 'polls_open')).toEqual(
    false
  );
  expect(isValidPollsStateChange('polls_closed_final', 'polls_paused')).toEqual(
    false
  );
  expect(
    isValidPollsStateChange('polls_closed_final', 'polls_closed_final')
  ).toEqual(false);
});

test('getPollTransitionsFromState', () => {
  expect(getPollTransitionsFromState('polls_open')).toMatchObject([
    'close_polls',
    'pause_voting',
  ]);
  expect(getPollTransitionsFromState('polls_paused')).toMatchObject([
    'resume_voting',
    'close_polls',
  ]);
  expect(getPollTransitionsFromState('polls_closed_initial')).toMatchObject([
    'open_polls',
  ]);
  expect(getPollTransitionsFromState('polls_closed_final')).toMatchObject([]);
});

test('getPollsTransitionActionPastTense', () => {
  expect(getPollsTransitionActionPastTense('close_polls')).toEqual(
    'Polls Closed'
  );
  expect(getPollsTransitionActionPastTense('open_polls')).toEqual(
    'Polls Opened'
  );
  expect(getPollsTransitionActionPastTense('resume_voting')).toEqual(
    'Voting Resumed'
  );
  expect(getPollsTransitionActionPastTense('pause_voting')).toEqual(
    'Voting Paused'
  );
});

test('isPollsSuspensionTransition', () => {
  expect(isPollsSuspensionTransition('close_polls')).toEqual(false);
  expect(isPollsSuspensionTransition('open_polls')).toEqual(false);
  expect(isPollsSuspensionTransition('resume_voting')).toEqual(true);
  expect(isPollsSuspensionTransition('pause_voting')).toEqual(true);
});
