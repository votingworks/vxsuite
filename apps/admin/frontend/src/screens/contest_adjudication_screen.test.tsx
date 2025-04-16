import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { readElectionTwoPartyPrimaryDefinition } from '@votingworks/fixtures';
import { ContestId, ContestOptionId } from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router-dom';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  WriteInCandidateRecord,
  WriteInRecord,
} from '@votingworks/admin-backend';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import {
  RenderInAppContextParams,
  renderInAppContext,
} from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ContestAdjudicationScreen } from './contest_adjudication_screen';

const electionDefinition = readElectionTwoPartyPrimaryDefinition();
const electionId = electionDefinition.election.id;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
});

afterEach(() => {
  apiMock.assertComplete();
});

function renderScreen(
  contestId: ContestId,
  appContextParams: RenderInAppContextParams = {}
) {
  return renderInAppContext(
    <Route path="/contest/adjudication/:contestId">
      <ContestAdjudicationScreen />
    </Route>,
    {
      route: `/contest/adjudication/${contestId}`,
      ...appContextParams,
    }
  );
}

function getDropdownItemByLabel(label: string) {
  return screen
    .getAllByText(label)
    .find((el) => el.getAttribute('aria-disabled') === 'false');
}

function getButtonByName(name: string) {
  return screen.getByRole('button', { name: new RegExp(name, 'i') });
}

function getCheckboxByName(name: string) {
  return screen.getByRole('checkbox', { name: new RegExp(name, 'i') });
}

function formAdjudicatedCvrContest(
  cvrId: string,
  overrides: Record<ContestOptionId, AdjudicatedContestOption>
): AdjudicatedCvrContest {
  return {
    adjudicatedContestOptionById: {
      kangaroo: { type: 'candidate-option', hasVote: false },
      elephant: { type: 'candidate-option', hasVote: false },
      lion: { type: 'candidate-option', hasVote: false },
      zebra: { type: 'candidate-option', hasVote: false },
      'write-in-0': { type: 'write-in-option', hasVote: false },
      'write-in-1': { type: 'write-in-option', hasVote: false },
      'write-in-2': { type: 'write-in-option', hasVote: false },
      ...overrides,
    },
    cvrId,
    contestId: 'zoo-council-mammal',
    side: 'front',
  };
}

