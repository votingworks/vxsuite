import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { sleep } from '@votingworks/basics';
import React from 'react';
import { Admin } from '@votingworks/api';
import { act, screen } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInsScreen } from './write_ins_screen';
import { ApiMock, createApiMock } from '../../test/helpers/api_mock';

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

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

test('No CVRs loaded', async () => {
  apiMock.expectGetWriteIns([]);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<WriteInsScreen />, { electionDefinition, apiMock });
  await screen.findByText(
    'Load CVRs to begin transcribing and adjudicating write-in votes.'
  );
  expect(screen.queryByText('Transcribe')).not.toBeInTheDocument();
});

test('Tally results already marked as official', async () => {
  apiMock.expectGetWriteIns([
    {
      id: '1',
      contestId: 'zoo-council-mammal',
      optionId: 'write-in-0',
      castVoteRecordId: '1',
      status: 'pending',
    },
    {
      id: '2',
      contestId: 'aquarium-council-fish',
      optionId: 'write-in-0',
      castVoteRecordId: '2',
      status: 'transcribed',
      transcribedValue: 'Seahorse',
    },
  ]);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    isOfficialResults: true,
    apiMock,
  });

  await screen.findByText(/No further changes may be made/);

  const transcribeButtons = await screen.findAllButtons(/Transcribe \d/);
  for (const transcribeButton of transcribeButtons) {
    expect(transcribeButton).toBeDisabled();
  }

  const adjudicateButtons = screen.getAllButtons('Adjudicate');
  for (const adjudicateButton of adjudicateButtons) {
    expect(adjudicateButton).toBeDisabled();
  }
});

test('CVRs with write-ins loaded', async () => {
  apiMock.expectGetWriteIns(mockWriteInRecords);
  apiMock.expectGetCastVoteRecordFiles([]);
  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiMock,
  });

  const transcribeButton = await screen.findButton('Transcribe 3');
  expect(transcribeButton).not.toBeDisabled();

  const adjudicateButton = await screen.findButton('Adjudicate');
  expect(adjudicateButton).toBeDisabled();
});

test('ballot pagination', async () => {
  apiMock.expectGetWriteIns(mockWriteInRecords);
  apiMock.expectGetCastVoteRecordFiles([]);

  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiMock,
  });

  const pageCount = 3;
  for (const mockWriteInRecord of mockWriteInRecords) {
    apiMock.expectGetWriteInImageView(mockWriteInRecord.id);
  }

  userEvent.click(await screen.findByText(`Transcribe ${pageCount}`));

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    await screen.findByText(new RegExp(`${pageNumber} of ${pageCount}`));
    const previousButton = await screen.findButton('Previous');
    if (pageNumber === 1) {
      expect(previousButton).toBeDisabled();
    } else {
      expect(previousButton).not.toBeDisabled();
    }

    const nextButton = await screen.findButton('Next');
    if (pageNumber === pageCount) {
      expect(nextButton).toBeDisabled();
      const doneButton = await screen.findButton('Back to All Write-Ins');
      doneButton.click();
    } else {
      expect(nextButton).not.toBeDisabled();
      nextButton.click();
    }
  }
});

test('adjudication', async () => {
  apiMock.expectGetWriteIns(mockWriteInRecords);
  apiMock.expectGetCastVoteRecordFiles([]);

  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    apiMock,
  });

  // transcribe
  apiMock.expectGetWriteInImageView(mockWriteInRecords[0].id);
  apiMock.expectGetWriteInImageView(mockWriteInRecords[1].id); // prefetch
  userEvent.click(await screen.findByText('Transcribe 3'));
  userEvent.type(
    await screen.findByPlaceholderText('transcribed write-in'),
    'Dark Helmet'
  );
  apiMock.apiClient.transcribeWriteIn
    .expectCallWith({
      writeInId: mockWriteInRecords[0].id,
      transcribedValue: 'Dark Helmet',
    })
    .resolves();
  apiMock.expectGetWriteIns([
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
  apiMock.apiClient.getWriteInAdjudicationTable
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

  apiMock.apiClient.createWriteInAdjudication
    .expectCallWith({
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Dark Helmet',
      adjudicatedValue: 'Zebra',
      adjudicatedOptionId: 'zebra',
    })
    .resolves('id');
  userEvent.selectOptions(await screen.findByRole('combobox'), 'Zebra');

  // re-fetched data
  apiMock.expectGetWriteIns([
    mockWriteInRecords[0],
    mockWriteInRecords[1],
    {
      ...mockWriteInRecords[2],
      status: 'adjudicated',
      transcribedValue: 'Dark Helmet',
      adjudicatedValue: 'Zebra',
    },
  ]);
  apiMock.apiClient.getWriteInAdjudicationTable
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
