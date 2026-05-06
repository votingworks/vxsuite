import { expect, test } from 'vitest';
import { Tabulation } from '.';

test('formatBatchId returns first and last segments for hyphenated IDs', () => {
  expect(
    Tabulation.formatBatchId('b28733b5-dc01-4901-b433-ea179942993b')
  ).toEqual('b28733b5-ea179942993b');
});

test('formatBatchId returns the ID unchanged when there are no hyphens', () => {
  expect(Tabulation.formatBatchId('abc123')).toEqual('abc123');
});

test('formatBatchId returns first and last segments for a two-part ID', () => {
  expect(Tabulation.formatBatchId('batch-1')).toEqual('batch-1');
});
