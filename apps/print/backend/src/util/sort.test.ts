import { describe, expect, test } from 'vitest';
import { BallotPrintCount, LanguageCode } from '@votingworks/types';
import { sortBallotPrintCounts } from './sort';

let ballotStyleCounter = 0;

function makeBallotPrintCount(
  overrides: Partial<BallotPrintCount> = {}
): BallotPrintCount {
  ballotStyleCounter += 1;
  return {
    ballotStyleId: `ballot-style-${ballotStyleCounter}`,
    precinctId: 'precinct-1',
    precinctOrSplitName: 'Precinct 1',
    languageCode: LanguageCode.ENGLISH,
    absenteeCount: 0,
    precinctCount: 10,
    totalCount: 10,
    partyName: 'Green Party',
    ...overrides,
  };
}

describe('sortBallotPrintCounts', () => {
  test('sorts by totalCount descending (higher counts first)', () => {
    const counts: BallotPrintCount[] = [
      makeBallotPrintCount({ totalCount: 5 }),
      makeBallotPrintCount({ totalCount: 20 }),
      makeBallotPrintCount({ totalCount: 10 }),
    ];

    const sorted = [...counts].sort(sortBallotPrintCounts);

    expect(sorted.map((c) => c.totalCount)).toEqual([20, 10, 5]);
  });

  test('sorts by precinctOrSplitName alphabetically when totalCount is equal', () => {
    const counts: BallotPrintCount[] = [
      makeBallotPrintCount({ precinctOrSplitName: 'Precinct C' }),
      makeBallotPrintCount({ precinctOrSplitName: 'Precinct A' }),
      makeBallotPrintCount({ precinctOrSplitName: 'Precinct B' }),
    ];

    const sorted = [...counts].sort(sortBallotPrintCounts);

    expect(sorted.map((c) => c.precinctOrSplitName)).toEqual([
      'Precinct A',
      'Precinct B',
      'Precinct C',
    ]);
  });

  test('sorts by partyName alphabetically when totalCount and precinctOrSplitName are equal', () => {
    const counts: BallotPrintCount[] = [
      makeBallotPrintCount({ partyName: 'Republican' }),
      makeBallotPrintCount({ partyName: 'Democrat' }),
      makeBallotPrintCount({ partyName: 'Independent' }),
    ];

    const sorted = [...counts].sort(sortBallotPrintCounts);

    expect(sorted.map((c) => c.partyName)).toEqual([
      'Democrat',
      'Independent',
      'Republican',
    ]);
  });

  test('sorts by languageCode when all other fields are equal', () => {
    const counts: BallotPrintCount[] = [
      makeBallotPrintCount({ languageCode: LanguageCode.CHINESE_SIMPLIFIED }),
      makeBallotPrintCount({ languageCode: LanguageCode.ENGLISH }),
      makeBallotPrintCount({ languageCode: LanguageCode.SPANISH }),
    ];

    const sorted = [...counts].sort(sortBallotPrintCounts);

    expect(sorted.map((c) => c.languageCode)).toEqual([
      LanguageCode.ENGLISH,
      LanguageCode.SPANISH,
      LanguageCode.CHINESE_SIMPLIFIED,
    ]);
  });

  test('handles general election ballots (no party)', () => {
    const counts: BallotPrintCount[] = [
      makeBallotPrintCount({
        partyName: undefined,
        languageCode: LanguageCode.SPANISH,
      }),
      makeBallotPrintCount({
        partyName: undefined,
        languageCode: LanguageCode.ENGLISH,
      }),
    ];

    const sorted = [...counts].sort(sortBallotPrintCounts);

    // Falls through to languageCode sort
    expect(sorted.map((c) => c.languageCode)).toEqual([
      LanguageCode.ENGLISH,
      LanguageCode.SPANISH,
    ]);
  });

  test('applies full sort priority: totalCount > precinctOrSplitName > partyName > languageCode', () => {
    const counts: BallotPrintCount[] = [
      makeBallotPrintCount({
        totalCount: 5,
        precinctOrSplitName: 'Precinct A',
        partyName: 'Democrat',
        languageCode: LanguageCode.ENGLISH,
      }),
      makeBallotPrintCount({
        totalCount: 10,
        precinctOrSplitName: 'Precinct B',
        partyName: 'Republican',
        languageCode: LanguageCode.ENGLISH,
      }),
      makeBallotPrintCount({
        totalCount: 10,
        precinctOrSplitName: 'Precinct A',
        partyName: 'Republican',
        languageCode: LanguageCode.ENGLISH,
      }),
      makeBallotPrintCount({
        totalCount: 10,
        precinctOrSplitName: 'Precinct A',
        partyName: 'Democrat',
        languageCode: LanguageCode.SPANISH,
      }),
      makeBallotPrintCount({
        totalCount: 10,
        precinctOrSplitName: 'Precinct A',
        partyName: 'Democrat',
        languageCode: LanguageCode.ENGLISH,
      }),
    ];

    const sorted = [...counts].sort(sortBallotPrintCounts);

    // totalCount: 10 comes first (descending)
    // then Precinct A before Precinct B
    // then Democrat before Republican
    // then en before es-US
    expect(
      sorted.map((c) => ({
        totalCount: c.totalCount,
        precinctOrSplitName: c.precinctOrSplitName,
        partyName: c.partyName,
        languageCode: c.languageCode,
      }))
    ).toEqual([
      {
        totalCount: 10,
        precinctOrSplitName: 'Precinct A',
        partyName: 'Democrat',
        languageCode: LanguageCode.ENGLISH,
      },
      {
        totalCount: 10,
        precinctOrSplitName: 'Precinct A',
        partyName: 'Democrat',
        languageCode: LanguageCode.SPANISH,
      },
      {
        totalCount: 10,
        precinctOrSplitName: 'Precinct A',
        partyName: 'Republican',
        languageCode: LanguageCode.ENGLISH,
      },
      {
        totalCount: 10,
        precinctOrSplitName: 'Precinct B',
        partyName: 'Republican',
        languageCode: LanguageCode.ENGLISH,
      },
      {
        totalCount: 5,
        precinctOrSplitName: 'Precinct A',
        partyName: 'Democrat',
        languageCode: LanguageCode.ENGLISH,
      },
    ]);
  });
});
