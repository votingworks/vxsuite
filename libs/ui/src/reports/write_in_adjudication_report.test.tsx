import {
  electionFamousNames2021Fixtures,
  electionMinimalExhaustiveSampleDefinition,
} from '@votingworks/fixtures';
import { render, screen, within } from '../../test/react_testing_library';
import { WriteInAdjudicationReport } from './write_in_adjudication_report';

test('primary', () => {
  const { election } = electionMinimalExhaustiveSampleDefinition;

  render(
    <WriteInAdjudicationReport
      election={election}
      electionWriteInSummary={{
        contestWriteInSummaries: {
          'zoo-council-mammal': {
            contestId: 'zoo-council-mammal',
            totalTally: 40,
            pendingTally: 11,
            invalidTally: 7,
            candidateTallies: {
              zebra: {
                id: 'zebra',
                name: 'Zebra',
                tally: 17,
              },
              rapidash: {
                id: 'rapidash',
                name: 'Rapidash',
                tally: 5,
                isWriteIn: true,
              },
            },
          },
        },
      }}
      isOfficialResults
      generatedAtTime={new Date('2020-10-01')}
    />
  );

  // mammal section
  const mammalSection = screen.getByTestId('write-in-tally-report-0');
  within(mammalSection).getByText(
    'Official Mammal Party Example Primary Election Write-In Adjudication Report'
  );
  within(mammalSection).getByText(
    'Wednesday, September 8, 2021, Sample County, State of Sample'
  );
  within(mammalSection).getByText(
    'This report was created on Thursday, October 1, 2020 at 12:00:00 AM UTC.'
  );

  // should have contest information for the one contest only
  const zooCouncilMammal = within(mammalSection).getByTestId(
    'results-table-zoo-council-mammal'
  );
  expect(
    within(zooCouncilMammal).getByText('Zebra').closest('tr')!
  ).toHaveTextContent('17');
  expect(within(mammalSection).getAllByTestId(/results-table/)).toHaveLength(1);

  // fish section
  const fishSection = screen.getByTestId('write-in-tally-report-1');
  within(fishSection).getByText(
    'Official Fish Party Example Primary Election Write-In Adjudication Report'
  );

  // should just list that the contest has no write-ins
  const zeroList = within(fishSection)
    .getByText('Contests With No Write-Ins')
    .closest('div')!;
  within(zeroList).getByText('Zoo Council');
  expect(within(fishSection).queryAllByTestId(/results-table/)).toHaveLength(0);

  // no other sections
  expect(screen.getAllByTestId(/write-in-tally-report-/)).toHaveLength(2);
});

test('general', () => {
  const { election } = electionFamousNames2021Fixtures;
  render(
    <WriteInAdjudicationReport
      election={election}
      electionWriteInSummary={{ contestWriteInSummaries: {} }}
      isOfficialResults={false}
      generatedAtTime={new Date('2020-10-01')}
    />
  );

  screen.getByText(
    'Unofficial Lincoln Municipal General Election Write-In Adjudication Report'
  );

  // one section, no other sections
  screen.getByTestId('write-in-tally-report-none');
  expect(screen.getAllByTestId(/write-in-tally-report-/)).toHaveLength(1);

  // all contests are in the no contest list
  const zeroList = screen
    .getByText('Contests With No Write-Ins')
    .closest('div')!;
  for (const contest of election.contests) {
    within(zeroList).getByText(contest.title);
  }
});
