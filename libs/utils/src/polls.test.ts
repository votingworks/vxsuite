import {
  getPollsReportTitle,
  getPollsTransitionDestinationState,
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

test('getPollsReportTitle', () => {
  expect(getPollsReportTitle('close_polls')).toEqual('Polls Closed Report');
  expect(getPollsReportTitle('open_polls')).toEqual('Polls Opened Report');
  expect(getPollsReportTitle('unpause_polls')).toEqual('Polls Opened Report');
  expect(getPollsReportTitle('pause_polls')).toEqual('Polls Paused Report');
});
