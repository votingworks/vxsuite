import { screen } from '@testing-library/react';
import React from 'react';
import { electionMinimalExhaustiveSampleWithDataFiles } from '@votingworks/fixtures';
import { renderInAppContext } from '../../test/render_in_app_context';
import { CastVoteRecordFiles } from '../utils/cast_vote_record_files';
import { WriteInsScreen } from './write_ins_screen';

const TEST_FILE1 = 'cvrs.jsonl';

describe('Write-in Adjudication screen', () => {
  const { electionDefinition, cvrData } =
    electionMinimalExhaustiveSampleWithDataFiles;

  test('No CVRs imported', () => {
    renderInAppContext(<WriteInsScreen />, { electionDefinition });
    screen.getByText('Adjudication can begin once CVRs are imported.');
    expect(
      screen.getAllByText(/Adjudicate write-ins for “City Zoo Council”/)[0]
    ).toBeDisabled();
  });

  test('CVRs with write-ins imported', async () => {
    const mockFiles = CastVoteRecordFiles.empty;
    const added = await mockFiles.addAll(
      [new File([cvrData], TEST_FILE1)],
      electionDefinition.election
    );

    renderInAppContext(<WriteInsScreen />, {
      castVoteRecordFiles: added,
      electionDefinition,
    });

    const adjudicateButton = screen.getByText(
      /Adjudicate 649 write-ins for “City Zoo Council”/
    );
    expect(adjudicateButton).not.toBeDisabled();
    adjudicateButton.click();
    screen.getByText('BALLOT IMAGES GO HERE');
  });
});
