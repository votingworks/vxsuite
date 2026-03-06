import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  readElectionTwoPartyPrimaryDefinition,
  electionFamousNames2021Fixtures,
} from '@votingworks/fixtures';
import {
  BallotStyleGroupId,
  BallotType,
  ContestId,
  ContestOptionId,
  ElectionDefinition,
  Id,
  Side,
} from '@votingworks/types';
import type {
  BallotPageContestOptionLayout,
  BallotPageLayout,
  HmpbBallotPageMetadata,
} from '@votingworks/types';
import userEvent from '@testing-library/user-event';
import type {
  AdjudicatedContestOption,
  AdjudicatedCvrContest,
  BallotImages,
  ContestAdjudicationData,
  CvrContestTag,
  HmpbBallotPageImage,
  VoteAdjudication,
  WriteInCandidateRecord,
  WriteInRecord,
} from '@votingworks/admin-backend';
import { allContestOptions, getBallotStyleGroup } from '@votingworks/utils';
import { assertDefined, find } from '@votingworks/basics';
import {
  fireEvent,
  screen,
  waitFor,
  within,
} from '../../test/react_testing_library';
import { renderInAppContext } from '../../test/render_in_app_context';
import { ApiMock, createApiMock } from '../../test/helpers/mock_api_client';
import { ContestAdjudicationScreen } from './contest_adjudication_screen';
import { MAX_WRITE_IN_NAME_LENGTH } from '../components/write_in_adjudication_button';
import {
  IMAGE_VIEWER_HEIGHT_PX,
  IMAGE_VIEWER_WIDTH_PX,
} from '../components/adjudication_ballot_image_viewer';

const electionDefinition = readElectionTwoPartyPrimaryDefinition();
const electionId = electionDefinition.election.id;

let apiMock: ApiMock;

beforeEach(() => {
  apiMock = createApiMock();
  // JSDOM does not implement scrollIntoView, so we define it as a no-op
  // to prevent tests from throwing when components attempt to scroll elements.
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  apiMock.assertComplete();
});

// Option layouts matching the data returned by the old getBallotImageView mock,
// used to test zoom coordinates and write-in focus in the ballot image viewer.
const MOCK_ZOO_OPTION_LAYOUTS: BallotPageContestOptionLayout[] = [
  {
    definition: {
      type: 'candidate',
      id: 'elephant',
      contestId: 'zoo-council-mammal',
      name: 'Elephant',
      isWriteIn: false,
    },
    bounds: { x: 200, y: 100, width: 50, height: 30 },
    target: {
      bounds: { x: 205, y: 105, width: 10, height: 10 },
      inner: { x: 207, y: 107, width: 6, height: 6 },
    },
  },
  {
    definition: {
      type: 'candidate',
      id: 'lion',
      contestId: 'zoo-council-mammal',
      name: 'Lion',
      isWriteIn: false,
    },
    bounds: { x: 200, y: 100, width: 50, height: 30 },
    target: {
      bounds: { x: 205, y: 105, width: 10, height: 10 },
      inner: { x: 207, y: 107, width: 6, height: 6 },
    },
  },
  {
    definition: {
      type: 'candidate',
      id: 'kangaroo',
      contestId: 'zoo-council-mammal',
      name: 'Kangaroo',
      isWriteIn: false,
    },
    bounds: { x: 200, y: 100, width: 50, height: 30 },
    target: {
      bounds: { x: 205, y: 105, width: 10, height: 10 },
      inner: { x: 207, y: 107, width: 6, height: 6 },
    },
  },
  {
    definition: {
      type: 'candidate',
      id: 'write-in-0',
      contestId: 'zoo-council-mammal',
      name: 'Write-In Option 0',
      isWriteIn: true,
      writeInIndex: 0,
    },
    bounds: { x: 400, y: 200, width: 400, height: 200 },
    target: {
      bounds: { x: 205, y: 155, width: 10, height: 10 },
      inner: { x: 207, y: 157, width: 6, height: 6 },
    },
  },
  {
    definition: {
      type: 'candidate',
      id: 'write-in-1',
      contestId: 'zoo-council-mammal',
      name: 'Write-In Option 1',
      isWriteIn: true,
      writeInIndex: 1,
    },
    bounds: { x: 400, y: 200, width: 400, height: 200 },
    target: {
      bounds: { x: 205, y: 155, width: 10, height: 10 },
      inner: { x: 207, y: 157, width: 6, height: 6 },
    },
  },
  {
    definition: {
      type: 'candidate',
      id: 'write-in-2',
      contestId: 'zoo-council-mammal',
      name: 'Write-In Option 2',
      isWriteIn: true,
      writeInIndex: 2,
    },
    bounds: { x: 400, y: 200, width: 400, height: 200 },
    target: {
      bounds: { x: 205, y: 155, width: 10, height: 10 },
      inner: { x: 207, y: 157, width: 6, height: 6 },
    },
  },
];

const MOCK_HMPB_METADATA: HmpbBallotPageMetadata = {
  ballotHash: '0'.repeat(64),
  precinctId: '23',
  ballotStyleId: '1M',
  pageNumber: 1,
  isTestMode: false,
  ballotType: BallotType.Precinct,
};