describe('vote adjudication', () => {
  test('hmpb ballot can have votes adjudicated', async () => {
    const contestId = 'zoo-council-mammal';
    const cvrIds = ['id-174', 'id-175'];
    const cvrId = cvrIds[0];
    const cvrId2 = cvrIds[1];

    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId },
      { [contestId]: ['kangaroo'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, []);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, false);
    apiMock.expectGetCvrContestWriteInImageViews(
      { contestId, cvrId: cvrId2 },
      false
    );
    apiMock.expectGetWriteInCandidates([], contestId);

    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    const kangarooCheckbox = screen.getByRole('checkbox', {
      name: /kangaroo/i,
    });
    const elephantCheckbox = screen.getByRole('checkbox', {
      name: /elephant/i,
    });
    const zebraCheckbox = screen.getByRole('checkbox', {
      name: /zebra/i,
    });
    const lionCheckbox = screen.getByRole('checkbox', {
      name: /lion/i,
    });

    // check caption and overvote labels for vote adjudications from false to true; disappear when undone
    expect(elephantCheckbox).not.toBeChecked();
    expect(screen.queryByText(/undetected mark/i)).toBeNull();
    userEvent.click(elephantCheckbox);
    expect(elephantCheckbox).toBeChecked();
    expect(screen.queryByText(/undetected mark/i)).toBeInTheDocument();

    expect(screen.queryByText(/overvote/i)).toBeNull();
    userEvent.click(zebraCheckbox);
    userEvent.click(lionCheckbox);
    expect(screen.queryByText(/overvote/i)).toBeInTheDocument();
    userEvent.click(zebraCheckbox);
    userEvent.click(lionCheckbox);
    expect(screen.queryByText(/overvote/i)).toBeNull();

    userEvent.click(elephantCheckbox);
    expect(elephantCheckbox).not.toBeChecked();
    expect(screen.queryByText(/undetected mark/i)).toBeNull();

    // check caption for vote adjudication from true to false; disappear when undone
    expect(kangarooCheckbox).toBeChecked();
    expect(screen.queryByText(/invalid mark/i)).toBeNull();

    userEvent.click(kangarooCheckbox);
    expect(kangarooCheckbox).not.toBeChecked();
    expect(screen.queryByText(/invalid mark/i)).toBeInTheDocument();

    userEvent.click(kangarooCheckbox);
    expect(kangarooCheckbox).toBeChecked();
    expect(screen.queryByText(/invalid mark/i)).toBeNull();
  });

  test('bmd ballots cannot have votes adjudicated', async () => {
    const contestId = 'aquarium-council-fish';
    const cvrIds = ['id-174'];
    const cvrId = cvrIds[0];

    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId },
      { [contestId]: ['rockfish'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, []);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, true);
    apiMock.expectGetWriteInCandidates([], contestId);

    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    const ballotImage = await screen.findByRole('img', {
      name: /full ballot/i,
    });
    expect(ballotImage).toHaveAttribute('src', 'mock-image-data-id-174-0');
    const rockfishCheckbox = screen.getByRole('checkbox', {
      name: /rockfish/i,
    });
    const pufferfishCheckbox = screen.getByRole('checkbox', {
      name: /pufferfish/i,
    });
    const writeInCheckboxes = screen.getAllByRole('checkbox', {
      name: /write-in/i,
    });
    const firstWriteInCheckbox = writeInCheckboxes[0];

    expect(rockfishCheckbox).toBeChecked();
    expect(rockfishCheckbox).toBeDisabled();
    expect(pufferfishCheckbox).not.toBeChecked();
    expect(pufferfishCheckbox).toBeDisabled();
    expect(firstWriteInCheckbox).not.toBeChecked();
    expect(firstWriteInCheckbox).toBeDisabled();
  });
});

