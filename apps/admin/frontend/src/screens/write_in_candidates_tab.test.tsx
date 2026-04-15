import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { electionTwoPartyPrimaryFixtures } from '@votingworks/fixtures';
import userEvent from '@testing-library/user-event';
import type { QualifiedWriteInCandidateRecord } from '@votingworks/admin-backend';
import { Election } from '@votingworks/types';
import { screen, within, waitFor } from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { WriteInCandidatesTab } from './write_in_candidates_tab';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderTab() {
  return renderInAppContext(<WriteInCandidatesTab />, {
    apiMock,
  });
}

function expectGetQualifiedWriteInCandidates(
  candidates: QualifiedWriteInCandidateRecord[] = []
) {
  apiMock.apiClient.getQualifiedWriteInCandidates
    .expectRepeatedCallsWith()
    .resolves(candidates);
}

const contestId = '775020876';

describe('contest list', () => {
  test('shows all candidate contests that allow write-ins', () => {
    expectGetQualifiedWriteInCandidates();
    renderTab();

    screen.getByText('President');
    screen.getByText(/Senate/);
  });

  test('selecting a contest shows its candidates', async () => {
    expectGetQualifiedWriteInCandidates([
      {
        id: 'candidate-1',
        electionId: 'test',
        contestId: '775020877',
        name: 'Nemo',
        hasAdjudicatedVotes: false,
      },
    ]);
    renderTab();

    // Initially shows first contest (President) which has no candidates
    await screen.findByText(/You have not added any write-in candidates/);

    // Click on Senate
    userEvent.click(screen.getByText(/Senate/));

    // Should show Nemo
    await screen.findByDisplayValue('Nemo');
  });

  test('shows party name for primary elections', () => {
    const primaryElectionDefinition =
      electionTwoPartyPrimaryFixtures.readElectionDefinition();
    expectGetQualifiedWriteInCandidates();
    renderInAppContext(<WriteInCandidatesTab />, {
      electionDefinition: primaryElectionDefinition,
      apiMock,
    });

    screen.getByText('Mammal Party');
  });

  test('shows callout when no contests allow write-ins', () => {
    const electionDefinition =
      electionTwoPartyPrimaryFixtures.readElectionDefinition();
    // Modify all contests to disallow write-ins
    const election: Election = {
      ...electionDefinition.election,
      contests: electionDefinition.election.contests.map((c) =>
        c.type === 'candidate' ? { ...c, allowWriteIns: false } : c
      ),
    };
    renderInAppContext(<WriteInCandidatesTab />, {
      electionDefinition: { ...electionDefinition, election },
      apiMock,
    });

    screen.getByText('No contests in this election allow write-in candidates.');
  });
});

describe('view mode', () => {
  test('shows empty state callout when no candidates', async () => {
    expectGetQualifiedWriteInCandidates();
    renderTab();

    await screen.findByText(/You have not added any write-in candidates/);
    expect(
      screen.getByRole('button', { name: 'Edit Candidates' })
    ).toBeDisabled();
  });

  test('shows candidates as read-only inputs', async () => {
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'test',
        contestId,
        name: 'Alice',
        hasAdjudicatedVotes: false,
      },
      {
        id: 'c2',
        electionId: 'test',
        contestId,
        name: 'Bob',
        hasAdjudicatedVotes: false,
      },
    ]);
    renderTab();

    const aliceInput = await screen.findByDisplayValue('Alice');
    expect(aliceInput).toBeDisabled();
    const bobInput = screen.getByDisplayValue('Bob');
    expect(bobInput).toBeDisabled();

    expect(
      screen.getByRole('button', { name: 'Edit Candidates' })
    ).toBeEnabled();
  });
});

