import { expect, test } from 'vitest';
import {
  flattenBallotLineBreaks,
  splitBallotLineBreaks,
} from './ballot_strings';

test('splitBallotLineBreaks splits on common <br> variants', () => {
  expect(splitBallotLineBreaks('foo<br/>bar')).toEqual(['foo', 'bar']);
  expect(splitBallotLineBreaks('foo<br>bar')).toEqual(['foo', 'bar']);
  expect(splitBallotLineBreaks('foo<br />bar')).toEqual(['foo', 'bar']);
  expect(splitBallotLineBreaks('foo<BR/>bar')).toEqual(['foo', 'bar']);
  expect(splitBallotLineBreaks('foo<Br />bar')).toEqual(['foo', 'bar']);
});

test('splitBallotLineBreaks returns a single segment when no <br> present', () => {
  expect(splitBallotLineBreaks('Joseph R. Biden')).toEqual(['Joseph R. Biden']);
  expect(splitBallotLineBreaks('')).toEqual(['']);
});

test('splitBallotLineBreaks splits a real-world candidate name', () => {
  expect(splitBallotLineBreaks('Joseph R. Biden<br/>Kamala D. Harris')).toEqual(
    ['Joseph R. Biden', 'Kamala D. Harris']
  );
});

test('flattenBallotLineBreaks joins with a single space', () => {
  expect(flattenBallotLineBreaks('Joseph R. Biden<br/>Kamala D. Harris')).toEqual(
    'Joseph R. Biden Kamala D. Harris'
  );
  expect(
    flattenBallotLineBreaks('Representative in Congress<br/>2nd District')
  ).toEqual('Representative in Congress 2nd District');
});

test('flattenBallotLineBreaks leaves plain strings unchanged', () => {
  expect(flattenBallotLineBreaks('No breaks here')).toEqual('No breaks here');
});