describe('ballot image viewer', () => {
  test('hmpb ballot is zoomable', async () => {
    const contestId = 'zoo-council-mammal';
    const cvrIds = ['id-174', 'id-175'];
    const cvrId = cvrIds[0];
    const cvrId2 = cvrIds[1];

    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId },
      { [contestId]: ['kangaroo'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, []);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, false);
    // Prefetch
    apiMock.expectGetCvrContestWriteInImageViews(
      { contestId, cvrId: cvrId2 },
      false
    );
    apiMock.expectGetWriteInCandidates([], contestId);

    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    let ballotImage = await screen.findByRole('img', {
      name: /ballot with section highlighted/i,
    });
    expect(ballotImage).toHaveAttribute('src', 'mock-image-data-id-174-0');

    // Initially zoomed in to show the contest
    const expectedZoomedInWidth =
      1000 * // Starting ballot image width
      (100 / 60) * // Scaled based on write-in area size
      0.5; // Scaled based on exported image resizing
    expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });
    let zoomButton = screen.getButton(/Zoom Out/);
    expect(zoomButton).toBeEnabled();

    // Zoom out to show the entire ballot
    userEvent.click(zoomButton);
    ballotImage = screen.getByRole('img', {
      name: /full ballot/i,
    });
    expect(ballotImage).toHaveStyle({ width: '100%' });
    expect(zoomButton).toBeEnabled();
    expect(zoomButton).toHaveTextContent(/Zoom In/);

    // Zoom back in
    userEvent.click(zoomButton);
    ballotImage = screen.getByRole('img', {
      name: /ballot with section highlighted/i,
    });
    expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });

    // Zoom back out
    userEvent.click(zoomButton);
    ballotImage = screen.getByRole('img', {
      name: /full ballot/i,
    });
    expect(ballotImage).toHaveStyle({ width: '100%' });

    // When scrolling to next cvr, resets to zoomed in
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId: cvrId2 },
      { [contestId]: ['kangaroo'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId: cvrId2 }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId: cvrId2 }, []);

    userEvent.click(screen.getButton(/Skip/));
    await screen.findByTestId('transcribe:id-175');
    ballotImage = await screen.findByRole('img', {
      name: /ballot with section highlighted/i,
    });
    expect(ballotImage).toHaveAttribute('src', 'mock-image-data-id-175-0');
    expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });

    // Zoom out
    zoomButton = screen.getButton(/Zoom Out/);
    userEvent.click(zoomButton);
    ballotImage = screen.getByRole('img', {
      name: /full ballot/i,
    });
    expect(ballotImage).toHaveStyle({ width: '100%' });

    // When switching to previous adjudication, resets to zoomed in
    userEvent.click(screen.getButton(/Back/));
    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    ballotImage = await screen.findByRole('img', {
      name: /ballot with section highlighted/i,
    });
    expect(ballotImage).toHaveStyle({ width: `${expectedZoomedInWidth}px` });
  });

  test('bmd ballot is not zoomable', async () => {
    const contestId = 'zoo-council-mammal';
    const cvrIds = ['id-174', 'id-175'];
    const cvrId = cvrIds[0];
    const cvrId2 = cvrIds[1];

    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId },
      { [contestId]: ['kangaroo'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, []);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, true);
    // Prefetch
    apiMock.expectGetCvrContestWriteInImageViews(
      { contestId, cvrId: cvrId2 },
      true
    );
    apiMock.expectGetWriteInCandidates([], contestId);

    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    let ballotImage = await screen.findByRole('img', {
      name: /Full ballot/i,
    });

    // Fully zoomed out
    expect(ballotImage).toHaveAttribute('src', 'mock-image-data-id-174-0');
    expect(ballotImage).toHaveStyle({ width: `100%` });

    // There should be no zoom buttons
    expect(screen.queryByText(/Zoom/)).toBeNull();

    // When switching to next adjudication, ballot image changes
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId: cvrId2 },
      { [contestId]: ['kangaroo'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId: cvrId2 }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId: cvrId2 }, []);
    userEvent.click(screen.getButton(/Skip/));

    await screen.findByTestId('transcribe:id-175');
    ballotImage = await screen.findByRole('img', {
      name: /Full ballot/i,
    });
    expect(ballotImage).toHaveAttribute('src', 'mock-image-data-id-175-0');
    expect(ballotImage).toHaveStyle({ width: `100%` });
  });
});

