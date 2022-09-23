import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';
import { WriteInsScreen } from './write_ins_screen';

const { electionDefinition, cvrData } = electionMinimalExhaustiveSampleFixtures;
const abbreviatedCvrData = cvrData.split('\n').slice(0, 20).join('\n');

test('No CVRs loaded', async () => {
  renderInAppContext(<WriteInsScreen />, { electionDefinition });
  await screen.findByText(
    'Load CVRs to begin transcribing and adjudicating write-in votes.'
  );
  expect((await screen.findAllByText('Transcribe'))[0]).toBeDisabled();
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

  userEvent.click(await screen.findByText('Transcribe 8'));

  const previousButton = await screen.findByText('Previous');
  const nextButton = await screen.findByText('Next');

  screen.getByText(/1 of 8/);
  expect(previousButton).toBeDisabled();
  expect(nextButton).not.toBeDisabled();

  while (nextButton) {
    try {
      expect(nextButton).not.toBeDisabled();
      nextButton.click();
    } catch {
      screen.getByText(/8 of 8/);
      expect(previousButton).not.toBeDisabled();
      expect(nextButton).toBeDisabled();
      break;
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
  userEvent.click(await screen.findByText('Add new +'));
  userEvent.type(
    await screen.findByLabelText('Transcribed Value'),
    'Dark Helmet'
  );

  jest.spyOn(backend, 'transcribeWriteIn');
  userEvent.click(await screen.findByText('Save'));
  await waitFor(() => {
    expect(backend.transcribeWriteIn).toHaveBeenCalledWith(
      expect.any(String),
      'Dark Helmet'
    );
  });

  expect(await screen.findByText('Dark Helmet')).toBeInTheDocument();

  userEvent.click(await screen.findByText('Exit'));

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
