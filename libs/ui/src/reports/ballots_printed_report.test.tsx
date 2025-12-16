import { expect, test } from 'vitest';
import {
  electionPrimaryPrecinctSplitsFixtures,
  electionSimpleSinglePrecinctFixtures,
} from '@votingworks/fixtures';
import {
  BallotPrintCount,
  hasSplits,
  LanguageCode,
  PrecinctWithSplits,
  PrecinctWithoutSplits,
} from '@votingworks/types';
import { format } from '@votingworks/utils';
import { assertDefined } from '@votingworks/basics';
import { render, screen } from '../../test/react_testing_library';
import { BallotsPrintedReport } from './ballots_printed_report';

test('renders report with test mode banner', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();

  render(
    <BallotsPrintedReport
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      generatedAtTime={new Date()}
      printCounts={[]}
      isTestMode
    />
  );

  // Check for report header
  screen.getByText('Ballots Printed Report');
  screen.getByText(new RegExp(electionDefinition.election.title));
  screen.getByText(/Report Generated/i);

  // Check for test mode banner
  screen.getByText('Test Report');
});

test('renders report without test mode banner', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();

  render(
    <BallotsPrintedReport
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      generatedAtTime={new Date()}
      printCounts={[]}
      isTestMode={false}
    />
  );

  expect(screen.queryByText('Test Report')).not.toBeInTheDocument();
});

test('renders report for Primary Election with precinct splits, parties, multiple languages', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { election } = electionDefinition;

  const splitPrecinct = assertDefined(
    election.precincts.find((p): p is PrecinctWithSplits => hasSplits(p))
  );
  const nonSplitPrecinct = assertDefined(
    election.precincts.find((p): p is PrecinctWithoutSplits => !hasSplits(p))
  );

  const split = assertDefined(splitPrecinct.splits[0]);

  const mammalParty = assertDefined(
    election.parties.find((p) => p.name === 'Mammal')
  );
  const fishParty = assertDefined(
    election.parties.find((p) => p.name === 'Fish')
  );

  const splitMammalEnglishBallotStyleId = assertDefined(
    election.ballotStyles.find(
      (ballotStyle) =>
        ballotStyle.precincts.includes(splitPrecinct.id) &&
        ballotStyle.partyId === mammalParty.id &&
        ballotStyle.languages?.includes(LanguageCode.ENGLISH) &&
        split.districtIds.every((d) => ballotStyle.districts.includes(d))
    )?.id
  );

  const nonSplitFishSpanishBallotStyleId = assertDefined(
    election.ballotStyles.find(
      (ballotStyle) =>
        ballotStyle.precincts.includes(nonSplitPrecinct.id) &&
        ballotStyle.partyId === fishParty.id &&
        ballotStyle.languages?.includes(LanguageCode.SPANISH) &&
        nonSplitPrecinct.districtIds.every((d) =>
          ballotStyle.districts.includes(d)
        )
    )?.id
  );

  const ballotPrintCounts: BallotPrintCount[] = [
    {
      // From a precinct split
      precinctId: splitPrecinct.id,
      precinctOrSplitName: split.name,
      ballotStyleId: splitMammalEnglishBallotStyleId,
      languageCode: LanguageCode.ENGLISH,
      absenteeCount: 2,
      precinctCount: 8,
      totalCount: 10,
      partyName: mammalParty.name,
    },
    {
      // From a precinct without splits
      precinctId: nonSplitPrecinct.id,
      precinctOrSplitName: nonSplitPrecinct.name,
      ballotStyleId: nonSplitFishSpanishBallotStyleId,
      absenteeCount: 2,
      precinctCount: 8,
      totalCount: 10,
      languageCode: LanguageCode.SPANISH,
      partyName: fishParty.name,
    },
  ];

  render(
    <BallotsPrintedReport
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      generatedAtTime={new Date()}
      printCounts={ballotPrintCounts}
      isTestMode
    />
  );

  // Table headers
  screen.getByText('Precinct / Split Name');
  screen.getByText('Party');
  screen.getByText('Language');
  screen.getByText('Total');
  screen.getByText('Precinct');
  screen.getByText('Absentee');

  // Split row + non-split row
  screen.getByText(split.name);
  screen.getByText(nonSplitPrecinct.name);
  screen.getByText(mammalParty.name);
  screen.getByText(fishParty.name);
  screen.getByText(
    format.languageDisplayName({
      languageCode: LanguageCode.ENGLISH,
      displayLanguageCode: 'en',
    })
  );
  screen.getByText(
    format.languageDisplayName({
      languageCode: LanguageCode.SPANISH,
      displayLanguageCode: 'en',
    })
  );

  screen.getByText('Sum Totals');
  screen.getByText('20');
  screen.getByText('16');
  screen.getByText('4');
});