describe('detect unsaved changes', () => {
  const contestId = 'zoo-council-mammal';
  const cvrIds = ['id-174', 'id-175'];
  const cvrId = cvrIds[0];
  const cvrId2 = cvrIds[1];
  const writeIn0Id = 'write-in-0';
  const writeInRecord: WriteInRecord = {
    status: 'pending',
    id: '1',
    cvrId,
    contestId,
    electionId,
    optionId: writeIn0Id,
  };
  const votes = ['kangaroo', 'write-in-0'];

  beforeEach(() => {
    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo({ cvrId }, { [contestId]: votes });
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, [writeInRecord]);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, false);
    apiMock.expectGetCvrContestWriteInImageViews(
      { contestId, cvrId: cvrId2 },
      false
    );
    apiMock.expectGetWriteInCandidates([], contestId);
  });

  test('unsaved changes are detected when using the close button', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();

    let elephantCheckbox = getCheckboxByName('elephant');
    expect(elephantCheckbox).not.toBeChecked();

    userEvent.click(elephantCheckbox);
    elephantCheckbox = getCheckboxByName('elephant');
    expect(elephantCheckbox).toBeChecked();

    const closeButton = getButtonByName('close');
    userEvent.click(closeButton);

    let modal = await screen.findByRole('alertdialog');
    const modalBackButton = within(modal).getByRole('button', {
      name: /back/i,
    });
    userEvent.click(modalBackButton);
    expect(elephantCheckbox).toBeChecked();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    userEvent.click(closeButton);
    modal = await screen.findByRole('alertdialog');
    const modalDiscardButton = within(modal).getByRole('button', {
      name: /discard changes/i,
    });
    userEvent.click(modalDiscardButton);

    await waitFor(() => {
      expect(screen.queryByTestId('transcribe:id-174')).not.toBeInTheDocument();
    });
  });

  test('unsaved changes are detected when using the back button', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();

    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId: cvrId2 },
      { [contestId]: ['kangaroo'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId: cvrId2 }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId: cvrId2 }, []);
    const skipButton = screen.getByRole('button', { name: /skip/i });
    userEvent.click(skipButton);

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-175')).toBeInTheDocument();

    let elephantCheckbox = getCheckboxByName('elephant');
    expect(elephantCheckbox).not.toBeChecked();

    userEvent.click(elephantCheckbox);
    elephantCheckbox = getCheckboxByName('elephant');
    expect(elephantCheckbox).toBeChecked();

    const backButton = getButtonByName('back');
    userEvent.click(backButton);

    let modal = await screen.findByRole('alertdialog');
    const modalBackButton = within(modal).getByRole('button', {
      name: /back/i,
    });
    userEvent.click(modalBackButton);
    expect(elephantCheckbox).toBeChecked();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    userEvent.click(backButton);
    modal = await screen.findByRole('alertdialog');
    const modalDiscardButton = within(modal).getByRole('button', {
      name: /discard changes/i,
    });
    userEvent.click(modalDiscardButton);
    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
  });

  test('unsaved changes are detected when using the skip button', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();

    let elephantCheckbox = getCheckboxByName('elephant');
    expect(elephantCheckbox).not.toBeChecked();

    userEvent.click(elephantCheckbox);
    elephantCheckbox = getCheckboxByName('elephant');
    expect(elephantCheckbox).toBeChecked();

    const skipButton = getButtonByName('skip');
    userEvent.click(skipButton);

    let modal = await screen.findByRole('alertdialog');
    const modalBackButton = within(modal).getByRole('button', {
      name: /back/i,
    });
    userEvent.click(modalBackButton);
    expect(elephantCheckbox).toBeChecked();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    userEvent.click(skipButton);
    modal = await screen.findByRole('alertdialog');
    const modalDiscardButton = within(modal).getByRole('button', {
      name: /discard changes/i,
    });

    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId: cvrId2 },
      { [contestId]: ['kangaroo'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId: cvrId2 }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId: cvrId2 }, []);
    userEvent.click(modalDiscardButton);
    await screen.findByTestId('transcribe:id-175');
  });

  test('unsaved changes are detected when the change was write-in adjudication', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();

    const closeButton = getButtonByName('close');
    const kangarooCheckbox = screen.getByRole('checkbox', {
      name: /kangaroo/i,
    });
    expect(kangarooCheckbox).toBeChecked();

    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    // only one for the official candidate checkbox
    let elephantItems = screen.getAllByText('Elephant');
    expect(elephantItems).toHaveLength(1);

    let writeInSearchSelect = screen.getByRole('combobox');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    const elephantDropdownItem = getDropdownItemByLabel('Elephant');
    userEvent.click(elephantDropdownItem!);

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');

    // one for the official candidate checkbox, one more for write-in selection
    elephantItems = screen.getAllByText('Elephant');
    expect(elephantItems).toHaveLength(2);

    userEvent.click(closeButton);

    let modal = await screen.findByRole('alertdialog');
    const modalBackButton = within(modal).getByRole('button', {
      name: /back/i,
    });
    userEvent.click(modalBackButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    elephantItems = screen.getAllByText('Elephant');
    expect(elephantItems).toHaveLength(2);

    userEvent.click(closeButton);
    modal = await screen.findByRole('alertdialog');
    const modalDiscardButton = within(modal).getByRole('button', {
      name: /discard changes/i,
    });
    userEvent.click(modalDiscardButton);

    await waitFor(() => {
      expect(screen.queryByTestId('transcribe:id-174')).not.toBeInTheDocument();
    });
  });
});

