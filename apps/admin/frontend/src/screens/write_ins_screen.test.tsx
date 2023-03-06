import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { sleep } from '@votingworks/basics';
import React from 'react';
import { Admin } from '@votingworks/api';
import { act, screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsScreen } from './write_ins_screen';
import {
  createMockApiClient,
  MockApiClient,
} from '../../test/helpers/api_mock';

const { electionDefinition } = electionMinimalExhaustiveSampleFixtures;

function getMockPendingWriteInRecord(id: string): Admin.WriteInRecord {
  return {
    id,
    contestId: 'zoo-council-mammal',
    optionId: 'write-in-0',
    castVoteRecordId: 'id',
    status: 'pending',
  };
}

const mockWriteInRecords = [0, 1, 2].map((num) =>
  getMockPendingWriteInRecord(num.toString())
);

afterEach(async () => {
  // Several tests on this page create test warnings because hooks run after
  // the end of the test, and there is no specific change on the page to check.
  // TODO: Remove after upgrade to React 18, which does not warn in this case.
  await act(async () => {
    await sleep(1);
  });
});

let apiClient: MockApiClient;

beforeEach(() => {
  apiClient = createMockApiClient();
});

afterEach(() => {
  apiClient.assertComplete();
});

test('No CVRs loaded', async () => {
  apiClient.getWriteIns.expectCallWith().resolves([]);
  apiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);
  renderInAppContext(<WriteInsScreen />, { electionDefinition, apiClient });
  await screen.findByText(
    'Load CVRs to begin transcribing and adjudicating write-in votes.'
  );
  expect(screen.queryByText('Transcribe')).not.toBeInTheDocument();
});

test('Tally results already marked as official', async () => {
  apiClient.getWriteIns.expectCallWith().resolves([]);
  apiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);
  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    isOfficialResults: true,
    apiClient,
  });

  await screen.findByText(/No further changes may be made/);

  const transcribeButtons = screen.queryAllByText(/Transcribe \d/);
  for (const transcribeButton of transcribeButtons) {
    expect(transcribeButton).toBeDisabled();
  }

  const adjudicateButtons = screen.queryAllByText('Adjudicate');
  for (const adjudicateButton of adjudicateButtons) {
    expect(adjudicateButton).toBeDisabled();
  }
});

test('CVRs with write-ins loaded', async () => {
  apiClient.getWriteIns.expectCallWith().resolves(mockWriteInRecords);
  apiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);
  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiClient,
  });

  const transcribeButton = await screen.findByText('Transcribe 3');
  expect(transcribeButton).not.toBeDisabled();

  const adjudicateButton = await screen.findByText('Adjudicate');
  expect(adjudicateButton).toBeDisabled();
});

test('ballot pagination', async () => {
  apiClient.getWriteIns.expectCallWith().resolves(mockWriteInRecords);
  apiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);

  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiClient,
  });

  const pageCount = 3;
  userEvent.click(await screen.findByText(`Transcribe ${pageCount}`));

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    apiClient.getWriteInImage
      .expectCallWith({ writeInId: mockWriteInRecords[pageNumber - 1].id })
      .resolves([]);
    await screen.findByText(new RegExp(`${pageNumber} of ${pageCount}`));
    const previousButton = await screen.findByText<HTMLButtonElement>(
      'Previous'
    );
    expect(previousButton.disabled).toEqual(pageNumber === 1);

    const nextButton = await screen.findByText<HTMLButtonElement>('Next');
    if (pageNumber === pageCount) {
      expect(nextButton).toBeDisabled();
      const doneButton = await screen.findByText<HTMLButtonElement>(
        'Back to All Write-Ins'
      );
      doneButton.click();
    } else {
      expect(nextButton).not.toBeDisabled();
      nextButton.click();
    }
  }
});

