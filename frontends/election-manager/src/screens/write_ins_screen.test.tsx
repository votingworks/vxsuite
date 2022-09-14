import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import fetchMock from 'fetch-mock';
import React from 'react';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ElectionManagerStoreMemoryBackend } from '../lib/backends';
import { WriteInsScreen } from './write_ins_screen';

const TEST_FILE1 = 'cvrs.jsonl';

describe('Write-in Adjudication screen', () => {
  beforeEach(() => {
    fetchMock.mock();
    fetchMock.get('/admin/write-ins/adjudications/contestId/count', [
      { contestId: 'zoo-council-mammal', adjudicationCount: 3 },
    ]);
    fetchMock.get('/admin/write-ins/adjudications/zoo-council-mammal/', [
      { id: '123', contestId: 'zoo-council-mammal' },
      { id: 'abc', contestId: 'zoo-council-mammal' },
      { id: '456', contestId: 'zoo-council-mammal' },
    ]);
    fetchMock.get('express:/admin/write-ins/adjudication/:adjudicationId', {
      id: 'abc',
      contestId: 'zoo-council-mammal',
      transcribedValue: 'Mickey Mouse',
    });
    fetchMock.get('/admin/write-ins/transcribed-values', [
      'Daffy',
      'Mickey Mouse',
      'Minnie',
    ]);
  });

  afterEach(() => {
    fetchMock.restore();
  });

  const { electionDefinition, cvrData } =
    electionMinimalExhaustiveSampleFixtures;
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
      new File([abbreviatedCvrData], TEST_FILE1)
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
      new File([abbreviatedCvrData], TEST_FILE1)
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
});