describe('hmpb write-in adjudication', () => {
  const contestId = 'zoo-council-mammal';
  const cvrIds = ['id-174'];
  const cvrId = cvrIds[0];
  // const cvrId2 = cvrIds[1];
  const writeIn0Id = 'write-in-0';
  const writeInRecord: WriteInRecord = {
    status: 'pending',
    id: '1',
    cvrId,
    contestId,
    electionId,
    optionId: writeIn0Id,
  };
  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'write-in-0', name: 'oliver', electionId, contestId },
  ];

  beforeEach(() => {
    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId },
      { [contestId]: ['kangaroo', 'write-in-0'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, [writeInRecord]);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, false);
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });

  test('hmpb write-in can be adjudicated as invalid', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();

    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    let finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');
    const item = await screen.findByText(/not a mark/i);
    fireEvent.click(item);

    expect(screen.queryByText(/invalid mark/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeEnabled();

    const adjudicatedCvrContest = formAdjudicatedCvrContest(cvrId, {
      kangaroo: { type: 'candidate-option', hasVote: true },
    });

    apiMock.expectAdjudicateCvrContest(adjudicatedCvrContest);
    userEvent.click(finishButton);
  });

  test('hmpb write-in can be adjudicated as official candidate', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();

    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    let finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    const elephantDropdownItem = getDropdownItemByLabel('Elephant');
    userEvent.click(elephantDropdownItem!);

    const elephantCheckbox = screen.getByRole('checkbox', {
      checked: false,
      name: /elephant/i,
    });
    expect(elephantCheckbox).toBeDisabled();

    finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeEnabled();

    const adjudicatedCvrContest = formAdjudicatedCvrContest(cvrId, {
      kangaroo: { type: 'candidate-option', hasVote: true },
      'write-in-0': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'official-candidate',
        candidateId: 'elephant',
      },
    });

    apiMock.expectAdjudicateCvrContest(adjudicatedCvrContest);
    userEvent.click(finishButton);
  });

  test('hmpb write-in can be adjudicated as existing write-in using filter and dropdown', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    let finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    // review dropdown options
    expect(screen.queryByText(/add:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not a mark/i)).toBeInTheDocument();
    expect(screen.getAllByText(/elephant/i)).toHaveLength(2);
    expect(screen.getAllByText(/lion/i)).toHaveLength(2);
    expect(screen.getAllByText(/kangaroo/i)).toHaveLength(1);
    expect(screen.getAllByText(/kangaroo/i)).toHaveLength(1);

    userEvent.type(writeInSearchSelect, 'e');

    expect(screen.queryByText(/add: e/i)).toBeInTheDocument();
    expect(screen.queryByText(/not a mark/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/elephant/i)).toHaveLength(2);
    expect(screen.getAllByText(/lion/i)).toHaveLength(1);

    userEvent.clear(writeInSearchSelect);
    // case insensitive filter
    userEvent.type(writeInSearchSelect, 'OLIVER');

    expect(screen.queryByText(/add:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not a mark/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/elephant/i)).toHaveLength(1);
    expect(screen.getAllByText(/oliver/i)).toHaveLength(2);

    const oliverDropdownItem = getDropdownItemByLabel('oliver');
    userEvent.click(oliverDropdownItem!);

    finishButton = getButtonByName('finish');
    expect(finishButton).toBeEnabled();

    const adjudicatedCvrContest = formAdjudicatedCvrContest(cvrId, {
      kangaroo: { type: 'candidate-option', hasVote: true },
      'write-in-0': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'write-in-candidate',
        candidateName: 'oliver',
      },
    });

    apiMock.expectAdjudicateCvrContest(adjudicatedCvrContest);
    userEvent.click(finishButton);
  });

  test('hmpb write-in can be adjudicated as new write-in candidate', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    let finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    // review dropdown options
    expect(screen.queryByText(/add:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not a mark/i)).toBeInTheDocument();
    expect(screen.queryByText(/oliver/i)).toBeInTheDocument();

    userEvent.type(writeInSearchSelect, 'siena');

    expect(screen.queryByText(/not a mark/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/oliver/i)).not.toBeInTheDocument();

    const addNewItem = getDropdownItemByLabel('Add: siena');
    userEvent.click(addNewItem!);

    finishButton = getButtonByName('finish');
    expect(finishButton).toBeEnabled();

    const adjudicatedCvrContest = formAdjudicatedCvrContest(cvrId, {
      kangaroo: { type: 'candidate-option', hasVote: true },
      'write-in-0': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'write-in-candidate',
        candidateName: 'siena',
      },
    });

    apiMock.expectAdjudicateCvrContest(adjudicatedCvrContest);
    userEvent.click(finishButton);
  });
});

