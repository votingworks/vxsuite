import {
  electionFamousNames2021Fixtures,
  readElectionTwoPartyPrimaryDefinition,
} from '@votingworks/fixtures';
import { hasTextAcrossElements } from '@votingworks/test-utils';
import { formatElectionHashes } from '@votingworks/types';
import { render, screen, within } from '../../test/react_testing_library';
import { WriteInAdjudicationReport } from './write_in_adjudication_report';

const electionTwoPartyPrimaryDefinition =
  readElectionTwoPartyPrimaryDefinition();

test('primary', () => {
  const electionDefinition = electionTwoPartyPrimaryDefinition;
  render(
    <WriteInAdjudicationReport
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
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
      isOfficial
      isTest={false}
      generatedAtTime={new Date(2020, 0, 1, 0, 0, 0)}
    />
  );

  expect(screen.queryByText('Test Report')).not.toBeInTheDocument();

  // mammal section
  const mammalSection = screen.getByTestId('write-in-tally-report-0');
  within(mammalSection).getByText('Official Write‑In Adjudication Report');
  within(mammalSection).getByText('Mammal Party');
  within(mammalSection).getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  within(mammalSection).getByText(
    hasTextAcrossElements('Report Generated: Jan 1, 2020, 12:00 AM')
  );
  within(mammalSection).getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
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
  within(fishSection).getByText('Official Write‑In Adjudication Report');
  within(fishSection).getByText('Fish Party');
  within(fishSection).getByText(
    'Example Primary Election, Sep 8, 2021, Sample County, State of Sample'
  );
  within(fishSection).getByText(
    hasTextAcrossElements('Report Generated: Jan 1, 2020, 12:00 AM')
  );
  within(fishSection).getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );

  // should just one empty contest
  const zooCouncilFish = within(fishSection)
    .getByTestId('results-table-aquarium-council-fish')
    .closest('div')!;
  within(zooCouncilFish).getByText('Zoo Council');
  within(zooCouncilFish).getByText(
    hasTextAcrossElements('0 total write-ins / 0 not adjudicated')
  );
  expect(within(fishSection).queryAllByTestId(/results-table/)).toHaveLength(1);

  // no other sections
  expect(screen.getAllByTestId(/write-in-tally-report-/)).toHaveLength(2);
});

test('general', () => {
  const electionDefinition =
    electionFamousNames2021Fixtures.readElectionDefinition();
  const { election } = electionDefinition;
  render(
    <WriteInAdjudicationReport
      electionDefinition={electionDefinition}
      electionPackageHash="test-election-package-hash"
      electionWriteInSummary={{ contestWriteInSummaries: {} }}
      isOfficial={false}
      isTest
      generatedAtTime={new Date('2020-10-01')}
    />
  );

  screen.getByText('Test Report');
  screen.getByText('Unofficial Write‑In Adjudication Report');
  screen.getByText(
    'Lincoln Municipal General Election, Jun 6, 2021, Franklin County, State of Hamilton'
  );
  screen.getByText(
    hasTextAcrossElements('Report Generated: Sep 30, 2020, 4:00 PM')
  );
  screen.getByText(
    hasTextAcrossElements(
      `Election ID: ${formatElectionHashes(
        electionDefinition.ballotHash,
        'test-election-package-hash'
      )}`
    )
  );

  // one section, no other sections
  screen.getByTestId('write-in-tally-report-none');
  expect(screen.getAllByTestId(/write-in-tally-report-/)).toHaveLength(1);

  // all contests should be listed with 0 write-ins
  expect(screen.queryAllByTestId(/results-table/)).toHaveLength(
    election.contests.length
  );

  for (const contest of election.contests) {
    const contestTable = screen.getByTestId(`results-table-${contest.id}`);
    within(contestTable).getByText(contest.title);
    within(contestTable).getByText(
      hasTextAcrossElements('0 total write-ins / 0 not adjudicated')
    );
  }
});