test('renders report for General Election with no parties, precincts, single language', () => {
  const electionDefinition =
    electionSimpleSinglePrecinctFixtures.readElectionDefinition();
  const { election } = electionDefinition;

  const precinct = election.precincts[0];
  const ballotStyleId = election.ballotStyles[0].id;

  const ballotPrintCounts: BallotPrintCount[] = [
    {
      precinctId: precinct.id,
      precinctOrSplitName: precinct.name,
      ballotStyleId,
      languageCode: LanguageCode.ENGLISH,
      absenteeCount: 0,
      precinctCount: 42,
      totalCount: 42,
    },
  ];

  render(
    <BallotsPrintedReport
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      generatedAtTime={new Date()}
      printCounts={ballotPrintCounts}
      isTestMode
    />
  );

  screen.getByText(new RegExp(election.title));
  // Does not include "Split" in the name column header
  screen.getByText('Precinct Name');
  screen.getByText(precinct.name);
  // 42 appears in Precinct Count, Total Count, and in sum totals for both columns
  expect(screen.getAllByText('42').length).toEqual(4);
  screen.getByText('Sum Totals');
  // Language and Party columns are not rendered
  expect(screen.queryByText('Language')).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      format.languageDisplayName({
        languageCode: LanguageCode.ENGLISH,
        displayLanguageCode: 'en',
      })
    )
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Party')).not.toBeInTheDocument();
});

test('sums totals across multiple rows', () => {
  const electionDefinition =
    electionPrimaryPrecinctSplitsFixtures.readElectionDefinition();
  const { election } = electionDefinition;

  const splitPrecinct = assertDefined(
    election.precincts.find((p): p is PrecinctWithSplits => hasSplits(p))
  );
  const split = assertDefined(splitPrecinct.splits[0]);
  const nonSplitPrecinct = assertDefined(
    election.precincts.find((p): p is PrecinctWithoutSplits => !hasSplits(p))
  );

  const mammalParty = assertDefined(
    election.parties.find((p) => p.name === 'Mammal')
  );

  const splitMammalEnglishBallotStyleId = assertDefined(
    election.ballotStyles.find(
      (ballotStyle) =>
        ballotStyle.precincts.includes(splitPrecinct.id) &&
        ballotStyle.partyId === mammalParty.id &&
        ballotStyle.languages?.includes(LanguageCode.ENGLISH) &&
        split.districtIds.every((d) => ballotStyle.districts.includes(d))
    )?.id
  );

  const nonSplitMammalEnglishBallotStyleId = assertDefined(
    election.ballotStyles.find(
      (ballotStyle) =>
        ballotStyle.precincts.includes(nonSplitPrecinct.id) &&
        ballotStyle.partyId === mammalParty.id &&
        ballotStyle.languages?.includes(LanguageCode.ENGLISH) &&
        nonSplitPrecinct.districtIds.every((d) =>
          ballotStyle.districts.includes(d)
        )
    )?.id
  );

  const ballotPrintCounts: BallotPrintCount[] = [
    {
      precinctId: splitPrecinct.id,
      precinctOrSplitName: split.name,
      ballotStyleId: splitMammalEnglishBallotStyleId,
      languageCode: LanguageCode.ENGLISH,
      absenteeCount: 1,
      precinctCount: 2,
      totalCount: 3,
      partyName: mammalParty.name,
    },
    {
      precinctId: nonSplitPrecinct.id,
      precinctOrSplitName: nonSplitPrecinct.name,
      ballotStyleId: nonSplitMammalEnglishBallotStyleId,
      languageCode: LanguageCode.ENGLISH,
      absenteeCount: 4,
      precinctCount: 5,
      totalCount: 9,
      partyName: mammalParty.name,
    },
  ];

  render(
    <BallotsPrintedReport
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      generatedAtTime={new Date()}
      printCounts={ballotPrintCounts}
      isTestMode
    />
  );

  screen.getByText('Sum Totals');
  screen.getByText('12');
  screen.getByText('7');
  expect(screen.getAllByText('5')).toHaveLength(2);
});

test('renders count columns', () => {
  const electionDefinition =
    electionSimpleSinglePrecinctFixtures.readElectionDefinition();
  const { election } = electionDefinition;
  const precinct = election.precincts[0];
  const ballotStyleId = election.ballotStyles[0].id;

  const ballotPrintCounts: BallotPrintCount[] = [
    {
      precinctId: precinct.id,
      precinctOrSplitName: precinct.name,
      ballotStyleId,
      languageCode: LanguageCode.ENGLISH,
      absenteeCount: 3,
      precinctCount: 5,
      totalCount: 8,
    },
  ];

  render(
    <BallotsPrintedReport
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      generatedAtTime={new Date()}
      printCounts={ballotPrintCounts}
      isTestMode
    />
  );

  screen.getByText('Total');
  screen.getByText('Precinct');
  screen.getByText('Absentee');

  // Row values
  expect(screen.getAllByText('8')).toHaveLength(2);
  expect(screen.getAllByText('5')).toHaveLength(2);
  expect(screen.getAllByText('3')).toHaveLength(2);
});