describe('bmd write-in adjudication', () => {
  const contestId = 'zoo-council-mammal';
  const cvrIds = ['id-174'];
  const cvrId = cvrIds[0];
  const writeIn0Id = 'write-in-0';
  const writeInRecords: WriteInRecord[] = [
    {
      status: 'pending',
      id: '1',
      cvrId,
      contestId,
      electionId,
      optionId: writeIn0Id,
    },
  ];
  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'write-in-0', name: 'oliver', electionId, contestId },
  ];

  beforeEach(() => {
    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId },
      { [contestId]: ['kangaroo', 'write-in-0'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, writeInRecords);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, true);
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });

  test('bmd write-in can be adjudicated and shows machine marked text', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    let writeInCheckbox = screen.getByRole('checkbox', {
      name: /machine-marked-mock-text/i,
    });
    expect(writeInCheckbox).toBeChecked();

    const disabledWriteInCheckboxes = screen
      .getAllByRole('checkbox', { name: /write-in/i })
      .filter((el) => (el as HTMLInputElement).disabled);
    expect(disabledWriteInCheckboxes).toHaveLength(2);

    let finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    const invalidMarkItem = getDropdownItemByLabel('Not a mark');
    userEvent.click(invalidMarkItem!);

    expect(screen.queryByText(/invalid mark/i)).toBeInTheDocument();

    [writeInCheckbox] = screen
      .getAllByRole('checkbox', { name: /write-in/i })
      .filter((el) => !(el as HTMLInputElement).disabled);
    expect(writeInCheckbox).not.toBeChecked();

    userEvent.click(writeInCheckbox);
    writeInCheckbox = screen.getByRole('checkbox', {
      name: /machine-marked-mock-text/i,
    });
    expect(writeInCheckbox).toBeChecked();

    finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    writeInSearchSelect = screen.getByRole('combobox');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    const oliverItem = getDropdownItemByLabel('oliver');
    userEvent.click(oliverItem!);

    finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeEnabled();

    const adjudicatedCvrContest = formAdjudicatedCvrContest(cvrId, {
      kangaroo: { type: 'candidate-option', hasVote: true },
      'write-in-0': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'write-in-candidate',
        candidateName: 'oliver',
      },
    });
    apiMock.expectAdjudicateCvrContest(adjudicatedCvrContest);

    userEvent.click(finishButton);
    await waitFor(() => {
      expect(screen.queryByTestId('transcribe:id-174')).not.toBeInTheDocument();
    });
  });
});