function buildHmpbBallotImages(
  cvrId: Id,
  contestId: ContestId,
  options: {
    isImageCorrupted?: boolean;
    optionLayouts?: BallotPageContestOptionLayout[];
  } = {}
): BallotImages {
  const imageUrl = options.isImageCorrupted
    ? null
    : `mock-image-data-${cvrId}-0`;
  const ballotDim = options.isImageCorrupted ? 0 : 1000;
  const layout: BallotPageLayout = {
    pageSize: { width: 1000, height: 1000 },
    metadata: MOCK_HMPB_METADATA,
    contests: [
      {
        contestId,
        bounds: { x: 200, y: 200, width: 600, height: 600 },
        corners: [
          { x: 200, y: 200 },
          { x: 800, y: 200 },
          { x: 200, y: 800 },
          { x: 800, y: 800 },
        ],
        options: options.optionLayouts ?? MOCK_ZOO_OPTION_LAYOUTS,
      },
    ],
  };
  const frontPage: HmpbBallotPageImage = {
    type: 'hmpb',
    imageUrl,
    ballotCoordinates: { x: 0, y: 0, width: ballotDim, height: ballotDim },
    layout,
  };
  const backPage: HmpbBallotPageImage = {
    type: 'hmpb',
    imageUrl: null,
    ballotCoordinates: { x: 0, y: 0, width: 0, height: 0 },
    layout: { ...layout, contests: [] },
  };
  return { cvrId, front: frontPage, back: backPage };
}

function buildBmdBallotImages(
  cvrId: Id,
  options: { isImageCorrupted?: boolean } = {}
): BallotImages {
  const imageUrl = options.isImageCorrupted
    ? null
    : `mock-image-data-${cvrId}-0`;
  return {
    cvrId,
    front: {
      type: 'bmd',
      imageUrl,
      ballotCoordinates: { x: 0, y: 0, width: 1000, height: 1000 },
    },
    back: {
      type: 'bmd',
      imageUrl: null,
      ballotCoordinates: { x: 0, y: 0, width: 0, height: 0 },
    },
  };
}

function buildContestAdjudicationData({
  electionDef = electionDefinition,
  contestId,
  votes = [],
  writeInRecords = [],
  voteAdjudications = [],
  marginalMarkOptionIds = [],
  tag = null,
  ballotStyleGroupId,
}: {
  electionDef?: ElectionDefinition;
  contestId: ContestId;
  votes?: ContestOptionId[];
  writeInRecords?: WriteInRecord[];
  voteAdjudications?: VoteAdjudication[];
  marginalMarkOptionIds?: ContestOptionId[];
  tag?: CvrContestTag | null;
  ballotStyleGroupId?: BallotStyleGroupId;
}): ContestAdjudicationData {
  const { election } = electionDef;
  const contest = find(election.contests, (c) => c.id === contestId);
  const contestPartyId =
    contest.type === 'candidate' ? contest.partyId : undefined;
  const ballotStyleGroup = ballotStyleGroupId
    ? assertDefined(getBallotStyleGroup({ election, ballotStyleGroupId }))
    : assertDefined(
        election.ballotStyles.find(
          (bs) =>
            bs.districts.includes(contest.districtId) &&
            (!contestPartyId || bs.partyId === contestPartyId)
        )
      );
  const options = [...allContestOptions(contest, ballotStyleGroup)].map(
    (option) => ({
      definition: option,
      initialVote: votes.includes(option.id),
      hasMarginalMark: marginalMarkOptionIds.includes(option.id),
      voteAdjudication:
        voteAdjudications.find((v) => v.optionId === option.id) ?? null,
      writeInRecord:
        writeInRecords.find((w) => w.optionId === option.id) ?? null,
    })
  );
  return { contestId, tag, options };
}

function renderScreen(
  contestAdjudicationData: ContestAdjudicationData,
  cvrId: Id,
  {
    ballotImages,
    side = 'front' as Side,
    electionDef = electionDefinition,
    onClose = vi.fn(),
  }: {
    ballotImages?: BallotImages;
    side?: Side;
    electionDef?: ElectionDefinition;
    onClose?: () => void;
  } = {}
) {
  const images =
    ballotImages ??
    buildHmpbBallotImages(cvrId, contestAdjudicationData.contestId);
  return {
    onClose,
    ...renderInAppContext(
      <ContestAdjudicationScreen
        contestAdjudicationData={contestAdjudicationData}
        cvrId={cvrId}
        onClose={onClose}
        ballotImages={images}
        side={side}
      />,
      { electionDefinition: electionDef, apiMock }
    ),
  };
}

async function waitForBallotById(id: Id) {
  // Wait for the ballot testId to be present, indicating the ballot has loaded
  await expect(
    screen.findByTestId(`transcribe:${id}`)
  ).resolves.toBeInTheDocument();
  // Then wait for the checkboxes to be rendered, indicating ballot data is fully loaded
  await expect(screen.findAllByRole('checkbox')).resolves.not.toHaveLength(0);
}

function getDropdownItemByLabel(label: string) {
  return screen
    .getAllByText(label)
    .find((el) => el.getAttribute('aria-disabled') === 'false');
}

function getInvalidMarkItem() {
  return screen.getByText(
    (_, node) =>
      (node?.textContent ?? '').includes('Invalid') &&
      node?.getAttribute('aria-disabled') === 'false'
  );
}

