import { expect, test } from 'vitest';
import { DateWithoutTime } from '@votingworks/basics';
import { LanguageCode, unsafeParse } from '@votingworks/types';
import { type ElectionInfoUpdate, ElectionInfoUpdateSchema } from './types.js';

const electionInfoUpdate: ElectionInfoUpdate = {
  electionId: 'election-1',
  type: 'general',
  isMiCombinedBallotPrimary: false,
  date: new DateWithoutTime('2026-11-03'),
  title: 'General Election',
  state: 'Demo State',
  jurisdictionName: 'Demo County',
  seal: '',
  languageCodes: [LanguageCode.ENGLISH],
};

test('ElectionInfoUpdateSchema trims text fields', () => {
  expect(
    unsafeParse(ElectionInfoUpdateSchema, {
      ...electionInfoUpdate,
      title: '  General Election ',
      state: ' Demo State',
      jurisdictionName: 'Demo County  ',
    })
  ).toEqual(electionInfoUpdate);
});

test.each(['title', 'state', 'jurisdictionName'] as const)(
  'ElectionInfoUpdateSchema rejects a blank %s',
  (field) => {
    expect(() =>
      unsafeParse(ElectionInfoUpdateSchema, {
        ...electionInfoUpdate,
        [field]: '   ',
      })
    ).toThrow();
  }
);