describe('unmarked and undetected write-ins', () => {
  const contestId = 'zoo-council-mammal';
  const cvrIds = ['id-174'];
  const cvrId = cvrIds[0];
  const writeIn0Id = 'write-in-0';
  const writeInRecord: WriteInRecord = {
    status: 'pending',
    id: '1',
    cvrId,
    contestId,
    electionId,
    optionId: writeIn0Id,
    isUnmarked: true,
  };
  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'write-in-0', name: 'oliver', electionId, contestId },
  ];

  beforeEach(() => {
    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId },
      { [contestId]: ['kangaroo'] }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, [writeInRecord]);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, false);
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });

  test('unmarked and undetected write-in candidate adjudication', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    expect(screen.queryByText(/unmarked write-in/i)).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('checkbox', { name: /write-in/i })
        .filter((cb) => (cb as HTMLInputElement).checked)
    ).toHaveLength(0);

    let finishButton = getButtonByName('finish');
    expect(finishButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    const invalidMarkItem = getDropdownItemByLabel('Not a mark');
    userEvent.click(invalidMarkItem!);

    expect(screen.queryByText(/unmarked write-in/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid mark/i)).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox', { name: /write-in/i });
    // it's difficult to detect which checkbox was the UWI by query,
    // so let's just test out undetected marks as well, creating an overvote
    expect(screen.queryByText(/overvote/i)).not.toBeInTheDocument();
    for (const box of checkboxes) userEvent.click(box);
    expect(screen.queryByText(/overvote/i)).toBeInTheDocument();

    expect(screen.queryByText(/invalid mark/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/unmarked write-in/i)).toHaveLength(3);
    expect(screen.getAllByText(/valid write-in/i)).toHaveLength(3);

    const searchSelects = screen.getAllByRole('combobox');
    const selections = ['Elephant', 'Lion', 'Zebra'];
    for (const [i, select] of searchSelects.entries()) {
      expect(select).toHaveAttribute('aria-expanded', 'false');
      finishButton = getButtonByName('finish');
      expect(finishButton).toBeDisabled();
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      const dropdownItem = getDropdownItemByLabel(selections[i]);
      userEvent.click(dropdownItem!);
    }

    finishButton = getButtonByName('finish');
    expect(finishButton).toBeEnabled();

    const adjudicatedCvrContest = formAdjudicatedCvrContest(cvrId, {
      kangaroo: { type: 'candidate-option', hasVote: true },
      'write-in-0': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'official-candidate',
        candidateId: 'elephant',
      },
      'write-in-1': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'official-candidate',
        candidateId: 'lion',
      },
      'write-in-2': {
        type: 'write-in-option',
        hasVote: true,
        candidateType: 'official-candidate',
        candidateId: 'zebra',
      },
    });

    apiMock.expectAdjudicateCvrContest(adjudicatedCvrContest);
    userEvent.click(finishButton);
  });
});

