import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Admin } from '@votingworks/api';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { typedAs } from '@votingworks/utils';
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

  const transcribeButton = await screen.findByText('Transcribe (8 new)');
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

  userEvent.click(await screen.findByText('Transcribe (8 new)'));

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
  userEvent.click(await screen.findByText('Transcribe (8 new)'));
  userEvent.click(await screen.findByText('Add new +'));
  userEvent.type(
    await screen.findByLabelText('Transcribed Value'),
    'Dark Helmet'
  );
  userEvent.click(await screen.findByText('Save'));
  expect(await screen.findByText('Dark Helmet')).toBeInTheDocument();

  userEvent.click(await screen.findByText('Exit'));

  // adjudicate
  userEvent.click(await screen.findByText('Adjudicate (1 new)'));
  expect(await screen.findAllByText('Dark Helmet')).toHaveLength(2); // 1 in the table, 1 in the adjudication list

  userEvent.selectOptions(
    await screen.findByRole('combobox'),
    'Zebra (official candidate)'
  );

  expect(await screen.findByText('Change')).toBeInTheDocument();
  expect(await screen.findByText('Dark Helmet')).toBeInTheDocument();
  expect(
    await screen.findByText('Zebra (official candidate)')
  ).toBeInTheDocument();

  const summary = await backend.getWriteInSummary({
    contestId: 'zoo-council-mammal',
  });
  const adjudicatedSummaryEntry = summary.find(
    (entry) => entry.transcribedValue === 'Dark Helmet'
  );

  expect(adjudicatedSummaryEntry).toEqual(
    typedAs<Admin.WriteInSummaryEntry>({
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Dark Helmet',
      writeInAdjudication: {
        adjudicatedOptionId: 'zebra',
        adjudicatedValue: 'Zebra (official candidate)',
        contestId: 'zoo-council-mammal',
        id: expect.any(String),
        transcribedValue: 'Dark Helmet',
      },
      writeInCount: 1,
    })
  );
});
