import { screen, waitFor } from '@testing-library/react';
import React from 'react';
import fetchMock from 'fetch-mock';
import { electionMinimalExhaustiveSampleFixtures } from '@votingworks/fixtures';
import { renderInAppContext } from '../../test/render_in_app_context';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';
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

  test('No CVRs loaded', async () => {
    renderInAppContext(<WriteInsScreen />, { electionDefinition });
    await waitFor(() => {
      screen.getByText('Adjudication can begin once CVRs are loaded.');
    });
    expect(
      screen.getAllByText(/Adjudicate write-ins for “City Zoo Council”/)[0]
    ).toBeDisabled();
  });

  test('CVRs with write-ins loaded', async () => {
    const mockFiles = CastVoteRecordFiles.empty;
    const added = await mockFiles.addAll(
      [new File([cvrData], TEST_FILE1)],
      electionDefinition.election
    );

    renderInAppContext(<WriteInsScreen />, {
      castVoteRecordFiles: added,
      electionDefinition,
    });

    renderInAppContext(<WriteInsScreen />, {
      castVoteRecordFiles: added,
      electionDefinition,
    });

    let adjudicateButtons;
    await waitFor(() => {
      adjudicateButtons = screen.getAllByText(
        /Adjudicate 3 write-ins for “City Zoo Council”/
      );
    });
    if (adjudicateButtons) {
      expect(adjudicateButtons[0]).not.toBeDisabled();
    }
  });

  test('ballot pagination', async () => {
    const mockFiles = CastVoteRecordFiles.empty;
    const added = await mockFiles.addAll(
      [new File([cvrData], TEST_FILE1)],
      electionDefinition.election
    );

    renderInAppContext(<WriteInsScreen />, {
      castVoteRecordFiles: added,
      electionDefinition,
    });

    await waitFor(() => {
      screen.getByText(/Adjudicate 3 write-ins for “City Zoo Council”/).click();
    });

    const previousButton = screen.getByText('Previous');
    const nextButton = screen.getByText('Next');

    screen.getByText(/1 of 3/);
    expect(previousButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    while (nextButton) {
      try {
        expect(nextButton).not.toBeDisabled();
        nextButton.click();
      } catch {
        screen.getByText(/3 of 3/);
        expect(previousButton).not.toBeDisabled();
        expect(nextButton).toBeDisabled();
        break;
      }
    }
  });
});