describe('edit mode', () => {
  test('Add Candidate enters edit mode with an empty input', () => {
    expectGetQualifiedWriteInCandidates();
    renderTab();

    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));

    // Should be in edit mode with Cancel and Save buttons
    screen.getByRole('button', { name: 'Cancel' });
    screen.getByRole('button', { name: 'Save' });
    // Empty input should be present
    expect(screen.getByRole('textbox')).toHaveValue('');
  });

  test('Edit Candidates enters edit mode with existing candidates', async () => {
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'test',
        contestId,
        name: 'Alice',
        hasAdjudicatedVotes: false,
      },
    ]);
    renderTab();

    userEvent.click(
      await screen.findByRole('button', { name: 'Edit Candidates' })
    );

    // Alice should now be in an editable input
    const aliceInput = screen.getByDisplayValue('Alice');
    expect(aliceInput).not.toBeDisabled();
    // Delete button should be visible
    screen.getByRole('button', { name: 'Delete Alice' });
  });

  test('Cancel reverts to view mode', async () => {
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'test',
        contestId,
        name: 'Alice',
        hasAdjudicatedVotes: false,
      },
    ]);
    renderTab();

    userEvent.click(
      await screen.findByRole('button', { name: 'Edit Candidates' })
    );
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    // Back to view mode
    screen.getByRole('button', { name: 'Edit Candidates' });
    expect(screen.getByDisplayValue('Alice')).toBeDisabled();
  });

  test('Add Candidate is disabled when an empty input exists', () => {
    expectGetQualifiedWriteInCandidates();
    renderTab();

    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));

    // Button should be disabled since there's an empty input
    expect(
      screen.getByRole('button', { name: 'Add Candidate' })
    ).toBeDisabled();
  });

  test('saving new candidates calls batch update', async () => {
    expectGetQualifiedWriteInCandidates();
    renderTab();

    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));
    userEvent.type(screen.getByRole('textbox'), 'Alice');

    apiMock.apiClient.updateQualifiedWriteInCandidates
      .expectCallWith({
        newCandidates: [{ contestId, name: 'Alice' }],
        deletedCandidateIds: [],
      })
      .resolves({ affectedBallotCount: 0 });

    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      // Should exit edit mode on success
      screen.getByRole('button', { name: 'Add Candidate' });
    });
  });

  test('deleting a candidate without adjudicated votes removes it immediately', async () => {
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'test',
        contestId,
        name: 'Alice',
        hasAdjudicatedVotes: false,
      },
    ]);
    renderTab();

    userEvent.click(
      await screen.findByRole('button', { name: 'Edit Candidates' })
    );
    userEvent.click(screen.getByRole('button', { name: 'Delete Alice' }));

    // Alice should be removed from the list
    expect(screen.queryByDisplayValue('Alice')).not.toBeInTheDocument();
  });

  test('deleting a candidate with adjudicated votes shows confirmation modal', async () => {
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'test',
        contestId,
        name: 'Alice',
        hasAdjudicatedVotes: true,
      },
    ]);
    renderTab();

    userEvent.click(
      await screen.findByRole('button', { name: 'Edit Candidates' })
    );
    userEvent.click(screen.getByRole('button', { name: 'Delete Alice' }));

    // Modal should appear
    const modal = screen.getByRole('alertdialog');
    within(modal).getByText('Delete Write-In Candidate');
    within(modal).getByText(/Votes have already been adjudicated/);

    // Confirm deletion
    userEvent.click(
      within(modal).getByRole('button', { name: 'Delete Candidate' })
    );

    // Alice should be removed from the list
    expect(screen.queryByDisplayValue('Alice')).not.toBeInTheDocument();
  });

  test('canceling delete modal keeps the candidate', async () => {
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'test',
        contestId,
        name: 'Alice',
        hasAdjudicatedVotes: true,
      },
    ]);
    renderTab();

    userEvent.click(
      await screen.findByRole('button', { name: 'Edit Candidates' })
    );
    userEvent.click(screen.getByRole('button', { name: 'Delete Alice' }));

    const modal = screen.getByRole('alertdialog');
    userEvent.click(within(modal).getByRole('button', { name: 'Cancel' }));

    // Alice should still be in the list
    screen.getByDisplayValue('Alice');
  });
});

describe('validation', () => {
  test('shows error for duplicate candidate names', () => {
    expectGetQualifiedWriteInCandidates();
    renderTab();

    // Add two candidates with the same name
    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));
    userEvent.type(screen.getAllByRole('textbox')[0], 'Alice');

    // Need to enable the add button by filling in the first input
    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));
    userEvent.type(screen.getAllByRole('textbox')[1], 'Alice');

    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    screen.getByText('There is already a candidate with the same name.');
  });

  test('shows error when renaming a candidate with adjudicated votes', async () => {
    expectGetQualifiedWriteInCandidates([
      {
        id: 'c1',
        electionId: 'test',
        contestId,
        name: 'Alice',
        hasAdjudicatedVotes: true,
      },
    ]);
    renderTab();

    userEvent.click(
      await screen.findByRole('button', { name: 'Edit Candidates' })
    );

    const input = screen.getByDisplayValue('Alice');
    userEvent.clear(input);
    userEvent.type(input, 'Alicia');

    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    screen.getByText(
      /This candidate has adjudicated votes, so its name cannot be changed/
    );
  });

  test('editing a field clears its error', () => {
    expectGetQualifiedWriteInCandidates();
    renderTab();

    // Create duplicate
    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));
    userEvent.type(screen.getAllByRole('textbox')[0], 'Alice');
    userEvent.click(screen.getByRole('button', { name: 'Add Candidate' }));
    userEvent.type(screen.getAllByRole('textbox')[1], 'Alice');

    userEvent.click(screen.getByRole('button', { name: 'Save' }));
    screen.getByText('There is already a candidate with the same name.');

    // Edit the second input to fix the duplicate
    userEvent.clear(screen.getAllByRole('textbox')[1]);
    userEvent.type(screen.getAllByRole('textbox')[1], 'Bob');

    expect(
      screen.queryByText('There is already a candidate with the same name.')
    ).not.toBeInTheDocument();
  });
});
