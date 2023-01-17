import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { sleep } from '@votingworks/utils';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';
import { WriteInsScreen } from './write_ins_screen';

const { electionDefinition, cvrData } = electionMinimalExhaustiveSampleFixtures;
const abbreviatedCvrData = cvrData.split('\n').slice(0, 20).join('\n');

afterEach(async () => {
  // Several tests on this page create test warnings because hooks run after
  // the end of the test, and there is no specific change on the page to check.
  // TODO: Remove after upgrade to React 18, which does not warn in this case.
  await act(async () => {
    await sleep(1);
  });
});

test('No CVRs loaded', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition,
  });

  renderInAppContext(<WriteInsScreen />, { backend, electionDefinition });
  await screen.findByText(
    'Load CVRs to begin transcribing and adjudicating write-in votes.'
  );
  expect(screen.queryByText('Transcribe')).not.toBeInTheDocument();
});

test('Tally results already marked as official', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition,
  });

  await backend.addCastVoteRecordFile(
    new File([abbreviatedCvrData], 'cvrs.jsonl')
  );

  renderInAppContext(<WriteInsScreen />, {
    backend,
    electionDefinition,
    isOfficialResults: true,
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
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition,
  });
  await backend.addCastVoteRecordFile(
    new File([abbreviatedCvrData], 'cvrs.jsonl')
  );

  renderInAppContext(<WriteInsScreen />, {
    backend,
    electionDefinition,
  });

  const transcribeButton = await screen.findByText('Transcribe 8');
  expect(transcribeButton).not.toBeDisabled();

  const adjudicateButton = await screen.findByText('Adjudicate');
  expect(adjudicateButton).toBeDisabled();
});

test('ballot pagination', async () => {
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition,
  });
  await backend.addCastVoteRecordFile(
    new File([abbreviatedCvrData], 'cvrs.jsonl')
  );

  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    backend,
  });

  const pageCount = 8;
  userEvent.click(await screen.findByText(`Transcribe ${pageCount}`));

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
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
  const backend = new ElectionManagerStoreMemoryBackend({
    electionDefinition,
  });
  await backend.addCastVoteRecordFile(
    new File([abbreviatedCvrData], 'cvrs.jsonl')
  );

  renderInAppContext(<WriteInsScreen />, {
    electionDefinition,
    backend,
  });

  // transcribe
  userEvent.click(await screen.findByText('Transcribe 8'));
  userEvent.type(
    await screen.findByPlaceholderText('transcribed write-in'),
    'Dark Helmet'
  );

  jest.spyOn(backend, 'transcribeWriteIn');
  userEvent.click(await screen.findByText('Add'));
  await waitFor(() => {
    expect(backend.transcribeWriteIn).toHaveBeenCalledWith(
      expect.any(String),
      'Dark Helmet'
    );
  });

  expect(await screen.findByText('Dark Helmet')).toBeInTheDocument();

  userEvent.click(await screen.findByText('Back to All Write-Ins'));

  // set up the table for a single transcribed value
  jest.spyOn(backend, 'getWriteInAdjudicationTable').mockResolvedValue({
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

  userEvent.selectOptions(await screen.findByRole('combobox'), 'Zebra');

  jest.spyOn(backend, 'getWriteInAdjudicationTable').mockResolvedValue({
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