describe('double vote detection', () => {
  const contestId = 'zoo-council-mammal';
  const cvrIds = ['id-174'];
  const cvrId = cvrIds[0];

  const writeInRecords: WriteInRecord[] = [
    {
      status: 'pending',
      id: '1',
      cvrId,
      contestId,
      electionId,
      optionId: 'write-in-0',
    },
    {
      status: 'pending',
      id: '2',
      cvrId,
      contestId,
      electionId,
      optionId: 'write-in-1',
    },
  ];
  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'write-in-0', name: 'oliver', electionId, contestId },
  ];
  const votes = ['kangaroo', 'write-in-0', 'write-in-1'];

  beforeEach(() => {
    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, null);
    apiMock.expectGetCastVoteRecordVoteInfo({ cvrId }, { [contestId]: votes });
    apiMock.expectGetVoteAdjudications({ contestId, cvrId }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId }, writeInRecords);
    apiMock.expectGetCvrContestWriteInImageViews({ contestId, cvrId }, false);
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });

  test('detects double vote if already voted for official candidates name is submitted', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    const kangarooCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /kangaroo/i,
    });
    expect(kangarooCheckbox).toBeChecked();

    const writeInCheckbox = screen.getAllByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    })[0];
    expect(writeInCheckbox).toBeChecked();

    const finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    const writeInSearchSelect = screen.getAllByRole('combobox')[0];
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });
    userEvent.type(writeInSearchSelect, 'Kangaroo');
    // the select should be highlighting the 'add' option
    userEvent.keyboard('{Enter}');

    const modal = await screen.findByRole('alertdialog');
    expect(screen.queryByText(/double vote detected/i)).toBeInTheDocument();
    const modalCancelButton = within(modal).getByRole('button', {
      name: /cancel/i,
    });
    userEvent.click(modalCancelButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test('detects double vote if already selected write-in candidates name is submitted', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    const kangarooCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /kangaroo/i,
    });
    expect(kangarooCheckbox).toBeChecked();

    const finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    const writeInSearchSelects = screen.getAllByRole('combobox');
    for (const select of writeInSearchSelects) {
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      userEvent.type(select, 'oliver');
      userEvent.keyboard('{Enter}');
    }

    const modal = await screen.findByRole('alertdialog');
    expect(screen.queryByText(/double vote detected/i)).toBeInTheDocument();
    const modalCancelButton = within(modal).getByRole('button', {
      name: /cancel/i,
    });
    userEvent.click(modalCancelButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test('detects double vote if already newly entered write-in candidates name is re-submitted on the same ballot', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();
    const kangarooCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /kangaroo/i,
    });
    expect(kangarooCheckbox).toBeChecked();

    const finishButton = screen.getByRole('button', { name: /finish/i });
    expect(finishButton).toBeDisabled();

    const writeInSearchSelects = screen.getAllByRole('combobox');
    for (const select of writeInSearchSelects) {
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      userEvent.type(select, 'new');
      userEvent.keyboard('{Enter}');
    }

    const modal = await screen.findByRole('alertdialog');
    expect(screen.queryByText(/double vote detected/i)).toBeInTheDocument();
    const modalCancelButton = within(modal).getByRole('button', {
      name: /cancel/i,
    });
    userEvent.click(modalCancelButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('ballot navigation', () => {
  const contestId = 'zoo-council-mammal';
  const cvrIds = ['id-174', 'id-175', 'id-176'];
  const firstPendingCvrId = cvrIds[1];

  const writeInRecords: WriteInRecord[] = [
    {
      status: 'pending',
      id: '1',
      cvrId: firstPendingCvrId,
      contestId,
      electionId,
      optionId: 'write-in-0',
    },
  ];
  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'write-in-0', name: 'oliver', electionId, contestId },
  ];
  const votes = ['kangaroo', 'write-in-0'];

  beforeEach(() => {
    apiMock.expectGetWriteInAdjudicationCvrQueue({ contestId }, cvrIds);
    apiMock.expectGetFirstPendingWriteInCvrId({ contestId }, firstPendingCvrId);
    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId: firstPendingCvrId },
      { [contestId]: votes }
    );
    apiMock.expectGetVoteAdjudications(
      { contestId, cvrId: firstPendingCvrId },
      []
    );
    apiMock.expectGetWriteIns(
      { contestId, cvrId: firstPendingCvrId },
      writeInRecords
    );
    apiMock.expectGetCvrContestWriteInImageViews(
      { contestId, cvrId: firstPendingCvrId },
      false
    );
    apiMock.expectGetCvrContestWriteInImageViews(
      { contestId, cvrId: cvrIds[2] },
      false
    );
    apiMock.expectGetCvrContestWriteInImageViews(
      { contestId, cvrId: cvrIds[0] },
      false
    );
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });
  test('opens to pending cvr and enables/disables navigation buttons based on remaining queue', async () => {
    renderScreen(contestId, {
      electionDefinition,
      apiMock,
    });

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-175')).toBeInTheDocument();

    let skipButton = getButtonByName('skip');
    expect(skipButton).toBeEnabled();
    let backButton = getButtonByName('back');
    expect(backButton).toBeEnabled();
    let primaryButton = getButtonByName('save & next');
    expect(primaryButton).toBeDisabled();

    // go back one ballot

    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId: cvrIds[0] },
      { [contestId]: votes }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId: cvrIds[0] }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId: cvrIds[0] }, writeInRecords);
    userEvent.click(backButton);

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-174')).toBeInTheDocument();

    skipButton = getButtonByName('skip');
    expect(skipButton).toBeEnabled();
    backButton = getButtonByName('back');
    expect(backButton).toBeDisabled();
    primaryButton = getButtonByName('save & next');
    expect(primaryButton).toBeDisabled();

    // go forward two ballots

    apiMock.expectGetCastVoteRecordVoteInfo(
      { cvrId: cvrIds[2] },
      { [contestId]: votes }
    );
    apiMock.expectGetVoteAdjudications({ contestId, cvrId: cvrIds[2] }, []);
    apiMock.expectGetWriteIns({ contestId, cvrId: cvrIds[2] }, writeInRecords);
    userEvent.click(skipButton);

    await screen.findByTestId('transcribe:id-175');
    skipButton = getButtonByName('skip');
    userEvent.click(skipButton);

    await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
    expect(screen.queryByTestId('transcribe:id-176')).toBeInTheDocument();

    skipButton = getButtonByName('skip');
    expect(skipButton).toBeDisabled();
    backButton = getButtonByName('back');
    expect(backButton).toBeEnabled();
    primaryButton = getButtonByName('finish');
    expect(primaryButton).toBeDisabled();
  });
});