test('adjudication', async () => {
  apiClient.getWriteIns.expectCallWith().resolves(mockWriteInRecords);
  apiClient.getCastVoteRecordFiles.expectCallWith().resolves([]);

  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiClient,
  });

  // transcribe
  apiClient.getWriteInImage
    .expectCallWith({ writeInId: mockWriteInRecords[0].id })
    .resolves([]);
  userEvent.click(await screen.findByText('Transcribe 3'));
  userEvent.type(
    await screen.findByPlaceholderText('transcribed write-in'),
    'Dark Helmet'
  );
  apiClient.transcribeWriteIn
    .expectCallWith({
      writeInId: mockWriteInRecords[0].id,
      transcribedValue: 'Dark Helmet',
    })
    .resolves();
  apiClient.getWriteIns // expecting refetch
    .expectCallWith()
    .resolves([
      mockWriteInRecords[0],
      mockWriteInRecords[1],
      {
        ...mockWriteInRecords[2],
        status: 'transcribed',
        transcribedValue: 'Dark Helmet',
      },
    ]);
  userEvent.click(await screen.findByText('Add'));

  expect(await screen.findByText('Dark Helmet')).toBeInTheDocument();

  userEvent.click(await screen.findByText('Back to All Write-Ins'));

  // set up the table for a single transcribed value
  apiClient.getWriteInAdjudicationTable
    .expectCallWith({ contestId: 'zoo-council-mammal' })
    .resolves({
      contestId: 'zoo-council-mammal',
      writeInCount: 1,
      adjudicated: [],
      transcribed: {
        writeInCount: 1,
        rows: [
          {
            transcribedValue: 'Dark Helmet',
            writeInCount: 1,
            adjudicationOptionGroups: [
              {
                title: 'Official Candidates',
                options: [
                  {
                    adjudicatedValue: 'Zebra',
                    adjudicatedOptionId: 'zebra',
                    enabled: true,
                  },
                ],
              },
              {
                title: 'Original Transcription',
                options: [{ adjudicatedValue: 'Dark Helmet', enabled: true }],
              },
            ],
          },
        ],
      },
    });

  // adjudicate
  userEvent.click(await screen.findByText('Adjudicate 1'));
  expect(await screen.findAllByText('Dark Helmet')).toHaveLength(2); // 1 in the table, 1 in the adjudication list

  apiClient.createWriteInAdjudication
    .expectCallWith({
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Dark Helmet',
      adjudicatedValue: 'Zebra',
      adjudicatedOptionId: 'zebra',
    })
    .resolves('id');
  userEvent.selectOptions(await screen.findByRole('combobox'), 'Zebra');

  // re-fetched data
  apiClient.getWriteIns // expecting refetch
    .expectCallWith()
    .resolves([
      mockWriteInRecords[0],
      mockWriteInRecords[1],
      {
        ...mockWriteInRecords[2],
        status: 'adjudicated',
        transcribedValue: 'Dark Helmet',
        adjudicatedValue: 'Zebra',
      },
    ]);
  apiClient.getWriteInAdjudicationTable
    .expectCallWith({ contestId: 'zoo-council-mammal' })
    .resolves({
      contestId: 'zoo-council-mammal',
      writeInCount: 1,
      adjudicated: [
        {
          adjudicatedValue: 'Zebra',
          adjudicatedOptionId: 'zebra',
          writeInCount: 1,
          rows: [
            {
              transcribedValue: 'Dark Helmet',
              writeInCount: 1,
              writeInAdjudicationId: 'test-id',
              editable: true,
              adjudicationOptionGroups: [
                {
                  title: 'Official Candidates',
                  options: [
                    {
                      adjudicatedValue: 'Zebra',
                      adjudicatedOptionId: 'zebra',
                      enabled: true,
                    },
                  ],
                },
                {
                  title: 'Original Transcription',
                  options: [{ adjudicatedValue: 'Dark Helmet', enabled: true }],
                },
              ],
            },
          ],
        },
      ],
      transcribed: {
        writeInCount: 1,
        rows: [],
      },
    });

  expect(await screen.findByText('Change')).toBeInTheDocument();
  expect(await screen.findByText('Dark Helmet')).toBeInTheDocument();
  expect(
    await screen.findByText('Zebra (official candidate)')
  ).toBeInTheDocument();
});
