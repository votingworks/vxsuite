import {
  getPollsReportTitle,
  getPollsStateName,
  getPollsTransitionAction,
  getPollsTransitionActionPastTense,
  getPollsTransitionDestinationState,
  getPollTransitionsFromState,
  isValidPollsStateChange,
} from './polls';

test('getPollsTransitionDestinationState', () => {
  expect(getPollsTransitionDestinationState('close_polls')).toEqual(
    'polls_closed_final'
  );
  expect(getPollsTransitionDestinationState('open_polls')).toEqual(
    'polls_open'
  );
  expect(getPollsTransitionDestinationState('unpause_polls')).toEqual(
    'polls_open'
  );
  expect(getPollsTransitionDestinationState('pause_polls')).toEqual(
    'polls_paused'
  );
});

test('getPollsTransitionAction', () => {
  expect(getPollsTransitionAction('close_polls')).toEqual('Close');
  expect(getPollsTransitionAction('open_polls')).toEqual('Open');
  expect(getPollsTransitionAction('unpause_polls')).toEqual('Reopen');
  expect(getPollsTransitionAction('pause_polls')).toEqual('Pause');
});

test('getPollsReportTitle', () => {
  expect(getPollsReportTitle('close_polls')).toEqual('Polls Closed Report');
  expect(getPollsReportTitle('open_polls')).toEqual('Polls Opened Report');
  expect(getPollsReportTitle('unpause_polls')).toEqual('Polls Reopened Report');
  expect(getPollsReportTitle('pause_polls')).toEqual('Polls Paused Report');
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
    'pause_polls',
  ]);
  expect(getPollTransitionsFromState('polls_paused')).toMatchObject([
    'unpause_polls',
    'close_polls',
  ]);
  expect(getPollTransitionsFromState('polls_closed_initial')).toMatchObject([
    'open_polls',
  ]);
  expect(getPollTransitionsFromState('polls_closed_final')).toMatchObject([]);
});

test('getPollsTransitionActionPastTense', () => {
  expect(getPollsTransitionActionPastTense('close_polls')).toEqual('Closed');
  expect(getPollsTransitionActionPastTense('open_polls')).toEqual('Opened');
  expect(getPollsTransitionActionPastTense('unpause_polls')).toEqual(
    'Reopened'
  );
  expect(getPollsTransitionActionPastTense('pause_polls')).toEqual('Paused');
});
