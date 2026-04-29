import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DateWithoutTime } from '@votingworks/basics';
import { DEFAULT_SYSTEM_SETTINGS } from '@votingworks/types';
import { areClosedPollsActionsBlocked } from './closed_polls_actions';

const ELECTION_DATE = new DateWithoutTime('2026-11-03');
const POLLS_CLOSE_TIME = '20:00:00';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('areClosedPollsActionsBlocked', () => {
  test('returns false when fileMode is undefined', () => {
    vi.setSystemTime(new Date('2026-11-03T18:00:00'));
    expect(
      areClosedPollsActionsBlocked(
        undefined,
        {
          ...DEFAULT_SYSTEM_SETTINGS,
          disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
        ELECTION_DATE
      )
    ).toEqual(false);
  });

  test('returns false when fileMode is "test"', () => {
    vi.setSystemTime(new Date('2026-11-03T18:00:00'));
    expect(
      areClosedPollsActionsBlocked(
        'test',
        {
          ...DEFAULT_SYSTEM_SETTINGS,
          disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
        ELECTION_DATE
      )
    ).toEqual(false);
  });

  test('returns false when system settings are undefined', () => {
    vi.setSystemTime(new Date('2026-11-03T18:00:00'));
    expect(
      areClosedPollsActionsBlocked('official', undefined, ELECTION_DATE)
    ).toEqual(false);
  });

  test('returns false when the setting is not enabled', () => {
    vi.setSystemTime(new Date('2026-11-03T18:00:00'));
    expect(
      areClosedPollsActionsBlocked(
        'official',
        DEFAULT_SYSTEM_SETTINGS,
        ELECTION_DATE
      )
    ).toEqual(false);
  });

  test('returns false when electionDayPollsCloseTime is not set', () => {
    vi.setSystemTime(new Date('2026-11-03T18:00:00'));
    expect(
      areClosedPollsActionsBlocked(
        'official',
        {
          ...DEFAULT_SYSTEM_SETTINGS,
          disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
        },
        ELECTION_DATE
      )
    ).toEqual(false);
  });

  test('returns false when electionDate is not provided', () => {
    vi.setSystemTime(new Date('2026-11-03T18:00:00'));
    expect(
      areClosedPollsActionsBlocked('official', {
        ...DEFAULT_SYSTEM_SETTINGS,
        disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
        electionDayPollsCloseTime: POLLS_CLOSE_TIME,
      })
    ).toEqual(false);
  });

  test('returns true when before polls close time in official file mode', () => {
    vi.setSystemTime(new Date('2026-11-03T18:00:00'));
    expect(
      areClosedPollsActionsBlocked(
        'official',
        {
          ...DEFAULT_SYSTEM_SETTINGS,
          disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
        ELECTION_DATE
      )
    ).toEqual(true);
  });

  test('returns false in unlocked file mode', () => {
    vi.setSystemTime(new Date('2026-11-03T18:00:00'));
    expect(
      areClosedPollsActionsBlocked(
        'unlocked',
        {
          ...DEFAULT_SYSTEM_SETTINGS,
          disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
        ELECTION_DATE
      )
    ).toEqual(false);
  });

  test('returns false when after polls close time', () => {
    vi.setSystemTime(new Date('2026-11-03T21:00:00'));
    expect(
      areClosedPollsActionsBlocked(
        'official',
        {
          ...DEFAULT_SYSTEM_SETTINGS,
          disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
        ELECTION_DATE
      )
    ).toEqual(false);
  });

  test('returns false at exactly polls close time', () => {
    vi.setSystemTime(new Date('2026-11-03T20:00:00'));
    expect(
      areClosedPollsActionsBlocked(
        'official',
        {
          ...DEFAULT_SYSTEM_SETTINGS,
          disallowVxAdminTabulationBeforeElectionDayPollsCloseTime: true,
          electionDayPollsCloseTime: POLLS_CLOSE_TIME,
        },
        ELECTION_DATE
      )
    ).toEqual(false);
  });
});