function getAddCandidateItem() {
  return screen.getByText(
    (_, node) =>
      (node?.textContent ?? '').includes('Press enter to add:') &&
      node?.getAttribute('aria-disabled') === 'false'
  );
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

describe('hmpb write-in adjudication', () => {
  const contestId = 'zoo-council-mammal';
  const cvrId = 'id-174';
  const writeInRecord: WriteInRecord = {
    status: 'pending',
    id: '1',
    cvrId,
    contestId,
    electionId,
    optionId: 'write-in-0',
  };
  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'write-in-0', name: 'oliver', electionId, contestId },
  ];
  const cvrContestTag: CvrContestTag = {
    isResolved: false,
    isUndetected: false,
    cvrId,
    contestId,
    hasWriteIn: true,
  };

  beforeEach(() => {
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });

  test('hmpb write-in can be adjudicated as invalid', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo', 'write-in-0'],
      writeInRecords: [writeInRecord],
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');

    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    let confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');
    const item = await screen.findByText(/invalid/i);
    fireEvent.click(item);

    expect(screen.queryByText(/invalid/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeEnabled();

    const adjudicatedCvrContest = formAdjudicatedCvrContest(cvrId, {
      kangaroo: { type: 'candidate-option', hasVote: true },
    });
    apiMock.expectAdjudicateCvrContest(adjudicatedCvrContest);
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);

    userEvent.click(confirmButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('hmpb write-in can be adjudicated as official candidate', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo', 'write-in-0'],
      writeInRecords: [writeInRecord],
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');

    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    let confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

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

    confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeEnabled();

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
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);

    userEvent.click(confirmButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('hmpb write-in can be adjudicated as existing write-in using filter and dropdown', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo', 'write-in-0'],
      writeInRecords: [writeInRecord],
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');
    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    let confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    // review dropdown options
    expect(screen.queryByText(/press enter to add:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid/i)).toBeInTheDocument();
    expect(screen.getAllByText(/elephant/i)).toHaveLength(2);
    expect(screen.getAllByText(/lion/i)).toHaveLength(2);
    expect(screen.getAllByText(/kangaroo/i)).toHaveLength(1);
    expect(screen.getAllByText(/kangaroo/i)).toHaveLength(1);

    userEvent.type(writeInSearchSelect, 'e');

    expect(screen.queryByText(/press enter to add: e/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/elephant/i)).toHaveLength(2);
    expect(screen.getAllByText(/lion/i)).toHaveLength(1);

    userEvent.clear(writeInSearchSelect);
    // case insensitive filter
    userEvent.type(writeInSearchSelect, 'OLIVER');

    expect(screen.queryByText(/press enter to add:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/elephant/i)).toHaveLength(1);
    expect(screen.getAllByText(/oliver/i)).toHaveLength(2);

    const oliverDropdownItem = getDropdownItemByLabel('oliver');
    userEvent.click(oliverDropdownItem!);

    confirmButton = getButtonByName('confirm');
    expect(confirmButton).toBeEnabled();

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
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);

    userEvent.click(confirmButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('hmpb write-in can be adjudicated as new write-in candidate', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo', 'write-in-0'],
      writeInRecords: [writeInRecord],
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');
    const writeInCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    expect(writeInCheckbox).toBeChecked();

    let confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

    // test max name length
    let writeInSearchSelect = screen.getByRole('combobox');
    userEvent.type(
      writeInSearchSelect,
      'a'.repeat(MAX_WRITE_IN_NAME_LENGTH + 1)
    );
    expect(
      screen.queryByText(/entry exceeds max character length/i)
    ).toBeInTheDocument();
    // enter should not select anything since there is no valid option
    userEvent.keyboard('{Enter}');

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');
    userEvent.clear(writeInSearchSelect);

    // review dropdown options
    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    expect(screen.queryByText(/press enter to add:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/invalid/i)).toBeInTheDocument();
    expect(screen.queryByText(/oliver/i)).toBeInTheDocument();

    userEvent.type(writeInSearchSelect, 'siena');

    expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/oliver/i)).not.toBeInTheDocument();

    // add new candidate
    const addNewItem = getAddCandidateItem();
    userEvent.click(addNewItem);

    // once that candidate is added, they should be included in the next dropdown search
    writeInSearchSelect = screen.getByRole('combobox');
    userEvent.type(writeInSearchSelect, 'sie');
    // even though we've only partially typed the name, the full name should be
    // highlighted in the dropdown
    userEvent.keyboard('{Enter}');

    confirmButton = getButtonByName('confirm');
    expect(confirmButton).toBeEnabled();

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
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);

    userEvent.click(confirmButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('bmd write-in adjudication', () => {
  const contestId = 'zoo-council-mammal';
  const cvrId = 'id-174';
  const writeInRecords: WriteInRecord[] = [
    {
      status: 'pending',
      id: '1',
      cvrId,
      contestId,
      electionId,
      optionId: 'write-in-0',
      machineMarkedText: 'machine-marked-mock-text',
    },
  ];
  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'write-in-0', name: 'oliver', electionId, contestId },
  ];
  const cvrContestTag: CvrContestTag = {
    isResolved: false,
    isUndetected: false,
    cvrId,
    contestId,
    hasWriteIn: true,
  };

  beforeEach(() => {
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });

  test('bmd write-in can be adjudicated and shows machine marked text', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo', 'write-in-0'],
      writeInRecords,
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId, {
      ballotImages: buildBmdBallotImages(cvrId),
    });

    await waitForBallotById('id-174');
    let writeInCheckbox = screen.getByRole('checkbox', {
      name: /machine-marked-mock-text/i,
    });
    expect(writeInCheckbox).toBeChecked();

    const disabledWriteInCheckboxes = screen
      .getAllByRole('checkbox', { name: /write-in/i })
      .filter((el) => (el as HTMLInputElement).disabled);
    expect(disabledWriteInCheckboxes).toHaveLength(2);

    let confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    const invalidMarkItem = getInvalidMarkItem();
    userEvent.click(invalidMarkItem);

    expect(screen.queryByText(/invalid/i)).toBeInTheDocument();

    [writeInCheckbox] = screen
      .getAllByRole('checkbox', { name: /machine-marked-mock-text/i })
      .filter((el) => !(el as HTMLInputElement).disabled);
    expect(writeInCheckbox).not.toBeChecked();

    userEvent.click(writeInCheckbox);
    writeInCheckbox = screen.getByRole('checkbox', {
      name: /machine-marked-mock-text/i,
    });
    expect(writeInCheckbox).toBeChecked();

    confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

    writeInSearchSelect = screen.getByRole('combobox');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    const oliverItem = getDropdownItemByLabel('oliver');
    userEvent.click(oliverItem!);

    confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeEnabled();

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
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);

    userEvent.click(confirmButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('vote adjudication', () => {
  test('hmpb ballot can have votes adjudicated', async () => {
    const contestId = 'zoo-council-mammal';
    const cvrId = 'id-174';
    const voteAdjudications: VoteAdjudication[] = [
      {
        electionId,
        cvrId,
        contestId,
        optionId: 'lion',
        isVote: true,
      },
    ];
    const cvrContestTag: CvrContestTag = {
      isResolved: false,
      isUndetected: false,
      cvrId,
      contestId,
      hasWriteIn: true,
    };

    apiMock.expectGetWriteInCandidates([], contestId);

    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo'],
      voteAdjudications,
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId);

    await waitForBallotById('id-174');

    // check that previous vote adjudication is loaded properly along with caption
    expect(getCheckboxByName('lion')).toBeChecked();
    expect(screen.queryByText(/undetected mark/i)).toBeInTheDocument();
    userEvent.click(getCheckboxByName('lion'));
    expect(screen.queryByText(/undetected mark/i)).toBeNull();
    userEvent.click(getCheckboxByName('lion'));
    expect(getCheckboxByName('lion')).toBeChecked();
    expect(screen.queryByText(/undetected mark/i)).toBeInTheDocument();

    // check that an overvote is created if all candidates are selected
    expect(screen.queryByText(/overvote/i)).toBeNull();
    userEvent.click(getCheckboxByName('zebra'));
    userEvent.click(getCheckboxByName('elephant'));
    expect(screen.queryByText(/overvote/i)).toBeInTheDocument();

    // remove the overvote, cause an undervote
    expect(screen.queryByText(/undervote/i)).toBeNull();
    userEvent.click(getCheckboxByName('zebra'));
    userEvent.click(getCheckboxByName('elephant'));
    expect(screen.queryByText(/overvote/i)).toBeNull();
    expect(screen.queryByText(/undervote/i)).toBeInTheDocument();

    // check caption for new vote adjudication from true to false
    expect(getCheckboxByName('kangaroo')).toBeChecked();
    expect(screen.queryByText(/invalid/i)).toBeNull();
    userEvent.click(getCheckboxByName('kangaroo'));
    expect(getCheckboxByName('kangaroo')).not.toBeChecked();
    expect(screen.queryByText(/invalid/i)).toBeInTheDocument();

    // caption disappears when undone
    userEvent.click(getCheckboxByName('kangaroo'));
    expect(getCheckboxByName('kangaroo')).toBeChecked();
    expect(screen.queryByText(/invalid/i)).toBeNull();

    // remove kangaroo so there is some change, enabling the primary button
    userEvent.click(getCheckboxByName('kangaroo'));

    const primaryButton = screen.getByRole('button', { name: /confirm/i });
    expect(primaryButton).toBeEnabled();

    const adjudicatedCvrContest = formAdjudicatedCvrContest(cvrId, {
      lion: { type: 'candidate-option', hasVote: true },
    });
    apiMock.expectAdjudicateCvrContest(adjudicatedCvrContest);
    apiMock.expectGetWriteInCandidates([], contestId);

    userEvent.click(primaryButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('bmd ballots cannot have votes adjudicated', async () => {
    const contestId = 'aquarium-council-fish';
    const cvrId = 'id-174';
    const cvrContestTag: CvrContestTag = {
      isResolved: false,
      isUndetected: false,
      cvrId,
      contestId,
      hasWriteIn: true,
    };

    apiMock.expectGetWriteInCandidates([], contestId);

    const data = buildContestAdjudicationData({
      contestId,
      votes: ['rockfish'],
      tag: cvrContestTag,
    });
    renderScreen(data, cvrId, {
      ballotImages: buildBmdBallotImages(cvrId),
    });

    await waitForBallotById('id-174');
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

describe('unmarked and undetected write-ins', () => {
  const contestId = 'zoo-council-mammal';
  const cvrId = 'id-174';
  const writeInRecords: WriteInRecord[] = [
    {
      status: 'pending',
      id: '1',
      cvrId,
      contestId,
      electionId,
      optionId: 'write-in-0',
      isUnmarked: true,
    },
  ];
  const writeInCandidates: WriteInCandidateRecord[] = [
    { id: 'write-in-0', name: 'oliver', electionId, contestId },
  ];
  const cvrContestTag: CvrContestTag = {
    isResolved: false,
    isUndetected: false,
    cvrId,
    contestId,
    hasUnmarkedWriteIn: true,
  };

  beforeEach(() => {
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });

  test('unmarked and undetected write-in candidate adjudication', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo'],
      writeInRecords,
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');
    expect(
      screen
        .getAllByRole('checkbox', { name: /write-in/i })
        .filter((cb) => (cb as HTMLInputElement).checked)
    ).toHaveLength(0);

    let confirmButton = getButtonByName('confirm');
    expect(confirmButton).toBeDisabled();

    // it's difficult to detect which checkbox was the UWI by query since
    // there are multiple unchecked, so let's just test out undetected
    // write-in marks as well, creating an overvote
    expect(screen.queryByText(/overvote/i)).not.toBeInTheDocument();

    // first, test marking them all as valid to cause an overvote
    let checkboxes = screen.getAllByRole('checkbox', { name: /write-in/i });
    for (const box of checkboxes) userEvent.click(box);
    checkboxes = screen.getAllByRole('checkbox', { name: /write-in/i });
    for (const box of checkboxes) expect(box).toBeChecked();
    expect(screen.queryByText(/overvote/i)).toBeInTheDocument();

    // now, test un-marking them all via the checkbox
    for (const box of checkboxes) userEvent.click(box);
    checkboxes = screen.getAllByRole('checkbox', { name: /write-in/i });
    for (const box of checkboxes) expect(box).not.toBeChecked();
    expect(screen.queryByText(/overvote/i)).not.toBeInTheDocument();
    // check the caption for the UWI being marked invalid
    expect(screen.queryByText(/ambiguous write-in/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid/i)).toBeInTheDocument();

    // toggle back on, and then enter values via searchSelects
    for (const box of checkboxes) userEvent.click(box);
    const searchSelects = screen.getAllByRole('combobox');
    const selections = ['Elephant', 'Lion', 'Zebra'];
    for (const [i, select] of searchSelects.entries()) {
      expect(select).toHaveAttribute('aria-expanded', 'false');
      confirmButton = getButtonByName('confirm');
      expect(confirmButton).toBeDisabled();
      fireEvent.keyDown(select, { key: 'ArrowDown' });
      const dropdownItem = getDropdownItemByLabel(selections[i]);
      userEvent.click(dropdownItem!);
    }

    // check the captions for the unmarked and undetected write-ins being marked valid.
    // we call both 'ambiguous' in the ui for simplicity
    expect(screen.queryByText(/invalid/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/ambiguous write-in/i)).toHaveLength(3);
    expect(screen.getAllByText(/valid/i)).toHaveLength(3);

    confirmButton = getButtonByName('confirm');
    expect(confirmButton).toBeEnabled();

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
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);

    userEvent.click(confirmButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('ballot image viewer', () => {
  test('hmpb ballot is zoomable and write-in is focusable', async () => {
    const contestId = 'zoo-council-mammal';
    const cvrId = 'id-174';
    const writeInRecords: WriteInRecord[] = [
      {
        status: 'pending',
        id: '1',
        cvrId,
        contestId,
        electionId,
        optionId: 'write-in-0',
      },
    ];
    const cvrContestTag: CvrContestTag = {
      isResolved: false,
      isUndetected: false,
      cvrId,
      contestId,
      hasWriteIn: true,
    };

    apiMock.expectGetWriteInCandidates([], contestId);

    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo', 'write-in-0'],
      writeInRecords,
      tag: cvrContestTag,
    });
    renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');

    let ballotImage = await screen.findByRole('img', {
      name: /ballot with section highlighted/i,
    });
    expect(ballotImage).toHaveAttribute('src', 'mock-image-data-id-174-0');

    // Initially zoomed in to show the contest
    const expectedContestZoomedInWidth =
      1000 * // Starting ballot image width
      (IMAGE_VIEWER_HEIGHT_PX / 600) *
      0.75; // Scaled based on contest area size
    expect(ballotImage).toHaveStyle({
      width: `${expectedContestZoomedInWidth}px`,
    });
    const zoomButton = screen.getButton(/Zoom Out/);
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
    expect(ballotImage).toHaveStyle({
      width: `${expectedContestZoomedInWidth}px`,
    });

    // Entering a write-in while zoomed in should change the focused area
    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    userEvent.click(writeInSearchSelect);
    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');
    ballotImage = screen.getByRole('img', {
      name: /ballot with section highlighted/i,
    });
    const expectedWriteInZoomedInWidth =
      1000 * // Starting ballot image width
      (IMAGE_VIEWER_WIDTH_PX / 400) *
      0.75; // Scaled based on write-in area size
    expect(ballotImage).toHaveStyle({
      width: `${expectedWriteInZoomedInWidth}px`,
    });

    // Escape key should remove focus from write-in
    userEvent.keyboard('{Escape}');
    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    ballotImage = await screen.findByRole('img', {
      name: /ballot with section highlighted/i,
    });
    expect(ballotImage).toHaveStyle({
      width: `${expectedContestZoomedInWidth}px`,
    });
  });

  test('hmpb ballot with corrupted image', async () => {
    const contestId = 'zoo-council-mammal';
    const cvrId = 'id-174';
    const writeInRecords: WriteInRecord[] = [
      {
        status: 'pending',
        id: '1',
        cvrId,
        contestId,
        electionId,
        optionId: 'write-in-0',
      },
    ];
    const cvrContestTag: CvrContestTag = {
      isResolved: false,
      isUndetected: false,
      cvrId,
      contestId,
      hasWriteIn: true,
    };

    apiMock.expectGetWriteInCandidates([], contestId);

    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo', 'write-in-0'],
      writeInRecords,
      tag: cvrContestTag,
    });
    renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId, {
        isImageCorrupted: true,
      }),
    });

    await waitForBallotById('id-174');
    await screen.findByText('Unable to load image');
  });

  test('bmd ballot is not zoomable', async () => {
    const contestId = 'zoo-council-mammal';
    const cvrId = 'id-174';
    const cvrContestTag: CvrContestTag = {
      isResolved: false,
      isUndetected: false,
      cvrId,
      contestId,
      hasWriteIn: true,
    };

    apiMock.expectGetWriteInCandidates([], contestId);

    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo'],
      tag: cvrContestTag,
    });
    renderScreen(data, cvrId, {
      ballotImages: buildBmdBallotImages(cvrId),
    });

    await waitForBallotById('id-174');
    const ballotImage = await screen.findByRole('img', {
      name: /Full ballot/i,
    });

    // Fully zoomed out
    expect(ballotImage).toHaveAttribute('src', 'mock-image-data-id-174-0');
    expect(ballotImage).toHaveStyle({ height: `100%` });

    // There should be no zoom buttons
    expect(screen.queryByText(/Zoom/)).toBeNull();
  });

  test('bmd ballot with corrupted image', async () => {
    const contestId = 'zoo-council-mammal';
    const cvrId = 'id-174';
    const cvrContestTag: CvrContestTag = {
      isResolved: false,
      isUndetected: false,
      cvrId,
      contestId,
      hasWriteIn: true,
    };

    apiMock.expectGetWriteInCandidates([], contestId);

    const data = buildContestAdjudicationData({
      contestId,
      votes: ['kangaroo'],
      tag: cvrContestTag,
    });
    renderScreen(data, cvrId, {
      ballotImages: buildBmdBallotImages(cvrId, { isImageCorrupted: true }),
    });

    await waitForBallotById('id-174');
    await screen.findByText('Unable to load image');
  });
});

describe('double votes', () => {
  const contestId = 'zoo-council-mammal';
  const cvrId = 'id-174';

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
  const cvrContestTag: CvrContestTag = {
    isResolved: false,
    isUndetected: false,
    cvrId,
    contestId,
    hasWriteIn: true,
  };

  beforeEach(() => {
    apiMock.expectGetWriteInCandidates(writeInCandidates, contestId);
  });

  test('detects double vote if already voted for official candidates name is submitted', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes,
      writeInRecords,
      tag: cvrContestTag,
    });
    renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');
    const kangarooCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /kangaroo/i,
    });
    expect(kangarooCheckbox).toBeChecked();

    const writeInCheckboxes = screen.getAllByRole('checkbox', {
      checked: true,
      name: /write-in/i,
    });
    for (const cb of writeInCheckboxes) expect(cb).toBeChecked();

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

    // enter in the official candidate that is already selected
    // via their official checkbox
    const writeInSearchSelect = screen.getAllByRole('combobox')[0];
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });
    userEvent.type(writeInSearchSelect, 'Kangaroo');
    // the select should be highlighting the 'add' option
    userEvent.keyboard('{Enter}');

    let modal = await screen.findByRole('alertdialog');
    expect(screen.queryByText(/double vote detected/i)).toBeInTheDocument();
    let modalCancelButton = within(modal).getByRole('button', {
      name: /cancel/i,
    });
    userEvent.click(modalCancelButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    // now select a different official candidate twice via write-ins
    // to trigger another double vote
    const writeInSearchSelects = screen.getAllByRole('combobox');
    for (const select of writeInSearchSelects) {
      userEvent.type(select, 'Lion');
      userEvent.keyboard('{Enter}');
    }
    modal = await screen.findByRole('alertdialog');
    expect(screen.queryByText(/double vote detected/i)).toBeInTheDocument();
    modalCancelButton = within(modal).getByRole('button', {
      name: /cancel/i,
    });
    userEvent.click(modalCancelButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test('detects double vote if already selected write-in candidates name is submitted', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes,
      writeInRecords,
      tag: cvrContestTag,
    });
    renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');
    const kangarooCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /kangaroo/i,
    });
    expect(kangarooCheckbox).toBeChecked();

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

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
    const data = buildContestAdjudicationData({
      contestId,
      votes,
      writeInRecords,
      tag: cvrContestTag,
    });
    renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');
    const kangarooCheckbox = screen.getByRole('checkbox', {
      checked: true,
      name: /kangaroo/i,
    });
    expect(kangarooCheckbox).toBeChecked();

    const confirmButton = screen.getByRole('button', { name: /confirm/i });
    expect(confirmButton).toBeDisabled();

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

describe('unsaved changes', () => {
  const contestId = 'zoo-council-mammal';
  const cvrId = 'id-174';
  const writeInRecord: WriteInRecord = {
    status: 'pending',
    id: '1',
    cvrId,
    contestId,
    electionId,
    optionId: 'write-in-0',
  };
  const votes = ['kangaroo', 'write-in-0'];
  const cvrContestTag: CvrContestTag = {
    isResolved: false,
    isUndetected: false,
    cvrId,
    contestId,
    hasWriteIn: true,
  };

  beforeEach(() => {
    apiMock.expectGetWriteInCandidates([], contestId);
  });

  test('detects unsaved changes when navigating with the overview button', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes,
      writeInRecords: [writeInRecord],
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');

    let elephantCheckbox = getCheckboxByName('elephant');
    expect(elephantCheckbox).not.toBeChecked();

    userEvent.click(elephantCheckbox);
    elephantCheckbox = getCheckboxByName('elephant');
    expect(elephantCheckbox).toBeChecked();

    const overviewButton = getButtonByName('overview');
    userEvent.click(overviewButton);

    let modal = await screen.findByRole('alertdialog');
    const modalBackButton = within(modal).getByRole('button', {
      name: /back/i,
    });
    userEvent.click(modalBackButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(elephantCheckbox).toBeChecked();

    userEvent.click(overviewButton);
    modal = await screen.findByRole('alertdialog');
    userEvent.keyboard('{Enter}');

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('detects an unsaved write-in adjudication', async () => {
    const data = buildContestAdjudicationData({
      contestId,
      votes,
      writeInRecords: [writeInRecord],
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId, {
      ballotImages: buildHmpbBallotImages(cvrId, contestId),
    });

    await waitForBallotById('id-174');

    const overviewButton = getButtonByName('overview');
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

    userEvent.click(overviewButton);

    let modal = await screen.findByRole('alertdialog');
    const modalBackButton = within(modal).getByRole('button', {
      name: /back/i,
    });
    userEvent.click(modalBackButton);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    elephantItems = screen.getAllByText('Elephant');
    expect(elephantItems).toHaveLength(2);

    userEvent.click(overviewButton);
    modal = await screen.findByRole('alertdialog');
    const modalDiscardButton = within(modal).getByRole('button', {
      name: /discard changes/i,
    });
    userEvent.click(modalDiscardButton);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('marginal mark adjudication', () => {
  const contestId = 'zoo-council-mammal';
  const cvrId = 'id-174';

  test('hmpb ballot can have marginally marked official option adjudicated', async () => {
    const marginalMarkOptionIds = ['kangaroo', 'elephant'];
    const cvrContestTag: CvrContestTag = {
      isResolved: false,
      isUndetected: false,
      cvrId,
      contestId,
      hasMarginalMark: true,
    };

    apiMock.expectGetWriteInCandidates([], contestId);

    const data = buildContestAdjudicationData({
      contestId,
      votes: [],
      marginalMarkOptionIds,
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId);

    await waitForBallotById('id-174');
    expect(screen.queryAllByText(/review marginal mark/i).length).toEqual(
      marginalMarkOptionIds.length
    );
    expect(getButtonByName('confirm')).toBeDisabled();

    // address one marginal mark by clicking it's checkbox, making it valid
    expect(screen.queryByText(/valid/i)).toBeNull();
    expect(getCheckboxByName('kangaroo')).not.toBeChecked();
    userEvent.click(getCheckboxByName('kangaroo'));
    expect(getCheckboxByName('kangaroo')).toBeChecked();

    // check adjudication caption, removal of one flag
    expect(screen.queryByText(/valid/i)).toBeInTheDocument();
    expect(screen.queryAllByText(/review marginal mark/i).length).toEqual(1);

    // address the other by dismissing the flag, making it invalid
    expect(screen.queryByText(/invalid/i)).toBeNull();
    expect(getCheckboxByName('elephant')).not.toBeChecked();
    userEvent.click(getButtonByName('dismiss'));
    expect(getCheckboxByName('elephant')).not.toBeChecked();

    // check adjudication caption, removal of last flag
    expect(screen.queryByText(/invalid/i)).toBeInTheDocument();
    expect(screen.queryByText(/review marginal mark/i)).toBeNull();
    expect(getButtonByName('confirm')).toBeEnabled();

    apiMock.expectAdjudicateCvrContest(
      formAdjudicatedCvrContest(cvrId, {
        kangaroo: { type: 'candidate-option', hasVote: true },
      })
    );
    apiMock.expectGetWriteInCandidates([], contestId);

    userEvent.click(getButtonByName('confirm'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test('hmpb ballot can have marginally marked write-in adjudicated', async () => {
    const cvrContestTag: CvrContestTag = {
      isResolved: false,
      isUndetected: false,
      cvrId,
      contestId,
      hasMarginalMark: true,
      hasWriteIn: true,
    };
    const writeInRecord: WriteInRecord = {
      status: 'pending',
      id: '1',
      cvrId,
      contestId,
      electionId,
      optionId: 'write-in-0',
      isUnmarked: true,
    };

    apiMock.expectGetWriteInCandidates([], contestId);

    const data = buildContestAdjudicationData({
      contestId,
      votes: [],
      writeInRecords: [writeInRecord],
      marginalMarkOptionIds: ['write-in-0'],
      tag: cvrContestTag,
    });
    const { onClose } = renderScreen(data, cvrId);

    await waitForBallotById('id-174');
    expect(getButtonByName('confirm')).toBeDisabled();

    const writeIn0Checkbox = screen.getAllByRole('checkbox', {
      name: /write-in/i,
    })[0];
    expect(writeIn0Checkbox).not.toBeChecked();

    // The marginal mark flag will not show since write-in adjudication is showing
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryAllByText(/marginal mark/i).length).toEqual(0);
    expect(screen.queryByText(/ambiguous write-in/i)).toBeNull();

    // Click the checkbox to adjudicate as valid vote
    userEvent.click(writeIn0Checkbox);
    expect(
      screen.getAllByRole('checkbox', {
        name: /write-in/i,
      })[0]
    ).toBeChecked();

    // Click again to adjudicate as invalid
    userEvent.click(writeIn0Checkbox);
    expect(
      screen.getAllByRole('checkbox', {
        name: /write-in/i,
      })[0]
    ).not.toBeChecked();

    // Caption should now show as it is fully adjudicated
    expect(screen.queryByText(/ambiguous write-in/i)).toBeInTheDocument();
    expect(screen.queryByText(/invalid/i)).toBeInTheDocument();

    // Click again to bring back the search select, adjudicate as candidate
    userEvent.click(writeIn0Checkbox);
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    userEvent.click(getDropdownItemByLabel('Elephant')!);

    expect(getButtonByName('confirm')).toBeEnabled();

    apiMock.expectAdjudicateCvrContest(
      formAdjudicatedCvrContest(cvrId, {
        'write-in-0': {
          type: 'write-in-option',
          hasVote: true,
          candidateType: 'official-candidate',
          candidateId: 'elephant',
        },
      })
    );
    apiMock.expectGetWriteInCandidates([], contestId);

    userEvent.click(getButtonByName('confirm'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('candidate ordering', () => {
  test('candidate ordering respects ballot style rotation', async () => {
    const famousNamesElectionDefinition =
      electionFamousNames2021Fixtures.readElectionDefinition();
    const testContestId = 'mayor';
    const testBallotStyleGroupId1 = '1-1' as BallotStyleGroupId;

    // Ballot style 1-1: Sherlock Holmes (party 0) first, then Thomas Edison
    apiMock.expectGetWriteInCandidates([], testContestId);

    const data1 = buildContestAdjudicationData({
      electionDef: famousNamesElectionDefinition,
      contestId: testContestId,
      votes: [],
      writeInRecords: [
        {
          status: 'pending',
          id: '1',
          cvrId: 'id-174',
          contestId: testContestId,
          electionId: famousNamesElectionDefinition.election.id,
          optionId: 'write-in-0',
        },
      ],
      tag: {
        isResolved: false,
        isUndetected: false,
        cvrId: 'id-174',
        contestId: testContestId,
        hasWriteIn: true,
      },
      ballotStyleGroupId: testBallotStyleGroupId1,
    });
    renderScreen(data1, 'id-174', {
      electionDef: famousNamesElectionDefinition,
      ballotImages: buildHmpbBallotImages('id-174', testContestId, {
        optionLayouts: [],
      }),
    });

    await waitForBallotById('id-174');

    // Verify both candidates exist using findByText
    await screen.findByText('Sherlock Holmes');
    await screen.findByText('Thomas Edison');

    // Get all checkboxes in DOM order
    // In ballot style 1-1, Sherlock Holmes should appear before Thomas Edison
    const allCheckboxes = screen.getAllByRole('checkbox');
    expect(allCheckboxes).toHaveLength(3); // two candidates and one write-in
    within(allCheckboxes[0]).getByText(/Sherlock Holmes/i);
    within(allCheckboxes[1]).getByText(/Thomas Edison/i);
    within(allCheckboxes[2]).getByText(/Write-In/i);

    // Verify write-in dropdown options are also in rotated order
    let writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect, { key: 'ArrowDown' });

    writeInSearchSelect = screen.getByRole('combobox');
    expect(writeInSearchSelect).toHaveAttribute('aria-expanded', 'true');

    const dropdownOptions = screen
      .getAllByText(/Sherlock Holmes|Thomas Edison/i)
      .filter((el) => el.getAttribute('aria-disabled') === 'false');

    expect(dropdownOptions).toHaveLength(2);
    // Verify the order of the dropdown options
    within(dropdownOptions[0]).getByText(/Sherlock Holmes/i);
    within(dropdownOptions[1]).getByText(/Thomas Edison/i);

    // Close the dropdown
    userEvent.keyboard('{Escape}');
  });

  test('candidate ordering respects ballot style rotation for a different ballot style', async () => {
    const famousNamesElectionDefinition =
      electionFamousNames2021Fixtures.readElectionDefinition();
    const testContestId = 'mayor';
    // Ballot style 1-4: Thomas Edison first, then Sherlock Holmes
    apiMock.expectGetWriteInCandidates([], testContestId);

    const data2 = buildContestAdjudicationData({
      electionDef: famousNamesElectionDefinition,
      contestId: testContestId,
      votes: [],
      writeInRecords: [
        {
          status: 'pending',
          id: '2',
          cvrId: 'id-175',
          contestId: testContestId,
          electionId: famousNamesElectionDefinition.election.id,
          optionId: 'write-in-0',
        },
      ],
      tag: {
        isResolved: false,
        isUndetected: false,
        cvrId: 'id-175',
        contestId: testContestId,
        hasWriteIn: true,
      },
      ballotStyleGroupId: '1-4' as BallotStyleGroupId,
    });
    renderScreen(data2, 'id-175', {
      electionDef: famousNamesElectionDefinition,
      ballotImages: buildHmpbBallotImages('id-175', testContestId, {
        optionLayouts: [],
      }),
    });

    await waitForBallotById('id-175');

    // Verify both candidates exist
    await screen.findByText('Sherlock Holmes');
    await screen.findByText('Thomas Edison');

    // Get checkboxes for ballot style 1-4
    // Note: Cross-endorsed candidates appear only once, so Sherlock (party 2) is the same as Sherlock (party 0)
    const allCheckboxes2 = screen.getAllByRole('checkbox');
    expect(allCheckboxes2).toHaveLength(3); // Edison, Sherlock (cross-endorsed, so only one), Write-In
    within(allCheckboxes2[0]).getByText(/Thomas Edison/i);
    within(allCheckboxes2[1]).getByText(/Sherlock Holmes/i);
    within(allCheckboxes2[2]).getByText(/Write-In/i);

    // Verify write-in dropdown options are also in rotated order for ballot style 1-4
    let writeInSearchSelect2 = screen.getByRole('combobox');
    expect(writeInSearchSelect2).toHaveAttribute('aria-expanded', 'false');
    fireEvent.keyDown(writeInSearchSelect2, { key: 'ArrowDown' });

    writeInSearchSelect2 = screen.getByRole('combobox');
    expect(writeInSearchSelect2).toHaveAttribute('aria-expanded', 'true');

    const dropdownOptions2 = screen
      .getAllByText(/Sherlock Holmes|Thomas Edison/i)
      .filter((el) => el.getAttribute('aria-disabled') === 'false');

    expect(dropdownOptions2).toHaveLength(2);
    // Verify the order of the dropdown options
    within(dropdownOptions2[0]).getByText(/Thomas Edison/i);
    within(dropdownOptions2[1]).getByText(/Sherlock Holmes/i);
  });

  test('cross-endorsed candidates appear only once in adjudication UI', async () => {
    const famousNamesElectionDefinition =
      electionFamousNames2021Fixtures.readElectionDefinition();
    const testContestId = 'mayor';
    const testCvrId = 'id-174';
    const testBallotStyleGroupId = '1-1' as BallotStyleGroupId;

    // Ballot style 1-1 has: Sherlock Holmes (party 0), Sherlock Holmes (party 2), Thomas Edison
    apiMock.expectGetWriteInCandidates([], testContestId);

    const data = buildContestAdjudicationData({
      electionDef: famousNamesElectionDefinition,
      contestId: testContestId,
      votes: ['sherlock-holmes'],
      tag: {
        isResolved: false,
        isUndetected: false,
        cvrId: testCvrId,
        contestId: testContestId,
        hasWriteIn: false,
      },
      ballotStyleGroupId: testBallotStyleGroupId,
    });
    renderScreen(data, testCvrId, {
      electionDef: famousNamesElectionDefinition,
      ballotImages: buildHmpbBallotImages(testCvrId, testContestId, {
        optionLayouts: [],
      }),
    });

    await waitForBallotById('id-174');

    // Verify candidates exist
    await screen.findByText('Sherlock Holmes');
    await screen.findByText('Thomas Edison');

    // Sherlock Holmes should appear exactly once despite being cross-endorsed (party 0 and party 2)
    const sherlockCheckboxes = screen.getAllByRole('checkbox', {
      name: /Sherlock Holmes/i,
    });
    expect(sherlockCheckboxes).toHaveLength(1);
    expect(sherlockCheckboxes[0]).toBeChecked();

    // Verify Thomas Edison also appears once
    const edisonCheckboxes = screen.getAllByRole('checkbox', {
      name: /Thomas Edison/i,
    });
    expect(edisonCheckboxes).toHaveLength(1);
  });
});
